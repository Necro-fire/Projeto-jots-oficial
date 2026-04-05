export interface Product {
  id: string;
  code: string;
  model: string;
  color: string;
  material: string;
  lensSize: number;
  bridgeSize: number;
  templeSize: number;
  category: string;
  description: string;
  retailPrice: number;
  wholesalePrice: number;
  wholesaleMinQty: number;
  stock: number;
  minStock: number;
  status: "active" | "inactive";
  imageUrl: string;
  filialId: string;
}

export interface Client {
  id: string;
  responsibleName: string;
  storeName: string;
  cnpj: string;
  city: string;
  state: string;
  phone: string;
  whatsapp: string;
  email: string;
  creditLimit: number;
  status: "active" | "inactive";
  filialId: string;
}

export interface Sale {
  id: string;
  number: number;
  clientId: string;
  clientName: string;
  sellerId: string;
  sellerName: string;
  items: SaleItem[];
  total: number;
  discount: number;
  paymentMethod: string;
  date: string;
  origin: "stock" | "bag";
  filialId: string;
}

export interface SaleItem {
  productId: string;
  productCode: string;
  productModel: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  status: "active" | "inactive";
  filialId: string;
}

export interface Empresa {
  id: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  inscricaoEstadual: string;
  regimeTributario: string;
  cnae: string;
  endereco: string;
  cidade: string;
  estado: string;
  cep: string;
  telefone: string;
  email: string;
  serieNF: string;
  ambiente: "producao" | "homologacao";
  codigoMunicipio: string;
  codigoIBGE: string;
}

export interface NotaFiscal {
  id: string;
  numero: number;
  chave: string;
  saleId: string;
  clientName: string;
  clientCnpj: string;
  dataEmissao: string;
  valorTotal: number;
  status: "autorizada" | "cancelada" | "pendente" | "rejeitada";
  xmlUrl?: string;
  danfeUrl?: string;
}

export const mockProducts: Product[] = [];
export const mockClients: Client[] = [];
export const mockEmployees: Employee[] = [];
export const mockSales: Sale[] = [];
export const mockNotasFiscais: NotaFiscal[] = [];
