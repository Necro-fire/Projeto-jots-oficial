import * as ExcelJS from "exceljs";
import { maskCpf, maskCnpj, maskCelular, maskCep, formatCentsToDisplay } from "@/lib/masks";
import { format } from "date-fns";

// Column header label mapping to Portuguese
const HEADER_LABELS: Record<string, string> = {
  id: "ID",
  sale_code: "Código Venda",
  number: "Número",
  client_name: "Cliente",
  client_id: "ID Cliente",
  seller_name: "Vendedor",
  payment_method: "Forma de Pagamento",
  total: "Total (R$)",
  discount: "Desconto (R$)",
  status: "Status",
  status_boleto: "Status Boleto",
  origin: "Origem",
  created_at: "Data de Criação",
  filial_id: "Filial",
  // Clientes
  store_name: "Loja",
  responsible_name: "Responsável",
  cpf: "CPF",
  cnpj: "CNPJ",
  phone: "Telefone",
  whatsapp: "WhatsApp",
  email: "E-mail",
  city: "Cidade",
  state: "Estado",
  endereco: "Endereço",
  bairro: "Bairro",
  credit_limit: "Limite de Crédito (R$)",
  tipo_cliente: "Tipo de Cliente",
  inscricao_estadual: "Inscrição Estadual",
  nome_fantasia: "Nome Fantasia",
  observacoes: "Observações",
  telefones: "Telefones",
  data_nascimento: "Data de Nascimento",
  // Funcionários
  nome: "Nome",
  cargo: "Cargo",
  codigo_acesso: "Código de Acesso",
  telefone: "Telefone",
  user_id: "ID Usuário",
  // Produtos / Estoque
  code: "Código",
  model: "Modelo",
  referencia: "Referência",
  description: "Descrição",
  category: "Categoria",
  color: "Cor",
  material: "Material",
  stock: "Estoque",
  min_stock: "Estoque Mínimo",
  retail_price: "Preço Varejo (R$)",
  wholesale_price: "Preço Atacado (R$)",
  custo: "Custo (R$)",
  barcode: "Código de Barras",
  ncm: "NCM",
  estilo: "Estilo",
  genero: "Gênero",
  // Caixa
  caixa_id: "ID Caixa",
  tipo: "Tipo",
  valor: "Valor (R$)",
  descricao: "Descrição",
  forma_pagamento: "Forma de Pagamento",
  usuario_nome: "Usuário",
  usuario_id: "ID Usuário",
  venda_id: "ID Venda",
  // NF-e
  numero: "Número",
  chave_acesso: "Chave de Acesso",
  data_emissao: "Data de Emissão",
  valor_total: "Valor Total (R$)",
  client_cnpj: "CNPJ Cliente",
  fornecedor_nome: "Fornecedor",
  fornecedor_cnpj: "CNPJ Fornecedor",
  tipo_operacao: "Tipo de Operação",
  pdf_url: "URL PDF",
  xml_url: "URL XML",
  empresa_id: "ID Empresa",
  // Custo/Lucro
  codigo: "Código",
  cliente: "Cliente",
  data: "Data",
  receita: "Receita (R$)",
  lucro: "Lucro (R$)",
  margem: "Margem",
};

// Fields that should be hidden from export
const HIDDEN_FIELDS = new Set([
  "id", "filial_id", "user_id", "usuario_id", "client_id",
  "empresa_id", "venda_id", "caixa_id", "hash_produto",
  "pdf_url", "xml_url", "image_url", "tipo_produto_id",
]);

function getPortugueseHeader(key: string): string {
  return HEADER_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function isDateString(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}(T|\s)/.test(value);
}

function isCpfField(key: string): boolean {
  return key === "cpf";
}

function isCnpjField(key: string): boolean {
  return key === "cnpj" || key === "client_cnpj" || key === "fornecedor_cnpj";
}

function isPhoneField(key: string): boolean {
  return ["phone", "whatsapp", "telefone", "celular"].includes(key);
}

function isCurrencyField(key: string): boolean {
  return ["total", "discount", "valor", "credit_limit", "retail_price",
    "wholesale_price", "custo", "valor_total", "valor_parcela",
    "valor_abertura", "valor_fechamento_informado", "valor_fechamento_esperado",
  ].includes(key);
}

function formatCellValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";

  if (typeof value === "object" && Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  const str = String(value);

  if (isCpfField(key)) {
    const digits = str.replace(/\D/g, "");
    if (digits.length === 11) return maskCpf(digits);
    return str;
  }
  if (isCnpjField(key)) {
    const digits = str.replace(/\D/g, "");
    if (digits.length === 14) return maskCnpj(digits);
    return str;
  }
  if (isPhoneField(key)) {
    const digits = str.replace(/\D/g, "");
    if (digits.length === 11) return maskCelular(digits);
    return str;
  }
  if (isDateString(value)) {
    try {
      const d = new Date(str);
      const hasTime = /T\d{2}:\d{2}/.test(str) && !/T00:00:00/.test(str);
      return hasTime
        ? format(d, "dd/MM/yyyy HH:mm:ss")
        : format(d, "dd/MM/yyyy");
    } catch { return str; }
  }
  if (isCurrencyField(key)) {
    const num = parseFloat(str);
    if (!isNaN(num)) {
      return `R$ ${formatCentsToDisplay(Math.round(num * 100))}`;
    }
    return str;
  }

  // Translate common status values
  if (key === "status") {
    const statusMap: Record<string, string> = {
      active: "Ativo", inactive: "Inativo", completed: "Concluída",
      cancelled: "Cancelada", pending: "Pendente", ativo: "Ativo",
      inativo: "Inativo",
    };
    return statusMap[str.toLowerCase()] || str;
  }

  return str;
}

export async function exportToExcel(
  rows: Record<string, unknown>[],
  fileName: string,
  sheetName = "Relatório",
) {
  if (!rows.length) return;

  // Filter out hidden fields
  const allKeys = Object.keys(rows[0]);
  const keys = allKeys.filter(k => !HIDDEN_FIELDS.has(k));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistema";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName);

  // Set up columns
  sheet.columns = keys.map(key => ({
    header: getPortugueseHeader(key),
    key,
    width: 18,
  }));

  // Style headers
  const headerRow = sheet.getRow(1);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 11, name: "Arial" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E5E5" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
    };
  });

  // Add data rows
  rows.forEach((row) => {
    const values: Record<string, string> = {};
    keys.forEach(key => {
      values[key] = formatCellValue(key, row[key]);
    });
    const dataRow = sheet.addRow(values);
    dataRow.eachCell((cell) => {
      cell.font = { size: 10, name: "Arial" };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
  });

  // Auto-width columns based on content
  sheet.columns.forEach((col) => {
    if (!col.eachCell) return;
    let maxLen = String(col.header || "").length;
    col.eachCell({ includeEmpty: false }, (cell, rowNum) => {
      if (rowNum === 1) return;
      const len = String(cell.value || "").length;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(Math.max(maxLen + 4, 12), 50);
  });

  // Generate and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
