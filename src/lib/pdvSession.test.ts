import { describe, it, expect, beforeEach } from "vitest";
import { loadPdvSession, savePdvSession, clearPdvSession } from "./pdvSession";

describe("sacola do PDV mantida ao navegar", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("guarda e restaura produtos, cliente e forma de pagamento", () => {
    savePdvSession({
      filial: "2",
      productIds: ["a", "a", "b"],
      selectedClient: "c1",
      paymentMethod: "pix",
      consignacaoMode: false,
    });

    expect(loadPdvSession()).toEqual({
      filial: "2",
      productIds: ["a", "a", "b"],
      selectedClient: "c1",
      paymentMethod: "pix",
      consignacaoMode: false,
    });
  });

  it("não guarda preços (só ids de produto)", () => {
    savePdvSession({ filial: "1", productIds: ["a"], selectedClient: "", paymentMethod: "", consignacaoMode: false });
    const raw = window.sessionStorage.getItem("jots:pdv-session:v1") || "";
    expect(raw).not.toMatch(/price|preco|valor/i);
  });

  it("sacola vazia e sem cliente limpa o armazenamento", () => {
    savePdvSession({ filial: "1", productIds: ["a"], selectedClient: "", paymentMethod: "", consignacaoMode: false });
    savePdvSession({ filial: "1", productIds: [], selectedClient: "", paymentMethod: "", consignacaoMode: false });
    expect(loadPdvSession()).toBeNull();
  });

  it("ignora conteúdo corrompido", () => {
    window.sessionStorage.setItem("jots:pdv-session:v1", "{nao-e-json");
    expect(loadPdvSession()).toBeNull();
    window.sessionStorage.setItem("jots:pdv-session:v1", JSON.stringify({ productIds: "x" }));
    expect(loadPdvSession()).toBeNull();
  });

  it("clearPdvSession remove a sacola", () => {
    savePdvSession({ filial: "1", productIds: ["a"], selectedClient: "c", paymentMethod: "", consignacaoMode: false });
    clearPdvSession();
    expect(loadPdvSession()).toBeNull();
  });
});
