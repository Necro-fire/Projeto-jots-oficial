export const INTEREST_RATES: Record<number, number> = {
  1: 3.75,
  2: 5.39,
  3: 6.72,
  4: 6.85,
  5: 7.57,
  6: 8.28,
  7: 8.99,
  8: 9.69,
  9: 10.38,
  10: 11.76,
  11: 11.78,
  12: 12.40,
};

// Boleto interest rates per period AFTER 30 days
const BOLETO_RATE_PER_PERIOD: Record<string, number> = {
  "15": 3,  // 3% per 15-day period after 30d
  "30": 6,  // 6% per 30-day period after 30d
};

export interface BoletoMetaInfo {
  installments: number;
  intervalDays: number;
}

function parseBoletoMetaFromMethod(method: string): BoletoMetaInfo | null {
  const match = method.match(/Boleto\s+(\d+)x\/(\d+)d/i);
  if (!match) return null;
  return {
    installments: parseInt(match[1], 10),
    intervalDays: parseInt(match[2], 10),
  };
}

function getBoletoInstallmentValues(installments: number, intervalDays: number, total: number): { values: number[]; finalTotal: number } {
  const JUROS_RATE = 0.06;
  const valorBase = total / installments;
  // 15d: interest from 3rd installment; 30d: interest from 2nd installment
  const firstInterestInstallment = intervalDays <= 15 ? 3 : 2;

  const values: number[] = [];
  let finalTotal = 0;
  for (let i = 1; i <= installments; i++) {
    const val = i >= firstInterestInstallment
      ? Math.round(valorBase * (1 + JUROS_RATE) * 100) / 100
      : Math.round(valorBase * 100) / 100;
    values.push(val);
    finalTotal += val;
  }
  return { values, finalTotal };
}

// Keep backward compat - returns total interest rate percentage (approximate)
function getBoletoInterestRate(installments: number, intervalDays: number): number {
  const firstInterestInstallment = intervalDays <= 15 ? 3 : 2;
  const withInterest = Math.max(0, installments - firstInterestInstallment + 1);
  return withInterest > 0 ? 6 : 0;
}

export const PAYMENT_LABELS: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao: "Cartão de Crédito",
  debito: "Cartão de Débito",
  boleto: "Boleto",
  prazo: "Prazo",
};

export interface PaymentDisplayInfo {
  label: string;
  originalTotal: number;
  finalTotal: number;
  hasInterest: boolean;
  installments?: number;
  installmentValue?: number;
  rate?: number;
}

/**
 * Parse payment_method string and compute display values.
 * payment_method can be:
 *   "Cartão de Crédito 3x"
 *   "Pix"
 *   "Boleto 4x/15d"
 *   "Cartão 3x/Pix" (split)
 */
export function parsePaymentDisplay(
  paymentMethod: string,
  total: number,
  fallbackBoletoMeta?: BoletoMetaInfo | null
): PaymentDisplayInfo {
  const isCreditCard = paymentMethod.toLowerCase().includes("cartão de crédito") ||
                        paymentMethod.toLowerCase().includes("cartao");

  const boletoMeta = parseBoletoMetaFromMethod(paymentMethod) ||
    (paymentMethod.toLowerCase().includes("boleto") ? fallbackBoletoMeta ?? null : null);

  if (boletoMeta) {
    const { installments, intervalDays } = boletoMeta;
    const { values, finalTotal } = getBoletoInstallmentValues(installments, intervalDays, total);
    const ratePercent = getBoletoInterestRate(installments, intervalDays);

    if (ratePercent > 0) {
      return {
        label: `Boleto ${installments}x/${intervalDays}d`,
        originalTotal: total,
        finalTotal,
        hasInterest: true,
        installments,
        installmentValue: finalTotal / installments,
        rate: ratePercent,
      };
    }

    return {
      label: `Boleto ${installments}x/${intervalDays}d`,
      originalTotal: total,
      finalTotal: total,
      hasInterest: false,
      installments,
      installmentValue: total / installments,
    };
  }

  const installmentMatch = paymentMethod.match(/(\d+)x/);
  const installments = installmentMatch ? parseInt(installmentMatch[1], 10) : undefined;

  if (isCreditCard && installments && INTEREST_RATES[installments]) {
    const rate = INTEREST_RATES[installments];
    const finalTotal = total * (1 + rate / 100);
    const installmentValue = finalTotal / installments;
    return {
      label: `Cartão de Crédito ${installments}x`,
      originalTotal: total,
      finalTotal,
      hasInterest: true,
      installments,
      installmentValue,
      rate,
    };
  }

  return {
    label: paymentMethod,
    originalTotal: total,
    finalTotal: total,
    hasInterest: false,
  };
}

/**
 * Extract installment info from the parent venda payment_method for a given split method.
 */
export function extractInstallmentsForSplit(vendaPaymentMethod: string, splitMethod: string): number | undefined {
  const splitKey = splitMethod.toLowerCase();
  const isCard = splitKey.includes("cartao") || splitKey.includes("cartão") || splitKey.includes("crédito") || splitKey.includes("credit");
  if (!isCard) return undefined;

  const directMatch = splitMethod.match(/(\d+)x/);
  if (directMatch) return parseInt(directMatch[1], 10);

  const segments = vendaPaymentMethod.split("/");
  for (const seg of segments) {
    const segLower = seg.toLowerCase().trim();
    if (segLower.includes("cartao") || segLower.includes("cartão") || segLower.includes("crédito")) {
      const match = seg.match(/(\d+)x/);
      if (match) return parseInt(match[1], 10);
    }
  }

  const fullMatch = vendaPaymentMethod.match(/(\d+)x/);
  if (fullMatch) return parseInt(fullMatch[1], 10);

  return undefined;
}

/**
 * Parse boleto meta for split lines from either split method or parent venda method.
 */
export function extractBoletoMetaForSplit(
  vendaPaymentMethod: string,
  splitMethod: string,
  fallbackBoletoMeta?: BoletoMetaInfo | null
): BoletoMetaInfo | null {
  const direct = parseBoletoMetaFromMethod(splitMethod);
  if (direct) return direct;

  if (splitMethod.toLowerCase().includes("boleto")) {
    const segments = vendaPaymentMethod.split("/");
    for (const seg of segments) {
      const segMeta = parseBoletoMetaFromMethod(seg.trim());
      if (segMeta) return segMeta;
    }

    const parentMeta = parseBoletoMetaFromMethod(vendaPaymentMethod);
    if (parentMeta) return parentMeta;

    return fallbackBoletoMeta ?? null;
  }

  return null;
}

/**
 * Parse a split payment with context from the parent venda.
 */
export function parseSplitPaymentDisplay(
  splitMethod: string,
  splitAmount: number,
  vendaPaymentMethod: string,
  fallbackBoletoMeta?: BoletoMetaInfo | null
): PaymentDisplayInfo {
  const boletoMeta = extractBoletoMetaForSplit(vendaPaymentMethod, splitMethod, fallbackBoletoMeta);
  if (boletoMeta) {
    const { installments, intervalDays } = boletoMeta;
    const ratePercent = getBoletoInterestRate(installments, intervalDays);

    if (ratePercent > 0) {
      return {
        label: `Boleto ${installments}x/${intervalDays}d`,
        originalTotal: splitAmount,
        finalTotal: splitAmount,
        hasInterest: true,
        installments,
        installmentValue: splitAmount / installments,
        rate: ratePercent,
      };
    }

    return {
      label: `Boleto ${installments}x/${intervalDays}d`,
      originalTotal: splitAmount,
      finalTotal: splitAmount,
      hasInterest: false,
      installments,
      installmentValue: splitAmount / installments,
    };
  }

  const installments = extractInstallmentsForSplit(vendaPaymentMethod, splitMethod);
  if (installments && INTEREST_RATES[installments]) {
    const rate = INTEREST_RATES[installments];
    const originalTotal = splitAmount / (1 + rate / 100);
    const installmentValue = splitAmount / installments;
    return {
      label: `Cartão de Crédito ${installments}x`,
      originalTotal,
      finalTotal: splitAmount,
      hasInterest: true,
      installments,
      installmentValue,
      rate,
    };
  }

  return {
    label: splitMethod,
    originalTotal: splitAmount,
    finalTotal: splitAmount,
    hasInterest: false,
  };
}

/**
 * Parse split payment method string like "Cartão 3x/Pix"
 * Returns individual method names
 */
export function parseSplitMethods(paymentMethod: string): string[] {
  return paymentMethod.split("/").map(m => m.trim()).filter(Boolean);
}

export function isSplitPayment(paymentMethod: string): boolean {
  return paymentMethod.includes("/");
}

export function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2)}`;
}
