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
