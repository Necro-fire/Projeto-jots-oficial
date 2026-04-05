import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFilial } from "@/contexts/FilialContext";

export interface BoletoAlerta {
  id: string;
  venda_id: string;
  filial_id: string;
  parcela_numero: number;
  total_parcelas: number;
  valor_parcela: number;
  data_vencimento: string;
  status: string;
  intervalo_dias: number;
  created_at: string;
  // joined
  venda_number?: number;
  client_name?: string;
}

export function useBoletoAlertas() {
  const [alertas, setAlertas] = useState<BoletoAlerta[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedFilial } = useFilial();

  const fetchAlertas = useCallback(async () => {
    let query = (supabase as any)
      .from("boleto_alertas")
      .select("*, vendas(number, client_name)")
      .order("data_vencimento", { ascending: true });

    if (selectedFilial !== "all") {
      query = query.eq("filial_id", selectedFilial);
    }

    const { data, error } = await query;
    if (!error && data) {
      const mapped = (data as any[]).map((row) => ({
        ...row,
        venda_number: row.vendas?.number,
        client_name: row.vendas?.client_name || "Cliente avulso",
      }));
      setAlertas(mapped);
    }
    setLoading(false);
  }, [selectedFilial]);

  useEffect(() => {
    fetchAlertas();

    // Realtime subscription
    const channel = supabase
      .channel("boleto-alertas-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "boleto_alertas" }, () => {
        fetchAlertas();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "vendas" }, () => {
        // Refetch when new sale is created (may include boleto)
        setTimeout(() => fetchAlertas(), 1500);
      })
      .subscribe();

    // Polling every 60s for time-based urgency changes
    const interval = window.setInterval(fetchAlertas, 60_000);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(interval);
    };
  }, [fetchAlertas]);

  const updateStatus = useCallback(async (alertaId: string, newStatus: string) => {
    const { error } = await (supabase as any)
      .from("boleto_alertas")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", alertaId);
    if (error) throw new Error(error.message);
  }, []);

  return { alertas, loading, refetch: fetchAlertas, updateStatus };
}

export async function createBoletoAlertas(
  vendaId: string,
  filialId: string,
  valorBoleto: number,
  totalParcelas: number,
  intervaloDias: number
) {
  const alertas = [];
  const now = new Date();
  const valorBase = valorBoleto / totalParcelas;
  const JUROS_RATE = intervaloDias <= 15 ? 0.03 : 0.06; // 3% for 15d, 6% for 30d

  // 15d: interest from 3rd installment (1st & 2nd no interest)
  // 30d: interest from 2nd installment (1st no interest)
  const firstInterestInstallment = intervaloDias <= 15 ? 3 : 2;

  for (let i = 1; i <= totalParcelas; i++) {
    const vencimento = new Date(now);
    vencimento.setDate(vencimento.getDate() + i * intervaloDias);

    const valorParcela = i < firstInterestInstallment
      ? valorBase
      : Math.round(valorBase * (1 + JUROS_RATE) * 100) / 100;

    alertas.push({
      venda_id: vendaId,
      filial_id: filialId,
      parcela_numero: i,
      total_parcelas: totalParcelas,
      valor_parcela: valorParcela,
      data_vencimento: vencimento.toISOString(),
      status: "pendente",
      intervalo_dias: intervaloDias,
    });
  }

  const { error } = await (supabase as any)
    .from("boleto_alertas")
    .insert(alertas);

  if (error) throw new Error(error.message);
}
