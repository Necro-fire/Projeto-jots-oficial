/**
 * Generates a deterministic hash string for a product based on its key attributes.
 * Used to detect duplicate products before insertion.
 * Óculos: regra original. Acessórios: identidade composta (NCM não é único).
 */
export function generateProductHash(data: {
  referencia: string;
  classificacao: string;
  categoriaIdade: string;
  genero: string;
  estilo: string;
  corArmacao: string;
  materialAro: string;
  materialHaste: string;
  lensSize: number;
  alturaLente: number;
  bridgeSize: number;
  templeSize: number;
  tipoLente: string;
  isAcessorio: boolean;
  subcategoriaAcessorio: string;
  ncm?: string;
  corAcessorio?: string;
  materialAcessorio?: string;
}): string {
  if (data.isAcessorio) {
    const n = (v?: string) => (v && v.trim() ? v.trim() : "NA");
    return ["ACC", n(data.ncm), n(data.subcategoriaAcessorio), n(data.corAcessorio), n(data.materialAcessorio)]
      .join("|").toUpperCase();
  }
  const ref = data.referencia || "NA";
  const cls = data.classificacao || "NA";
  return [
    ref,
    cls,
    data.corArmacao || "NA",
    data.genero || "NA",
    data.estilo || "NA",
    data.materialAro || "NA",
    String(data.lensSize || 0),
    String(data.alturaLente || 0),
    String(data.bridgeSize || 0),
    String(data.templeSize || 0),
  ].join("-").toUpperCase();
}
