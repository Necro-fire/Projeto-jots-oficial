import { describe, expect, it } from "vitest";

import { __productImageFooterTestUtils } from "@/lib/productImageFooter";

describe("productImageFooter detection", () => {
  it("detects a legacy dark footer band and removes it from the bottom", () => {
    const scanStart = 620;
    const imageHeight = 1000;
    const metrics = Array.from({ length: 380 }, (_, index) => {
      if (index < 290) {
        return { darkRatio: 0.04, luma: 188 };
      }

      return { darkRatio: 0.34, luma: 92 };
    });

    expect(
      __productImageFooterTestUtils.detectFooterBandStartFromMetrics(metrics, scanStart, imageHeight),
    ).toBe(910);
  });

  it("detects the explicit separator line for newly generated footers", () => {
    const scanStart = 640;
    const metrics = Array.from({ length: 160 }, () => ({ darkRatio: 0.08, luma: 172 }));

    metrics[98] = { darkRatio: 1, luma: 8 };
    metrics[99] = { darkRatio: 1, luma: 10 };
    for (let index = 100; index < metrics.length; index++) {
      metrics[index] = { darkRatio: 0.3, luma: 96 };
    }

    expect(__productImageFooterTestUtils.detectFooterSeparatorStartFromMetrics(metrics, scanStart)).toBe(738);
  });

  it("does not crop images that do not contain a footer", () => {
    const scanStart = 620;
    const imageHeight = 1000;
    const metrics = Array.from({ length: 380 }, () => ({ darkRatio: 0.06, luma: 186 }));

    expect(
      __productImageFooterTestUtils.detectFooterBandStartFromMetrics(metrics, scanStart, imageHeight),
    ).toBeNull();
  });
});