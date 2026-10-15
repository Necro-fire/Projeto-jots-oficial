import { describe, expect, it } from "vitest";

import {
  applyProductFilters, countActiveFilters, createEmptyFilters, getStockLevel, lensTypesOf,
  type FilterableProduct, type ProductFilterValues,
} from "./productFilterLogic";
import { matchesProductFilterSearch } from "./productSearch";

const frame = (over: Partial<FilterableProduct>): FilterableProduct => ({
  model: "Modelo", status: "active", is_acessorio: false, stock: 5, retail_price: 100, ...over,
});

const withFilters = (over: Partial<ProductFilterValues>): ProductFilterValues => ({ ...createEmptyFilters(), ...over });

const names = (list: FilterableProduct[]) => list.map(p => p.model);

describe("applyProductFilters — seleção múltipla", () => {
  const products = [
    frame({ model: "Vermelho", cor_armacao: "Vermelho" }),
    frame({ model: "Azul", cor_armacao: "Azul" }),
    frame({ model: "Vermelho+Azul", cor_armacao: "Vermelho, Azul" }),
    frame({ model: "Vermelho+Amarelo", cor_armacao: "Vermelho, Amarelo" }),
    frame({ model: "Amarelo", cor_armacao: "Amarelo" }),
  ];

  it("cores marcadas incluem produtos com qualquer uma delas", () => {
    const result = applyProductFilters(products, withFilters({ corArmacao: ["Vermelho", "Azul"] }));
    expect(names(result)).toEqual(["Vermelho", "Azul", "Vermelho+Azul", "Vermelho+Amarelo"]);
  });

  it("sem nada marcado não filtra", () => {
    expect(applyProductFilters(products, createEmptyFilters())).toHaveLength(5);
  });

  it("vários estilos", () => {
    const list = [frame({ model: "A", estilo: "Aviador" }), frame({ model: "R", estilo: "Redondo" }), frame({ model: "Q", estilo: "Quadrado" })];
    expect(names(applyProductFilters(list, withFilters({ estilo: ["Aviador", "Quadrado"] })))).toEqual(["A", "Q"]);
  });

  it("campos diferentes se combinam com E", () => {
    const list = [
      frame({ model: "1", estilo: "Aviador", cor_armacao: "Preto" }),
      frame({ model: "2", estilo: "Aviador", cor_armacao: "Azul" }),
      frame({ model: "3", estilo: "Redondo", cor_armacao: "Preto" }),
    ];
    expect(names(applyProductFilters(list, withFilters({ estilo: ["Aviador"], corArmacao: ["Preto", "Vermelho"] })))).toEqual(["1"]);
  });
});

describe("applyProductFilters — correções", () => {
  it("masculino traz unissex; unissex traz só unissex", () => {
    const list = [
      frame({ model: "M", genero: "Masculino" }),
      frame({ model: "F", genero: "Feminino" }),
      frame({ model: "U", genero: "Unissex" }),
    ];
    expect(names(applyProductFilters(list, withFilters({ genero: ["Masculino"] })))).toEqual(["M", "U"]);
    expect(names(applyProductFilters(list, withFilters({ genero: ["Unissex"] })))).toEqual(["U"]);
  });

  it("acessórios não passam em filtros de medida", () => {
    const list = [
      frame({ model: "Armação", lens_size: 52 }),
      frame({ model: "Acessório", is_acessorio: true, lens_size: 0 }),
    ];
    expect(names(applyProductFilters(list, withFilters({ filterLensSize: ["52"] })))).toEqual(["Armação"]);
    expect(names(applyProductFilters(list, withFilters({ filterLensSize: ["0"] })))).toEqual([]);
  });

  it("armações não passam em 'Nenhuma' cor de acessório", () => {
    const list = [
      frame({ model: "Armação", cor_acessorio: "" }),
      frame({ model: "Estojo", is_acessorio: true, cor_acessorio: "" }),
    ];
    expect(names(applyProductFilters(list, withFilters({ corAcessorio: ["Nenhuma"] })))).toEqual(["Estojo"]);
  });

  it("tipo de haste vazio conta como Comum", () => {
    const list = [frame({ model: "Sem", tipo_haste: "" }), frame({ model: "360", tipo_haste: "360" })];
    expect(names(applyProductFilters(list, withFilters({ tipoHaste: ["Comum"] })))).toEqual(["Sem"]);
  });

  it("tipo de lente do clip-on (JSON) é filtrável", () => {
    const list = [
      frame({ model: "Clip", tipo_lente: JSON.stringify([{ tipo: "Azul", cor: "" }, { tipo: "Rosa", cor: "" }]) }),
      frame({ model: "Solar", tipo_lente: "Preto Total" }),
    ];
    expect(names(applyProductFilters(list, withFilters({ tipoLente: ["Rosa"] })))).toEqual(["Clip"]);
    expect(names(applyProductFilters(list, withFilters({ tipoLente: ["Preto Total", "Azul"] })))).toEqual(["Clip", "Solar"]);
  });

  it("cor da haste", () => {
    const list = [frame({ model: "P", cor_haste: "Preto" }), frame({ model: "D", cor_haste: "Dourado, Preto" }), frame({ model: "A", cor_haste: "Azul" })];
    expect(names(applyProductFilters(list, withFilters({ corHaste: ["Preto"] })))).toEqual(["P", "D"]);
  });

  it("produtos inativos ficam de fora", () => {
    expect(applyProductFilters([frame({ status: "inativo" })], createEmptyFilters())).toHaveLength(0);
  });

  it("faixa de preço", () => {
    const list = [frame({ model: "50", retail_price: 50 }), frame({ model: "150", retail_price: 150 })];
    expect(names(applyProductFilters(list, withFilters({ priceMin: "100" })))).toEqual(["150"]);
    expect(names(applyProductFilters(list, withFilters({ priceMax: "100" })))).toEqual(["50"]);
  });
});

describe("getStockLevel", () => {
  it("sem mínimo configurado só há normal e esgotado", () => {
    expect(getStockLevel(0, 0)).toBe("out_of_stock");
    expect(getStockLevel(-2, 0)).toBe("out_of_stock");
    expect(getStockLevel(1, 0)).toBe("normal");
  });

  it("com mínimo: crítico até metade, baixo até o mínimo", () => {
    expect(getStockLevel(2, 10)).toBe("critical");
    expect(getStockLevel(5, 10)).toBe("critical");
    expect(getStockLevel(6, 10)).toBe("low");
    expect(getStockLevel(10, 10)).toBe("low");
    expect(getStockLevel(11, 10)).toBe("normal");
  });

  it("filtro de status usa o estoque mínimo do produto", () => {
    const list = [frame({ model: "baixo", stock: 4, min_stock: 5 }), frame({ model: "ok", stock: 20, min_stock: 5 })];
    expect(names(applyProductFilters(list, withFilters({ stockStatus: ["low"] })))).toEqual(["baixo"]);
  });
});

describe("busca", () => {
  const p = { model: "Ray Ban", referencia: "RB-3025", cor_armacao: "Degradê Marrom", estilo: "Aviador" };

  it("ignora acentos e maiúsculas", () => {
    expect(matchesProductFilterSearch(p, "DEGRADE")).toBe(true);
  });

  it("todas as palavras precisam aparecer, em qualquer campo", () => {
    expect(matchesProductFilterSearch(p, "aviador marrom")).toBe(true);
    expect(matchesProductFilterSearch(p, "aviador azul")).toBe(false);
  });
});

describe("helpers", () => {
  it("lensTypesOf", () => {
    expect(lensTypesOf("")).toEqual([]);
    expect(lensTypesOf("Preto Total")).toEqual(["Preto Total"]);
    expect(lensTypesOf('[{"tipo":"Azul","cor":""}]')).toEqual(["Azul"]);
  });

  it("countActiveFilters conta cada campo uma vez", () => {
    expect(countActiveFilters(withFilters({ estilo: ["A", "B"], priceMin: "10", tipoItem: "normal" }))).toBe(3);
    expect(countActiveFilters(withFilters({ filial: ["1"] }), { ignoreFilial: true })).toBe(0);
  });
});
