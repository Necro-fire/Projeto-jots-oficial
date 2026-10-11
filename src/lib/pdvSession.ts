/**
 * Sacola do PDV que sobrevive à navegação: o operador pode abrir outras telas
 * (clientes, produtos, caixa...) e voltar sem perder a seleção.
 * Guarda só ids (nunca preços): ao restaurar, os produtos são relidos do banco.
 */
export interface PdvSnapshot {
  filial: string;
  productIds: string[];      // um id por unidade na sacola
  selectedClient: string;
  paymentMethod: string;
  consignacaoMode: boolean;
}

const KEY = "jots:pdv-session:v1";

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function loadPdvSession(): PdvSnapshot | null {
  const st = storage();
  if (!st) return null;
  try {
    const raw = st.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<PdvSnapshot>;
    if (!data || !Array.isArray(data.productIds)) return null;
    return {
      filial: String(data.filial ?? ""),
      productIds: data.productIds.filter((id): id is string => typeof id === "string"),
      selectedClient: String(data.selectedClient ?? ""),
      paymentMethod: String(data.paymentMethod ?? ""),
      consignacaoMode: Boolean(data.consignacaoMode),
    };
  } catch {
    return null;
  }
}

/** Grava a sacola; sacola vazia e sem cliente limpa o armazenamento. */
export function savePdvSession(snap: PdvSnapshot): void {
  const st = storage();
  if (!st) return;
  try {
    if (snap.productIds.length === 0 && !snap.selectedClient) {
      st.removeItem(KEY);
    } else {
      st.setItem(KEY, JSON.stringify(snap));
    }
  } catch {
    // armazenamento cheio/bloqueado: a sacola segue funcionando só em memória
  }
}

export function clearPdvSession(): void {
  const st = storage();
  try {
    st?.removeItem(KEY);
  } catch {
    // ignora
  }
}
