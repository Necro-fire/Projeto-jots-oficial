import { useState, useEffect, useCallback, useRef } from "react";
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

/** Espera para agrupar eventos seguidos (um boleto de 12 parcelas gera 12 eventos) em uma busca só. */
const REFETCH_DEBOUNCE_MS = 400;
/** Só refaz a busca ao voltar para a aba se ela ficou escondida por mais que isso. */
const VISIBILITY_REFETCH_AFTER_MS = 60_000;
const PAGE_SIZE = 1000;

export function useBoletoAlertas() {
  const [alertas, setAlertas] = useState<BoletoAlerta[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedFilial } = useFilial();
  const fetchSeq = useRef(0);

  const fetchAlertas = useCallback(async () => {
    // Uma resposta antiga (outra filial, evento anterior) não pode sobrescrever a mais nova.
    const seq = ++fetchSeq.current;
    const all: any[] = [];

    // PostgREST corta em 1000 linhas: busca em páginas para não perder parcelas futuras.
    for (let page = 0; page < 1000; page++) {
      let query = (supabase as any)
        .from("boleto_alertas")
        .select("*, vendas(number, client_name)")
        .order("data_vencimento", { ascending: true })
        .order("id", { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (selectedFilial !== "all") {
        query = query.eq("filial_id", selectedFilial);
      }

      const { data, error } = await query;
      if (error || !data) {
        if (seq === fetchSeq.current) setLoading(false);
        return;
      }
      all.push(...(data as any[]));
      if ((data as any[]).length < PAGE_SIZE) break;
    }

    if (seq !== fetchSeq.current) return;
    setAlertas(
      all.map((row) => ({
        ...row,
        venda_number: row.vendas?.number,
        client_name: row.vendas?.client_name || "Cliente avulso",
      })),
    );
    setLoading(false);
  }, [selectedFilial]);

  useEffect(() => {
    const seqCounter = fetchSeq;
    fetchAlertas();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const refetchSoon = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fetchAlertas();
      }, REFETCH_DEBOUNCE_MS);
    };

    // Boletos de venda nova chegam como INSERT em boleto_alertas (criados na mesma transação da venda).
    let firstSubscribe = true;
    const channel = supabase
      .channel("boleto-alertas-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "boleto_alertas" }, refetchSoon)
      .subscribe((status: string) => {
        // Ao reconectar, eventos podem ter sido perdidos.
        if (status === "SUBSCRIBED") {
          if (firstSubscribe) firstSubscribe = false;
          else refetchSoon();
        }
      });

    // A classificação por vencimento é recalculada na tela (ver BellNotifications);
    // aqui só se atualiza após a aba ficar escondida por um tempo, quando eventos podem ter sido perdidos.
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (hiddenAt !== null && Date.now() - hiddenAt > VISIBILITY_REFETCH_AFTER_MS) {
        hiddenAt = null;
        refetchSoon();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timer !== null) clearTimeout(timer);
      seqCounter.current++;
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisibility);
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
