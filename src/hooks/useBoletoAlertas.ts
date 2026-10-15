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
  /** 'cancelar_no_banco' | 'reemitir_no_banco' | null: ação que alguém precisa fazer no banco. */
  aviso?: string | null;
  aviso_detalhe?: string | null;
  // joined
  venda_number?: number;
  venda_code?: string;
  venda_status?: string;
  client_name?: string;
}

/** Espera para agrupar eventos seguidos (um boleto de 12 parcelas gera 12 eventos) em uma busca só. */
const REFETCH_DEBOUNCE_MS = 400;
/** Só refaz a busca ao voltar para a aba se ela ficou escondida por mais que isso. */
const VISIBILITY_REFETCH_AFTER_MS = 60_000;
const PAGE_SIZE = 1000;
/** Parcelas geradas/canceladas só entram se venceram nesta janela; pendentes e avisos entram sempre. */
const HISTORY_DAYS = 90;

/** Colunas/funções da migração 20261015120000 ainda não existem neste banco. */
const isMissingSchema = (error: { code?: string } | null | undefined) =>
  error?.code === "42703" || error?.code === "PGRST202" || error?.code === "42883";

export function useBoletoAlertas() {
  const [alertas, setAlertas] = useState<BoletoAlerta[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedFilial } = useFilial();
  const fetchSeq = useRef(0);

  const fetchAlertas = useCallback(async () => {
    // Uma resposta antiga (outra filial, evento anterior) não pode sobrescrever a mais nova.
    const seq = ++fetchSeq.current;
    const all: any[] = [];
    const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
    const legacyWindow = `status.eq.pendente,data_vencimento.gte.${since}`;
    const fullWindow = `status.eq.pendente,aviso.not.is.null,data_vencimento.gte.${since}`;
    let legacySchema = false;

    // PostgREST corta em 1000 linhas: busca em páginas para não perder parcelas futuras.
    for (let page = 0; page < 1000; page++) {
      let query = (supabase as any)
        .from("boleto_alertas")
        .select("*, vendas(number, sale_code, client_name, status)")
        .or(legacySchema ? legacyWindow : fullWindow)
        .order("data_vencimento", { ascending: true })
        .order("id", { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (selectedFilial !== "all") {
        query = query.eq("filial_id", selectedFilial);
      }

      const { data, error } = await query;
      if (error && !legacySchema && isMissingSchema(error)) {
        // Banco sem a coluna "aviso": repete a busca sem ela.
        legacySchema = true;
        page--;
        continue;
      }
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
        venda_code: row.vendas?.sale_code || undefined,
        venda_status: row.vendas?.status,
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

  const updateStatus = useCallback((alertaId: string, newStatus: string) => alterarStatusBoleto(alertaId, newStatus), []);
  const resolveAviso = useCallback(async (alertaId: string) => {
    await resolverAvisoBoleto(alertaId);
    await fetchAlertas();
  }, [fetchAlertas]);

  return { alertas, loading, refetch: fetchAlertas, updateStatus, resolveAviso };
}

/** Muda o status de uma parcela (e mantém o status da venda em dia). Cai para o UPDATE direto em bancos sem a RPC. */
export async function alterarStatusBoleto(alertaId: string, status: string) {
  const { error } = await (supabase as any).rpc("alterar_status_boleto", { _alerta_id: alertaId, _status: status });
  if (!error) return;
  if (!isMissingSchema(error)) throw new Error(error.message);
  const { error: legacy } = await (supabase as any)
    .from("boleto_alertas")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", alertaId);
  if (legacy) throw new Error(legacy.message);
}

/** Muda o status de todas as parcelas ativas da venda e o status do boleto na lista de Vendas. */
export async function definirStatusBoletoVenda(vendaId: string, status: string) {
  const { error } = await (supabase as any).rpc("definir_status_boleto_venda", { _venda_id: vendaId, _status: status });
  if (!error) return;
  if (!isMissingSchema(error)) throw new Error(error.message);
  const { error: legacy } = await (supabase as any).from("vendas").update({ status_boleto: status }).eq("id", vendaId);
  if (legacy) throw new Error(legacy.message);
}

/** Marca como feita a ação pedida no aviso (baixa ou reemissão do boleto no banco). */
export async function resolverAvisoBoleto(alertaId: string) {
  const { error } = await (supabase as any).rpc("resolver_aviso_boleto", { _alerta_id: alertaId });
  if (error) throw new Error(error.message);
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
