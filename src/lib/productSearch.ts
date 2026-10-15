/**
 * Standard product search filter.
 * Matches by barcode (priority), code, referencia, or model name.
 * Supports manual typing and barcode scanner input.
 */
export function matchesProductSearch(
  product: { barcode?: string; code?: string; referencia?: string; model?: string },
  query: string
): boolean {
  if (!query) return true;
  const q = query.toLowerCase().trim();

  // Barcode — exact or partial match (highest priority, but included in general filter)
  if (product.barcode && product.barcode.toLowerCase().includes(q)) return true;

  // Code (código da peça)
  if (product.code && product.code.toLowerCase().includes(q)) return true;

  // Referência
  if (product.referencia && product.referencia.toLowerCase().includes(q)) return true;

  // Model / nome
  if (product.model && product.model.toLowerCase().includes(q)) return true;

  return false;
}

/** Minúsculas e sem acento: "Degradê" e "degrade" passam a ser o mesmo texto. */
export function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const FILTER_SEARCH_FIELDS = [
  "barcode", "code", "referencia", "model",
  "color", "cor_armacao", "cor_haste", "cor_acessorio",
  "estilo", "classificacao", "category",
  "categoria_acessorio", "tipo_acessorio", "subcategoria_acessorio",
] as const;

/**
 * Busca da tela de filtros: cada palavra digitada precisa aparecer em algum campo do produto
 * (código, referência, modelo, cor, estilo, classificação, acessório), ignorando acentos.
 */
export function matchesProductFilterSearch(product: object, query: string): boolean {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const source = product as Record<string, unknown>;
  const haystack = FILTER_SEARCH_FIELDS.map(f => normalizeSearchText(source[f])).join(" ");
  return tokens.every(t => haystack.includes(t));
}

/**
 * Check for exact barcode match (for scanner auto-add in PDV).
 */
export function findByExactBarcode<T extends { barcode?: string; status?: string; stock?: number }>(
  products: T[],
  barcode: string
): T | undefined {
  if (!barcode.trim()) return undefined;
  return products.find(
    p => p.barcode && p.barcode === barcode.trim() && p.status === "active" && (p.stock ?? 0) > 0
  );
}
