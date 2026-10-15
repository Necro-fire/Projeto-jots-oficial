import { matchesProductFilterSearch } from "@/lib/productSearch";

export type StockLevel = "normal" | "low" | "critical" | "out_of_stock";

/**
 * Valores dos filtros de produto.
 * Campos em lista aceitam várias opções: o produto passa se tiver QUALQUER uma delas (lista vazia = sem filtro).
 * Filtros de campos diferentes se combinam com "E".
 */
export interface ProductFilterValues {
  search: string;
  /** "all" | "normal" | "acessorio" */
  tipoItem: string;
  classificacaoProduto: string[];
  categoriaIdade: string[];
  genero: string[];
  estilo: string[];
  corArmacao: string[];
  corHaste: string[];
  materialAro: string[];
  materialHaste: string[];
  tipoLente: string[];
  polarizado: string[];
  tipoHaste: string[];
  ponteArmacao: string[];
  tamanhoArmacao: string[];
  filterLensSize: string[];
  filterAlturaLente: string[];
  filterBridgeSize: string[];
  filterTempleSize: string[];
  catAcessorio: string[];
  tipoAcessorio: string[];
  corAcessorio: string[];
  priceMin: string;
  priceMax: string;
  filial: string[];
  stockStatus: string[];
}

export type ProductFilterListKey = {
  [K in keyof ProductFilterValues]: ProductFilterValues[K] extends string[] ? K : never;
}[keyof ProductFilterValues];

export function createEmptyFilters(): ProductFilterValues {
  return {
    search: "",
    tipoItem: "all",
    classificacaoProduto: [],
    categoriaIdade: [],
    genero: [],
    estilo: [],
    corArmacao: [],
    corHaste: [],
    materialAro: [],
    materialHaste: [],
    tipoLente: [],
    polarizado: [],
    tipoHaste: [],
    ponteArmacao: [],
    tamanhoArmacao: [],
    filterLensSize: [],
    filterAlturaLente: [],
    filterBridgeSize: [],
    filterTempleSize: [],
    catAcessorio: [],
    tipoAcessorio: [],
    corAcessorio: [],
    priceMin: "",
    priceMax: "",
    filial: [],
    stockStatus: [],
  };
}

/** Campos que só fazem sentido para armações (limpos ao escolher "Acessório"). */
export const FRAME_FILTER_KEYS: ProductFilterListKey[] = [
  "classificacaoProduto", "categoriaIdade", "genero", "estilo", "corArmacao", "corHaste",
  "materialAro", "materialHaste", "tipoLente", "polarizado", "tipoHaste", "ponteArmacao",
  "tamanhoArmacao", "filterLensSize", "filterAlturaLente", "filterBridgeSize", "filterTempleSize",
];

/** Campos que só fazem sentido para acessórios (limpos ao escolher "Produto Normal"). */
export const ACCESSORY_FILTER_KEYS: ProductFilterListKey[] = ["catAcessorio", "tipoAcessorio", "corAcessorio"];

/**
 * Nível de estoque. Sem estoque mínimo configurado (0) só existem "normal" e "esgotado";
 * com mínimo: até metade dele é crítico, até o mínimo é baixo (mesma regra dos alertas do painel).
 */
export function getStockLevel(stock: number, categoryMin: number): StockLevel {
  if (!(stock > 0)) return "out_of_stock";
  if (categoryMin > 0) {
    if (stock <= Math.floor(categoryMin / 2)) return "critical";
    if (stock <= categoryMin) return "low";
  }
  return "normal";
}

/** Legacy compat */
export function getStockStatus(stock: number, minStock?: number): "in_stock" | "low_stock" | "out_of_stock" {
  const level = getStockLevel(stock, minStock ?? 0);
  if (level === "out_of_stock") return "out_of_stock";
  if (level === "critical" || level === "low") return "low_stock";
  return "in_stock";
}

/** Campos que o filtro lê; todos opcionais para aceitar qualquer linha de produto. */
export interface FilterableProduct {
  model?: string;
  code?: string;
  referencia?: string;
  barcode?: string;
  color?: string;
  stock?: number;
  min_stock?: number;
  retail_price?: number;
  filial_id?: string;
  status?: string;
  category?: string;
  is_acessorio?: boolean;
  categoria_idade?: string;
  genero?: string;
  estilo?: string;
  cor_armacao?: string;
  cor_haste?: string;
  material_aro?: string;
  material_haste?: string;
  tipo_lente?: string;
  polarizado?: string;
  tipo_haste?: string;
  ponte_armacao?: string;
  lens_size?: number;
  altura_lente?: number;
  bridge_size?: number;
  temple_size?: number;
  categoria_acessorio?: string;
  tipo_acessorio?: string;
  cor_acessorio?: string;
}

/** Texto salvo no banco (valor único ou lista separada por vírgula) → lista de valores. */
export function splitValues(value?: string | null): string[] {
  return (value || "").split(",").map(s => s.trim()).filter(Boolean);
}

/** Clip-on guarda as lentes como JSON em tipo_lente: [{ tipo, cor }]. Os demais, texto simples. */
export function lensTypesOf(tipoLente?: string | null): string[] {
  const raw = (tipoLente || "").trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(l => String(l?.tipo ?? "").trim()).filter(Boolean);
      }
    } catch {
      // texto que apenas começa com "[": trata como valor simples
    }
  }
  return [raw];
}

const anyOf = (selected: string[], values: string[]) => values.some(v => selected.includes(v));

export function productHasStockLevel(p: FilterableProduct): StockLevel {
  return getStockLevel(Number(p.stock) || 0, Number(p.min_stock) || 0);
}

export function applyProductFilters<T extends FilterableProduct>(products: T[], filters: ProductFilterValues): T[] {
  const priceMin = filters.priceMin !== "" ? Number(filters.priceMin) : NaN;
  const priceMax = filters.priceMax !== "" ? Number(filters.priceMax) : NaN;
  const f = filters;

  return products.filter(p => {
    if (p.status === "inativo") return false;
    if (f.search && !matchesProductFilterSearch(p, f.search)) return false;

    const isAcc = !!p.is_acessorio;
    if (f.tipoItem === "normal" && isAcc) return false;
    if (f.tipoItem === "acessorio" && !isAcc) return false;

    if (f.classificacaoProduto.length && !f.classificacaoProduto.includes(p.category || "")) return false;
    if (f.categoriaIdade.length && !f.categoriaIdade.includes(p.categoria_idade || "")) return false;

    if (f.genero.length) {
      const g = p.genero || "";
      // Masculino/Feminino também trazem os Unissex; "Unissex" traz só os Unissex.
      const ok = f.genero.includes(g)
        || (g === "Unissex" && (f.genero.includes("Masculino") || f.genero.includes("Feminino")));
      if (!ok) return false;
    }

    if (f.estilo.length && !f.estilo.includes(p.estilo || "")) return false;
    if (f.corArmacao.length && !anyOf(f.corArmacao, splitValues(p.cor_armacao))) return false;
    if (f.corHaste.length && !anyOf(f.corHaste, splitValues(p.cor_haste))) return false;
    if (f.materialAro.length && !f.materialAro.includes(p.material_aro || "")) return false;
    if (f.materialHaste.length && !f.materialHaste.includes(p.material_haste || "")) return false;
    if (f.tipoLente.length && !anyOf(f.tipoLente, lensTypesOf(p.tipo_lente))) return false;
    if (f.polarizado.length && !f.polarizado.includes(p.polarizado || "")) return false;
    if (f.ponteArmacao.length && !f.ponteArmacao.includes(p.ponte_armacao || "")) return false;

    // Armações sem tipo de haste informado são "Comum".
    if (f.tipoHaste.length) {
      if (isAcc) return false;
      if (!f.tipoHaste.includes(p.tipo_haste || "Comum")) return false;
    }

    // Medidas pertencem só às armações: acessórios nunca passam por estes filtros.
    const lens = p.lens_size || 0;
    const bridge = p.bridge_size || 0;
    const temple = p.temple_size || 0;
    if (f.tamanhoArmacao.length && (isAcc || !f.tamanhoArmacao.includes(`${lens}-${bridge}-${temple}`))) return false;
    if (f.filterLensSize.length && (isAcc || !f.filterLensSize.includes(String(lens)))) return false;
    if (f.filterAlturaLente.length && (isAcc || !f.filterAlturaLente.includes(String(p.altura_lente || 0)))) return false;
    if (f.filterBridgeSize.length && (isAcc || !f.filterBridgeSize.includes(String(bridge)))) return false;
    if (f.filterTempleSize.length && (isAcc || !f.filterTempleSize.includes(String(temple)))) return false;

    // Filtros de acessório: armações nunca passam.
    if (f.catAcessorio.length && (!isAcc || !f.catAcessorio.includes(p.categoria_acessorio || ""))) return false;
    if (f.tipoAcessorio.length && (!isAcc || !f.tipoAcessorio.includes(p.tipo_acessorio || ""))) return false;
    if (f.corAcessorio.length) {
      if (!isAcc) return false;
      const cores = splitValues(p.cor_acessorio);
      const ok = f.corAcessorio.some(c =>
        c === "Nenhuma" ? cores.length === 0 || cores.includes("Nenhuma") : cores.includes(c),
      );
      if (!ok) return false;
    }

    if (f.filial.length && !f.filial.includes(p.filial_id || "")) return false;
    if (f.stockStatus.length && !f.stockStatus.includes(productHasStockLevel(p))) return false;

    if (!Number.isNaN(priceMin) || !Number.isNaN(priceMax)) {
      const price = Number(p.retail_price) || 0;
      if (!Number.isNaN(priceMin) && price < priceMin) return false;
      if (!Number.isNaN(priceMax) && price > priceMax) return false;
    }
    return true;
  });
}

/** Quantos filtros estão ativos (cada campo conta 1, independente de quantas opções marcadas). */
export function countActiveFilters(f: ProductFilterValues, options: { ignoreFilial?: boolean } = {}): number {
  let count = f.tipoItem !== "all" ? 1 : 0;
  for (const key of [...FRAME_FILTER_KEYS, ...ACCESSORY_FILTER_KEYS, "stockStatus"] as ProductFilterListKey[]) {
    if (f[key].length) count++;
  }
  if (!options.ignoreFilial && f.filial.length) count++;
  if (f.priceMin) count++;
  if (f.priceMax) count++;
  return count;
}
