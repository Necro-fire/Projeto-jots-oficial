import { describe, expect, it } from "vitest";

import { normalizeProductModelName, resolveProductModelName } from "./productModel";

describe("resolveProductModelName", () => {
  it("prefers a custom accessory name over the NCM", () => {
    expect(resolveProductModelName({
      isAcessorio: true,
      model: "Óculos de sol premium",
      referencia: "90049090",
    })).toBe("Óculos de sol premium");
  });

  it("falls back to the reference when there is no custom name", () => {
    expect(resolveProductModelName({
      isAcessorio: true,
      model: "",
      referencia: "90049090",
    })).toBe("90049090");
  });

  it("collapses a product name duplicated exactly twice", () => {
    expect(normalizeProductModelName("029-516MBM029-516MBM")).toBe("029-516MBM");
  });
});
