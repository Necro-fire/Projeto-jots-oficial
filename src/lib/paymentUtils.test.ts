import { describe, expect, it } from "vitest";
import { distributeAmountInCents } from "@/lib/paymentUtils";

describe("distributeAmountInCents", () => {
  it("distributes remaining cents without changing the registered total", () => {
    const installments = distributeAmountInCents(185.69, 3);

    expect(installments).toEqual([61.9, 61.9, 61.89]);
    expect(installments.reduce((sum, installment) => sum + installment, 0)).toBeCloseTo(185.69, 2);
  });

  it("returns no installments for an invalid installment count", () => {
    expect(distributeAmountInCents(100, 0)).toEqual([]);
    expect(distributeAmountInCents(100, 1.5)).toEqual([]);
  });
});
