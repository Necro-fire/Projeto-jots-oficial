import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFilial } from "@/contexts/FilialContext";

export interface DbProduct {
  id: string;
  code: string;
  model: string;
  color: string;
  material: string;
  lens_size: number;
  bridge_size: number;
  temple_size: number;
  category: string;
  description: string;
  retail_price: number;
  wholesale_price: number;
  wholesale_min_qty: number;
  stock: number;
  min_stock: number;
  status: string;
  image_url: string;
  barcode: string;
  filial_id: string;
  created_at: string;
  referencia: string;
  categoria_idade: string;
  genero: string;
  estilo: string;
  cor_armacao: string;
  material_aro: string;
  material_haste: string;
  altura_lente: number;
  tipo_lente: string;
  subcategoria_acessorio: string;
  is_acessorio: boolean;
  tipo_produto_id: string | null;
  hash_produto: string;
  custo: number;
}

export interface DbClient {
  id: string;
  responsible_name: string;
  store_name: string;
  cnpj: string;
  cpf: string;
  city: string;
  state: string;
  bairro: string;
  phone: string;
  whatsapp: string;
  email: string;
  credit_limit: number;
  status: string;
  filial_id: string;
  created_at: string;
  tipo_cliente: string;
  endereco: string;
  data_nascimento: string | null;
  observacoes: string;
  nome_fantasia?: string;
}

export interface DbVenda {
  id: string;
  number: number;
  sale_code: string;
  client_id: string | null;
  client_name: string;
  seller_name: string;
  total: number;
  discount: number;
  payment_method: string;
  origin: string;
  filial_id: string;
  created_at: string;
  status: string;
  cancelled_at: string | null;
  cancelled_by_id: string | null;
  cancelled_by_name: string;
  motivo_cancelamento: string;
}

export interface DbVendaItem {
  id: string;
  venda_id: string;
  produto_id: string;
  product_code: string;
  product_model: string;
  quantity: number;
  unit_price: number;
  total: number;
  custo_unitario: number;
}

export interface DbEstoque {
  id: string;
  produto_id: string;
  filial_id: string;
  quantidade: number;
  created_at: string;
}

let channelCounter = 0;

/** Janela padrão (dias) para tabelas de movimento. `null` carrega todo o histórico. */
export const DEFAULT_HISTORY_DAYS = 90;

/** Eventos Realtime que chegam em sequência (ex.: venda de 10 itens) viram uma única atualização. */
const REALTIME_BATCH_MS = 200;

interface RealtimeOptions {
  /** Filtra por filial selecionada (padrão: sim). */
  filterFilial?: boolean;
  /** Só linhas com created_at dentro dos últimos N dias. `null`/ausente: sem janela. */
  sinceDays?: number | null;
}

// Mesma ordenação usada na busca no servidor, aplicada ao cache quando chega um evento Realtime.
function compareRows(table: string) {
  const str = (v: unknown) => String(v ?? "");
  return (a: any, b: any): number => {
    if (table === "produtos") {
      return str(a.model).localeCompare(str(b.model)) || str(a.id).localeCompare(str(b.id));
    }
    if (table === "clientes") {
      return str(a.store_name).localeCompare(str(b.store_name)) || str(a.id).localeCompare(str(b.id));
    }
    if (table === "venda_items") {
      return str(a.id).localeCompare(str(b.id));
    }
    return str(b.created_at).localeCompare(str(a.created_at)) || str(a.id).localeCompare(str(b.id));
  };
}

interface ApplyChangesOptions {
  table: string;
  filialId: string | null;
  sinceIso: string | null;
}

/**
 * Aplica uma lista de eventos Realtime, na ordem em que chegaram, ordenando uma única vez no fim.
 * Devolve a mesma referência quando nada mudou (evita re-renderizar a lista inteira).
 */
export function applyRealtimeChanges<T extends { id: string }>(
  prev: T[],
  events: { eventType: string; new?: unknown; old?: unknown }[],
  { table, filialId, sinceIso }: ApplyChangesOptions,
): T[] {
  if (events.length === 0) return prev;

  const byId = new Map<string, T>();
  for (const row of prev) byId.set(row.id, row);
  let changed = false;

  for (const event of events) {
    if (event.eventType === "DELETE") {
      const id = (event.old as { id?: string } | undefined)?.id;
      if (id && byId.delete(id)) changed = true;
      continue;
    }

    const row = event.new as (T & { filial_id?: string; created_at?: string }) | undefined;
    if (!row?.id) continue;

    const outOfFilial = filialId !== null && row.filial_id !== filialId;
    const outOfWindow = !!sinceIso && !!row.created_at && row.created_at < sinceIso;
    if (outOfFilial || outOfWindow) {
      if (byId.delete(row.id)) changed = true;
      continue;
    }

    byId.set(row.id, row);
    changed = true;
  }

  if (!changed) return prev;
  return Array.from(byId.values()).sort(compareRows(table));
}

// Última lista conhecida por tabela/filial/janela: ao voltar para a tela os dados aparecem na hora
// e a busca em segundo plano os revalida. Nunca sobrevive ao logout.
const dataCache = new Map<string, unknown[]>();
const EMPTY_ROWS: never[] = [];

export function clearDataCache() {
  dataCache.clear();
}

try {
  (supabase as any).auth?.onAuthStateChange?.((event: string) => {
    if (event === "SIGNED_OUT") dataCache.clear();
  });
} catch {
  // ambiente sem auth (testes): sem cache a limpar
}

function useRealtimeTable<T extends { id: string }>(table: string, options: RealtimeOptions = {}) {
  const { filterFilial = true, sinceDays = null } = options;
  const { selectedFilial, isFilialRestricted } = useFilial();
  const channelRef = useRef<any>(null);

  // Quem pode ver várias filiais baixa o conjunto completo uma única vez e filtra na tela:
  // trocar de filial não vai ao servidor. Usuário preso a uma filial baixa só a dela.
  const filialId = filterFilial && isFilialRestricted && selectedFilial !== "all" ? selectedFilial : null;
  const cacheKey = `${table}|${filialId ?? "-"}|${sinceDays ?? "all"}`;

  // `key` diz a que filial/janela as linhas pertencem: nunca mostramos a lista de outra filial.
  const [state, setState] = useState<{ key: string; rows: T[] } | null>(() => {
    const hit = dataCache.get(cacheKey) as T[] | undefined;
    return hit ? { key: cacheKey, rows: hit } : null;
  });
  const cached = dataCache.get(cacheKey) as T[] | undefined;
  const rows: T[] = state?.key === cacheKey ? state.rows : (cached ?? (EMPTY_ROWS as T[]));
  const loading = state?.key !== cacheKey && !cached;

  const needsClientFilter = filterFilial && filialId === null && selectedFilial !== "all";
  const data = useMemo(
    () => (needsClientFilter
      ? rows.filter((row) => (row as { filial_id?: string }).filial_id === selectedFilial)
      : rows),
    [rows, needsClientFilter, selectedFilial],
  );

  const rowsRef = useRef<T[]>(rows);
  const fetchSeq = useRef(0);

  const sinceIso = useCallback(() => {
    if (sinceDays === null || sinceDays === undefined) return null;
    return new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  }, [sinceDays]);

  const commit = useCallback((rows: T[]) => {
    rowsRef.current = rows;
    dataCache.set(cacheKey, rows);
    setState({ key: cacheKey, rows });
  }, [cacheKey]);

  const fetchData = useCallback(async () => {
    // Uma resposta lenta de uma filial/janela anterior não pode sobrescrever a atual.
    const seq = ++fetchSeq.current;
    // Supabase/PostgREST caps a single request at 1000 rows: busca em páginas sequenciais.
    const PAGE_SIZE = 1000;
    const all: T[] = [];
    let from = 0;
    let failed = false;
    const since = sinceIso();

    // Limite de segurança contra laço infinito em resposta inesperada
    for (let page = 0; page < 1000; page++) {
      let query = (supabase as any).from(table).select("*");
      if (filialId) {
        query = query.eq("filial_id", filialId);
      }
      if (since) {
        query = query.gte("created_at", since);
      }
      // Ordenação determinística (id desempata e mantém a paginação estável).
      // venda_items não tem created_at.
      if (table === "produtos") {
        query = query.order("model", { ascending: true }).order("id", { ascending: true });
      } else if (table === "clientes") {
        query = query.order("store_name", { ascending: true }).order("id", { ascending: true });
      } else if (table === "venda_items") {
        query = query.order("id", { ascending: true });
      } else {
        query = query.order("created_at", { ascending: false }).order("id", { ascending: true });
      }
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data: rows, error } = await query;
      if (error) {
        console.error(`Erro ao carregar ${table}:`, error.message);
        failed = true;
        break;
      }
      const batch = (rows ?? []) as T[];
      all.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    if (seq !== fetchSeq.current) return;
    // Em falha mantém o que já havia (ou lista vazia) e encerra o "carregando".
    commit(failed ? rowsRef.current : all);
  }, [table, filialId, sinceIso, commit]);

  useEffect(() => {
    const seqCounter = fetchSeq;
    rowsRef.current = (dataCache.get(cacheKey) as T[] | undefined) ?? [];
    fetchData();

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    let pending: { eventType: string; new?: unknown; old?: unknown }[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const events = pending;
      pending = [];
      const next = applyRealtimeChanges(rowsRef.current, events, {
        table,
        filialId,
        sinceIso: sinceIso(),
      });
      if (next !== rowsRef.current) commit(next);
    };

    const topic = `${table}-rt-${++channelCounter}`;
    let firstSubscribe = true;
    const channel = supabase
      .channel(topic)
      .on("postgres_changes", { event: "*", schema: "public", table }, (payload: any) => {
        pending.push(payload);
        if (timer === null) timer = setTimeout(flush, REALTIME_BATCH_MS);
      })
      .subscribe((status: string) => {
        // Ao reconectar, eventos podem ter sido perdidos: refaz a busca uma vez.
        if (status === "SUBSCRIBED") {
          if (firstSubscribe) firstSubscribe = false;
          else fetchData();
        }
      });

    channelRef.current = channel;
    return () => {
      if (timer !== null) clearTimeout(timer);
      seqCounter.current++;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetchData, commit, cacheKey, table, filialId, sinceIso]);

  return { data, loading, refetch: fetchData };
}

export function useProducts() {
  return useRealtimeTable<DbProduct>("produtos");
}

export function useClients() {
  return useRealtimeTable<DbClient>("clientes");
}

/** Dias a carregar para cobrir o período escolhido na tela (mínimo: janela padrão). */
export function historyDaysFor(from: Date): number {
  const days = Math.ceil((Date.now() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(DEFAULT_HISTORY_DAYS, days);
}

/** Vendas dos últimos `sinceDays` dias (padrão 90). `sinceDays: null` carrega todo o histórico. */
export function useVendas(options: { sinceDays?: number | null } = {}) {
  const { sinceDays = DEFAULT_HISTORY_DAYS } = options;
  return useRealtimeTable<DbVenda>("vendas", { sinceDays });
}

export function useEstoque() {
  return useRealtimeTable<DbEstoque>("estoque");
}

export function useVendaItems() {
  return useRealtimeTable<DbVendaItem>("venda_items", { filterFilial: false });
}

export async function generateProductCodes(): Promise<{ code: string; barcode: string }> {
  const { data, error } = await (supabase as any).rpc("generate_product_codes");
  if (error) throw new Error(error.message);
  return data as { code: string; barcode: string };
}

export async function findProductByHash(hash: string, filialId: string): Promise<DbProduct | null> {
  const { data, error } = await (supabase as any)
    .from("produtos")
    .select("*")
    .eq("hash_produto", hash)
    .eq("filial_id", filialId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Soma `quantidade` ao saldo do produto na filial (transação no banco: trava a linha,
 * não deixa o saldo ficar negativo e registra o histórico). Retorna o novo saldo.
 */
export async function upsertEstoque(produtoId: string, filialId: string, quantidade: number) {
  const { data, error } = await supabase.rpc("ajustar_estoque", {
    _produto_id: produtoId,
    _filial_id: filialId,
    _delta: quantidade,
  });
  if (error) throw new Error(error.message);
  return data as number;
}

export interface PaymentSplit {
  method: string;
  amount: number;
  finalAmount?: number;
}

/**
 * Cria a venda numa única transação no banco (RPC `criar_venda`).
 * O servidor valida preços, filial, caixa e estoque; qualquer falha desfaz tudo.
 * Usuário, desconto e totais são determinados pelo banco, não por este payload.
 */
export async function createVenda(
  items: { produto_id: string; product_code: string; product_model: string; quantity: number; unit_price: number; custo_unitario?: number }[],
  clientId: string | null,
  clientName: string,
  paymentMethod: string,
  origin: string,
  filialId: string,
  paymentSplits?: PaymentSplit[],
  finalTotal?: number,
  consignadoIds?: string[]
) {
  const { data, error } = await supabase.rpc("criar_venda", {
    _payload: {
      consignado_ids: consignadoIds && consignadoIds.length > 0 ? consignadoIds : undefined,
      client_id: clientId,
      client_name: clientName,
      payment_method: paymentMethod,
      origin,
      filial_id: filialId,
      total: finalTotal,
      items: items.map(i => ({
        produto_id: i.produto_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
      })),
      splits: paymentSplits?.map(s => ({
        method: s.method,
        amount: s.amount,
        final_amount: s.finalAmount ?? s.amount,
      })),
    },
  });

  if (error) throw new Error(error.message);
  return data as unknown as DbVenda;
}

export async function cancelarVenda(vendaId: string, motivo: string) {
  const { error } = await supabase.rpc("cancelar_venda", {
    _venda_id: vendaId,
    _motivo: motivo,
  });
  if (error) throw new Error(error.message);
}

/** Desfaz o cancelamento da venda inteira: devolve itens, baixa estoque e refaz o lançamento no caixa. */
export async function reverterCancelamentoVenda(vendaId: string, motivo: string) {
  const { error } = await supabase.rpc("reverter_cancelamento_venda", {
    _venda_id: vendaId,
    _motivo: motivo,
  });
  if (error) throw new Error(error.message);
}
