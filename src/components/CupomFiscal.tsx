import { forwardRef } from "react";

export type CupomPagamentoTipo = "DINHEIRO" | "PIX" | "DEBITO" | "CREDITO" | "BOLETO" | "OUTRO";

export interface PagamentoParcela {
  numero: number;
  prazoDias?: number;
  valor: number;
}

export interface PagamentoCupom {
  forma: string;
  tipo: CupomPagamentoTipo;
  valorBase: number;
  acrescimo: number;
  valorFinal: number;
  parcelas: PagamentoParcela[];
}

export interface CupomFiscalData {
  empresa: {
    nome: string;
    cnpj?: string;
    inscricaoEstadual?: string;
    endereco?: string;
  };
  venda: {
    codigo: string;
    numero: number;
    dataHora: string;
    operador: string;
    caixa?: string;
  };
  items: {
    codigo: string;
    descricao: string;
    quantidade: number;
    valorUnitario: number;
    total: number;
  }[];
  subtotal?: number;
  valorOriginal?: number;
  desconto: number;
  valorComDesconto?: number;
  acrescimo?: number;
  total: number;
  formasPagamento?: string[];
  formasPagamentoValores?: number[];
  pagamentos?: PagamentoCupom[];
}

const W = 48;
const SEP = "─".repeat(W);
const DOUBLE_SEP = "═".repeat(W);

export function distribuicaoEmCentavos(totalCents: number, parcelas: number): number[] {
  if (parcelas <= 0) return [];
  const base = Math.floor(totalCents / parcelas);
  const resto = totalCents % parcelas;
  return Array.from({ length: parcelas }, (_, index) => base + (index < resto ? 1 : 0));
}

function toCents(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100);
}

function centsToNumber(value: number): number {
  return value / 100;
}

function inferTipoPagamento(forma: string): CupomPagamentoTipo {
  const normalized = forma.toUpperCase();
  if (normalized.includes("PIX")) return "PIX";
  if (normalized.includes("DINHEIRO")) return "DINHEIRO";
  if (normalized.includes("DÉBITO") || normalized.includes("DEBITO")) return "DEBITO";
  if (normalized.includes("CARTÃO") || normalized.includes("CARTAO") || normalized.includes("CRÉDITO") || normalized.includes("CREDITO")) return "CREDITO";
  if (normalized.includes("BOLETO")) return "BOLETO";
  return "OUTRO";
}

function normalizarParcelas(parcelaInput: PagamentoParcela[] | undefined, valorFinalCents: number, tipo?: CupomPagamentoTipo): PagamentoParcela[] {
  if (Array.isArray(parcelaInput) && parcelaInput.length > 0) {
    return parcelaInput.map((parcela, index) => ({
      numero: parcela.numero ?? index + 1,
      prazoDias: parcela.prazoDias,
      valor: Number.isFinite(parcela.valor) ? parcela.valor : 0,
    }));
  }

  const qtdParcelas = tipo === "BOLETO" ? 2 : 1;
  const valores = distribuicaoEmCentavos(valorFinalCents, qtdParcelas);
  return valores.map((valor, index) => ({
    numero: index + 1,
    prazoDias: tipo === "BOLETO" ? [15, 30][index] ?? 15 : undefined,
    valor: centsToNumber(valor),
  }));
}

export function normalizarCupomData(data?: Partial<CupomFiscalData> | null): CupomFiscalData {
  const valorOriginal = Number(data?.valorOriginal ?? data?.subtotal ?? 0);
  const desconto = Number(data?.desconto ?? 0);
  const acrescimo = Number(data?.acrescimo ?? 0);
  const total = Number(data?.total ?? Math.max(0, valorOriginal - desconto + acrescimo));
  const valorComDesconto = Number(data?.valorComDesconto ?? Math.max(0, valorOriginal - desconto));

  const pagamentosBase = Array.isArray(data?.pagamentos) && data.pagamentos.length > 0
    ? data.pagamentos
    : (Array.isArray(data?.formasPagamento) ? data.formasPagamento.map((forma, index) => ({
        forma,
        tipo: inferTipoPagamento(forma),
        valorBase: Number(data.formasPagamentoValores?.[index] ?? 0),
        acrescimo: 0,
        valorFinal: Number(data.formasPagamentoValores?.[index] ?? 0),
        parcelas: [] as PagamentoParcela[],
      })) : []);

  const pagamentos = pagamentosBase.map((pagamento, index) => {
    const valorFinalCents = toCents(Number(pagamento.valorFinal ?? pagamento.valorBase ?? 0));
    const valorBaseCents = toCents(Number(pagamento.valorBase ?? pagamento.valorFinal ?? 0));
    const acrescimoCents = toCents(Number(pagamento.acrescimo ?? 0));
    const valorFinal = valorBaseCents + acrescimoCents;
    const parcelas = normalizarParcelas(pagamento.parcelas, valorFinal, pagamento.tipo || inferTipoPagamento(pagamento.forma || data?.formasPagamento?.[index] || "OUTRO"));

    return {
      forma: pagamento.forma || data?.formasPagamento?.[index] || `Pagamento ${index + 1}`,
      tipo: pagamento.tipo || inferTipoPagamento(pagamento.forma || data?.formasPagamento?.[index] || "OUTRO"),
      valorBase: centsToNumber(valorBaseCents),
      acrescimo: centsToNumber(acrescimoCents),
      valorFinal: centsToNumber(valorFinal),
      parcelas: parcelas.map((parcela) => ({
        numero: parcela.numero,
        prazoDias: parcela.prazoDias,
        valor: Number(parcela.valor),
      })),
    } satisfies PagamentoCupom;
  });

  const normalizedPayments = pagamentos.length > 0
    ? pagamentos
    : ([{
        forma: "Pagamento",
        tipo: "OUTRO",
        valorBase: total,
        acrescimo: 0,
        valorFinal: total,
        parcelas: [{ numero: 1, valor: total }],
      }] as PagamentoCupom[]);

  return {
    empresa: data?.empresa || { nome: "Empresa" },
    venda: data?.venda || { codigo: "", numero: 0, dataHora: "", operador: "" },
    items: data?.items || [],
    subtotal: valorOriginal,
    valorOriginal,
    desconto,
    valorComDesconto,
    acrescimo,
    total,
    formasPagamento: normalizedPayments.map((p) => p.forma),
    formasPagamentoValores: normalizedPayments.map((p) => p.valorFinal),
    pagamentos: normalizedPayments,
  };
}

export function validarCupom(data?: Partial<CupomFiscalData> | null): { ok: boolean; erros: string[] } {
  const erros: string[] = [];
  const cupom = normalizarCupomData(data);
  const valorOriginalCents = toCents(Number(cupom.valorOriginal ?? cupom.subtotal ?? 0));
  const descontoCents = toCents(Number(cupom.desconto ?? 0));
  const acrescimoCents = toCents(Number(cupom.acrescimo ?? 0));
  const totalCents = toCents(Number(cupom.total ?? 0));
  const esperadoBase = valorOriginalCents - descontoCents + acrescimoCents;

  if (esperadoBase !== totalCents) {
    erros.push(`Valor final inconsistência: esperado ${centsToNumber(esperadoBase)} e recebido ${centsToNumber(totalCents)}.`);
  }

  let somaFormas = 0;
  for (const pagamento of cupom.pagamentos || []) {
    const valorBaseCents = toCents(Number(pagamento.valorBase ?? 0));
    const acrescimoPagCents = toCents(Number(pagamento.acrescimo ?? 0));
    const valorFinalCents = toCents(Number(pagamento.valorFinal ?? 0));

    if (valorBaseCents + acrescimoPagCents !== valorFinalCents) {
      erros.push(`Forma ${pagamento.forma} tem valorBase + acréscimo diferente do valorFinal.`);
    }

    let somaParcelas = 0;
    for (const parcela of pagamento.parcelas || []) {
      const valorParcela = toCents(Number(parcela.valor ?? 0));
      somaParcelas += valorParcela;

      if (pagamento.tipo === "BOLETO" && !(Number(parcela.prazoDias) > 0)) {
        erros.push(`Boleto ${pagamento.forma} possui parcela sem prazoDias válido.`);
      }
    }

    if (somaParcelas !== valorFinalCents) {
      erros.push(`Forma ${pagamento.forma} possui soma de parcelas diferente do valor final.`);
    }

    somaFormas += valorFinalCents;
  }

  if (somaFormas !== totalCents) {
    erros.push(`Soma das formas (${centsToNumber(somaFormas)}) não bate com o total da venda (${centsToNumber(totalCents)}).`);
  }

  return { ok: erros.length === 0, erros };
}

function center(text: string): string {
  const pad = Math.max(0, Math.floor((W - text.length) / 2));
  return " ".repeat(pad) + text;
}

export function linhaComPontos(label: string, valor: string): string {
  const dots = ".".repeat(Math.max(0, W - label.length - 2 - valor.length));
  return `${label}${dots} ${valor}`;
}

function rightAlign(left: string, right: string): string {
  const spaces = Math.max(1, W - left.length - right.length);
  return left + " ".repeat(spaces) + right;
}

function fmtCurrency(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const cents = Math.round(safe * 100);
  const signal = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const reais = Math.floor(absolute / 100);
  const centavos = absolute % 100;
  const formatReais = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(reais);
  return `${signal}R$ ${formatReais},${String(centavos).padStart(2, "0")}`;
}

function fmtCurrencyPad(value: number, padTo = 10): string {
  const s = fmtCurrency(value);
  return s.length < padTo ? " ".repeat(padTo - s.length) + s : s;
}

const CupomFiscal = forwardRef<HTMLDivElement, { data: CupomFiscalData }>(
  ({ data }, ref) => {
    const cupom = normalizarCupomData(data);
    const validation = validarCupom(cupom);

    if (!validation.ok) {
      console.error("Cupom fiscal inválido:", validation.erros);
      return (
        <div
          ref={ref}
          style={{
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: "12px",
            lineHeight: "1.4",
            width: "360px",
            maxWidth: "100%",
            padding: "12px",
            color: "#000",
            background: "#fff",
          }}
        >
          <strong>Cupom fiscal inválido</strong>
          <ul style={{ marginTop: "8px", paddingLeft: "18px" }}>
            {validation.erros.map((erro) => (<li key={erro}>{erro}</li>))}
          </ul>
        </div>
      );
    }

    const { empresa, venda, items } = cupom;
    const [datePart, timePart] = venda.dataHora.includes(" ")
      ? venda.dataHora.split(" ")
      : [venda.dataHora, ""];

    const lines: string[] = [];

    lines.push(center(empresa.nome));
    if (empresa.cnpj) lines.push(center(`CNPJ: ${empresa.cnpj}`));
    if (empresa.inscricaoEstadual) lines.push(center(`IE: ${empresa.inscricaoEstadual}`));
    if (empresa.endereco) lines.push(center(empresa.endereco));
    lines.push("");
    lines.push(DOUBLE_SEP);
    lines.push(center("CUPOM FISCAL"));
    lines.push(DOUBLE_SEP);
    lines.push("");

    lines.push(`DATA: ${datePart}    HORA: ${timePart}`);
    lines.push(`VENDA Nº: ${venda.codigo || String(venda.numero).padStart(6, "0")}`);
    lines.push(`OPERADOR: ${venda.operador || "—"}`);
    if (venda.caixa) lines.push(`CAIXA: ${venda.caixa}`);
    lines.push("");
    lines.push(SEP);
    lines.push("ITEM  CÓD   DESCRIÇÃO");
    lines.push("QTD   VLR UN.           TOTAL ITEM");
    lines.push(SEP);
    lines.push("");

    items.forEach((item, i) => {
      const num = String(i + 1).padEnd(6);
      const cod = String(item.codigo).padEnd(6);
      lines.push(`${num}${cod}${item.descricao}`);
      const qty = String(item.quantidade).padStart(2, "0").padEnd(6);
      const unitStr = fmtCurrencyPad(item.valorUnitario);
      const totalStr = fmtCurrencyPad(item.total);
      lines.push(`      ${qty}${unitStr}        ${totalStr}`);
      lines.push("");
    });

    lines.push(SEP);
    lines.push(rightAlign("VALOR ORIGINAL:", fmtCurrency(Number(cupom.valorOriginal ?? cupom.subtotal ?? 0))));
    if ((cupom.desconto ?? 0) > 0) {
      lines.push(rightAlign("DESCONTO:", fmtCurrency(-Number(cupom.desconto ?? 0))));
    }
    if ((cupom.valorComDesconto ?? 0) > 0) {
      lines.push(rightAlign("VALOR COM DESCONTO:", fmtCurrency(Number(cupom.valorComDesconto ?? 0))));
    }
    if ((cupom.acrescimo ?? 0) > 0) {
      lines.push(rightAlign("ACRÉSCIMO/JUROS:", fmtCurrency(Number(cupom.acrescimo ?? 0))));
    }
    lines.push(rightAlign("VALOR FINAL:", fmtCurrency(Number(cupom.total ?? 0))));
    lines.push("");
    lines.push(DOUBLE_SEP);
    lines.push("");
    lines.push("FORMAS DE PAGAMENTO:");

    for (const pagamento of cupom.pagamentos || []) {
      const valorStr = fmtCurrency(Number(pagamento.valorFinal ?? 0));
      const label = pagamento.parcelas.length > 1
        ? `${pagamento.forma} - ${pagamento.parcelas.length}x`
        : pagamento.forma;

      lines.push(linhaComPontos(label, valorStr));

      if (pagamento.acrescimo > 0) {
        lines.push(linhaComPontos("  Valor", fmtCurrency(Number(pagamento.valorBase ?? 0))));
        lines.push(linhaComPontos("  Acréscimo", fmtCurrency(Number(pagamento.acrescimo ?? 0))));
        lines.push(linhaComPontos("  Valor final", fmtCurrency(Number(pagamento.valorFinal ?? 0))));
      }

      if (pagamento.parcelas.length > 1) {
        pagamento.parcelas.forEach((parcela) => {
          const parcelaLabel = `${parcela.numero}/${pagamento.parcelas.length}`;
          const prazo = parcela.prazoDias ? ` - ${parcela.prazoDias} dias` : "";
          lines.push(linhaComPontos(`  ${parcelaLabel}${prazo}`, fmtCurrency(Number(parcela.valor ?? 0))));
        });
      }
    }

    lines.push("");
    lines.push(DOUBLE_SEP);
    lines.push("");
    lines.push(center("OBRIGADO PELA PREFERÊNCIA!"));
    lines.push(center("VOLTE SEMPRE!"));
    lines.push("");
    lines.push(DOUBLE_SEP);

    return (
      <div
        ref={ref}
        className="cupom-fiscal"
        style={{
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: "12px",
          lineHeight: "1.4",
          width: "360px",
          maxWidth: "100%",
          padding: "8px",
          color: "#000",
          background: "#fff",
        }}
      >
        <pre style={{ margin: 0, fontFamily: "inherit", fontSize: "inherit", whiteSpace: "pre-wrap" }}>
{lines.join("\n")}
        </pre>
      </div>
    );
  }
);

CupomFiscal.displayName = "CupomFiscal";

export default CupomFiscal;
