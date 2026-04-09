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
  total: number;
  formasPagamento: string[];
}

const SEPARATOR = "─".repeat(48);
const DOUBLE_SEPARATOR = "═".repeat(48);

function padColumns(left: string, right: string, width = 48): string {
  const maxLeft = width - right.length - 1;
  const truncLeft = left.length > maxLeft ? left.substring(0, maxLeft) : left;
  const spaces = width - truncLeft.length - right.length;
  return truncLeft + " ".repeat(Math.max(spaces, 1)) + right;
}

function centerText(text: string, width = 48): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return " ".repeat(pad) + text;
}

function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2)}`;
}

const CupomFiscal = forwardRef<HTMLDivElement, { data: CupomFiscalData }>(
  ({ data }, ref) => {
    const { empresa, venda, items, subtotal, desconto, total, formasPagamento } = data;

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
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "4px" }}>
          <div style={{ fontWeight: "bold", fontSize: "14px" }}>{empresa.nome}</div>
          {empresa.cnpj && <div>CNPJ: {empresa.cnpj}</div>}
          {empresa.inscricaoEstadual && <div>IE: {empresa.inscricaoEstadual}</div>}
          {empresa.endereco && (
            <div style={{ fontSize: "11px", wordBreak: "break-word" }}>{empresa.endereco}</div>
          )}
        </div>

        <pre style={{ margin: 0, fontFamily: "inherit", fontSize: "inherit", whiteSpace: "pre-wrap" }}>
{DOUBLE_SEPARATOR}
{centerText("CUPOM FISCAL")}
{SEPARATOR}
{padColumns("Data:", venda.dataHora)}
{padColumns("Venda:", venda.codigo || `#${venda.numero}`)}
{padColumns("Operador:", venda.operador || "—")}
{SEPARATOR}
{padColumns("ITEM", "TOTAL")}
{SEPARATOR}
{items.map((item, i) => {
  const line1 = `${String(i + 1).padStart(2, "0")}  ${item.codigo}`;
  const line2 = `    ${item.descricao}`;
  const line3 = padColumns(
    `    ${item.quantidade}x ${formatCurrency(item.valorUnitario)}`,
    formatCurrency(item.total)
  );
  return `${line1}\n${line2}\n${line3}`;
}).join("\n")}
{SEPARATOR}
{padColumns("Subtotal:", formatCurrency(subtotal))}
{desconto > 0 ? padColumns("Desconto:", `- ${formatCurrency(desconto)}`) + "\n" : ""}{padColumns("TOTAL:", formatCurrency(total))}
{SEPARATOR}
{centerText("FORMA(S) DE PAGAMENTO")}
{formasPagamento.map(f => centerText(f)).join("\n")}
{DOUBLE_SEPARATOR}
{centerText("Obrigado pela preferência!")}
{centerText("Volte sempre!")}
        </pre>
      </div>
    );
  }
);

CupomFiscal.displayName = "CupomFiscal";

export default CupomFiscal;
