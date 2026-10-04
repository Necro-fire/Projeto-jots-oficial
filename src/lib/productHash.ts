/**
 * Identidade lógica do produto (não é chave primária — o ID interno continua sendo a identificação técnica).
 * Usada apenas para detectar possíveis duplicidades. NCM e nome são apenas parte do conjunto.
 * Campos operacionais (preço, custo, estoque, datas) NÃO participam.
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
  tipoProduto?: string;
  corAcessorio?: string;
  materialAcessorio?: string;
}): string {
  const n = (v: unknown) => (v === undefined || v === null || v === "" ? "NA" : String(v)).trim();
  if (data.isAcessorio) {
    return [
      "ACC",
      n(data.ncm),
      n(data.subcategoriaAcessorio),
      n(data.corAcessorio),
      n(data.materialAcessorio),
    ].join("|").toUpperCase();
  }
  return [
    n(data.referencia),
    n(data.ncm),
    n(data.tipoProduto),
    n(data.classificacao),
    n(data.categoriaIdade),
    n(data.genero),
    n(data.estilo),
    n(data.corArmacao),
    n(data.materialAro),
    n(data.materialHaste),
    n(data.tipoLente),
    String(data.lensSize || 0),
    String(data.alturaLente || 0),
    String(data.bridgeSize || 0),
    String(data.templeSize || 0),
  ].join("|").toUpperCase();
}
