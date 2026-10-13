export interface ItemLucro {
  venda_id: string;
  quantity: number;
  unit_price: number;
  custo_unitario: number;
}

/** Lucro dos itens que pertencem às vendas ativas: (preço - custo) × quantidade. */
export function calcularLucro(items: ItemLucro[], activeSaleIds: Set<string>): number {
  return items
    .filter((item) => activeSaleIds.has(item.venda_id))
    .reduce((acc, item) => {
      const custo = Number(item.custo_unitario) || 0;
      return acc + (Number(item.unit_price) - custo) * item.quantity;
    }, 0);
}
