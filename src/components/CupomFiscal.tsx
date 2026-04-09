import { forwardRef } from "react";

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
  subtotal: number;
  desconto: number;
  acrescimo?: number;
  total: number;
  formasPagamento: string[];
  formasPagamentoValores?: number[];
}

const W = 48;
const SEP = "─".repeat(W);
const DOUBLE_SEP = "═".repeat(W);

function center(text: string): string {
  const pad = Math.max(0, Math.floor((W - text.length) / 2));
  return " ".repeat(pad) + text;
}

function rightAlign(left: string, right: string): string {
  const spaces = W - left.length - right.length;
  return left + " ".repeat(Math.max(spaces, 1)) + right;
}

function fmtCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function fmtCurrencyPad(value: number, padTo = 10): string {
  const s = fmtCurrency(value);
  return s.length < padTo ? " ".repeat(padTo - s.length) + s : s;
}

const CupomFiscal = forwardRef<HTMLDivElement, { data: CupomFiscalData }>(
  ({ data }, ref) => {
    const { empresa, venda, items, subtotal, desconto, acrescimo, total, formasPagamento, formasPagamentoValores } = data;

    // Split dataHora "dd/MM/yyyy HH:mm" into date and time
    const [datePart, timePart] = venda.dataHora.includes(" ")
      ? venda.dataHora.split(" ")
      : [venda.dataHora, ""];

    const lines: string[] = [];

    // Header
    lines.push(center(empresa.nome));
    if (empresa.cnpj) lines.push(center(`CNPJ: ${empresa.cnpj}`));
    if (empresa.inscricaoEstadual) lines.push(center(`IE: ${empresa.inscricaoEstadual}`));
    if (empresa.endereco) lines.push(center(empresa.endereco));
    lines.push("");
    lines.push(DOUBLE_SEP);
    lines.push(center("CUPOM FISCAL"));
    lines.push(DOUBLE_SEP);
    lines.push("");

    // Sale info
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

    // Items
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

    // Totals
    lines.push(rightAlign("SUBTOTAL:", fmtCurrency(subtotal)));
    lines.push(rightAlign("DESCONTOS:", desconto > 0 ? fmtCurrency(desconto) : "R$ 0,00"));
    if (acrescimo !== undefined && acrescimo > 0) {
      lines.push(rightAlign("ACRÉSCIMOS:", fmtCurrency(acrescimo)));
    } else {
      lines.push(rightAlign("ACRÉSCIMOS:", "R$ 0,00"));
    }
    lines.push("");
    lines.push(SEP);
    lines.push("");
    lines.push(rightAlign("TOTAL:", fmtCurrency(total)));
    lines.push("");
    lines.push(DOUBLE_SEP);
    lines.push("");

    // Payment
    lines.push("FORMA DE PAGAMENTO:");
    formasPagamento.forEach((f, i) => {
      const val = formasPagamentoValores?.[i] ?? total;
      const label = `- ${f}`;
      const valStr = fmtCurrency(val);
      const dots = ".".repeat(Math.max(1, W - label.length - 1 - valStr.length));
      lines.push(`${label} ${dots} ${valStr}`);
    });
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
          width: "302px",
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
