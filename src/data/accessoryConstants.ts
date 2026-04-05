/**
 * Hierarchical accessory structure: Grupo → Subtipo → Variação → Cor
 * Some groups have Material and/or Tipos de Venda dimensions.
 */

export interface AccessoryVariation {
  nome: string;
  cores: string[];
}

export interface AccessoryType {
  nome: string;
  variacoes: AccessoryVariation[];
}

export interface AccessoryCategory {
  nome: string;
  tipos: AccessoryType[];
  /** Extra "material" dimension */
  materiais?: string[];
  /** Allowed sale types for this group */
  tiposVenda: string[];
  /** Whether this category has dual variation dimensions (e.g. Parafusos: rosca + comprimento) */
  variacoesDuplas?: { label1: string; valores1: string[]; label2: string; valores2: string[] };
  /** Whether to ask "personalizado" and show acréscimo field (Estojos) */
  perguntarPersonalizado?: boolean;
  /** Whether this is a Lentes category with special fields */
  isLente?: boolean;
}

const SEM_COR = ["Nenhuma"] as const;

// Helper: generate numeric variations
function genNumeric(from: number, to: number, step = 0.1): string[] {
  const result: string[] = [];
  for (let v = from; v <= to + 0.001; v += step) {
    result.push(v.toFixed(1));
  }
  return result;
}

function genNumericVariations(from: number, to: number, step = 0.1, cores: string[] = [...SEM_COR]): AccessoryVariation[] {
  return genNumeric(from, to, step).map(v => ({ nome: v, cores }));
}

const simpleTipo = (nome: string): AccessoryType => ({
  nome,
  variacoes: [{ nome: "Padrão", cores: [...SEM_COR] }],
});

const simpleTipoWithCores = (nome: string, cores: string[]): AccessoryType => ({
  nome,
  variacoes: [{ nome: "Padrão", cores }],
});

// Common color palettes
const CORES_TRAVA = ["Vermelho", "Amarelo", "Preta", "Cinza", "Marrom", "Verde", "Azul", "Transparente", "Branco"];

const CORES_PARAFUSO = ["Preto", "Prata", "Dourado", "Rose"];

const CORES_COMPLETAS = [
  "Preto", "Branco", "Azul", "Marrom", "Tartaruga", "Rosa",
  "Vermelho", "Amarelo", "Verde", "Roxo", "Transparente",
  "Laranja", "Cinza", "Champanhe", "Pink", "Animal Print",
];

const CORES_COMPLETAS_PLUS = [
  ...CORES_COMPLETAS, "Multi-Color", "Bege", "Prata", "Dourado",
];

const CORES_PONTE = [
  "Preto", "Grafite", "Marrom", "Prata", "Dourado", "Rose Gold",
  "Dourado Claro", "Transparente", "Branco", "Azul", "Rosa",
];

const CORES_SACOLA = [
  "Preto", "Branco", "Azul", "Marrom", "Kraft", "Rosa",
  "Vermelho", "Amarelo", "Verde", "Roxo", "Transparente",
  "Laranja", "Cinza", "Pink", "Animal Print", "Multi-Color",
  "Bege", "Prata", "Dourado",
];

const CORES_EXPOSITOR = [
  ...CORES_COMPLETAS, "Multi-Color", "Bege", "Espelhado", "Dourado", "Prata", "Madeira",
];

const CORES_ESTOJO = [
  "Preto", "Branco", "Azul Escuro", "Marrom", "Tartaruga", "Rosa",
  "Azul Turqueza", "Vermelho", "Amarelo", "Verde", "Roxo", "Transparente",
  "Laranja", "Cinza", "Azul Claro", "Pink", "Animal Print", "Multi-Color",
  "Bege", "Espelhado", "Dourado", "Prata", "Madeira", "Vinho", "Lilás",
];

const CORES_PORTA_OS = [
  "Preto", "Branco", "Azul", "Marrom", "Tartaruga", "Rosa",
  "Vermelho", "Amarelo", "Verde", "Roxo", "Transparente",
  "Laranja", "Cinza", "Champanhe", "Pink", "Animal Print",
  "Multi-Color", "Bege",
];

const CORES_CORDAO = [
  ...CORES_COMPLETAS_PLUS, "Multi-Color", "Bege", "Prata", "Dourado",
];

export const ACESSORIOS_CATEGORIAS: AccessoryCategory[] = [
  // ── B — ALICATES ──
  {
    nome: "Alicates",
    tiposVenda: ["Unidade"],
    tipos: [
      "Corte", "Bico Fino", "Bico Redondo", "Meia-Cana",
      "Nylon (Proteção)", "Plaqueta", "Abrir Aro", "Charneira",
    ].map(simpleTipo),
  },

  // ── D — PONTAS DE ALICATE ──
  {
    nome: "Pontas de Alicate",
    tiposVenda: ["Unidade"],
    tipos: Array.from({ length: 10 }, (_, i) =>
      simpleTipo(`Nylon ${String(i + 1).padStart(2, "0")}`)
    ),
  },

  // ── F — CHAVES ──
  {
    nome: "Chaves",
    tiposVenda: ["Unidade"],
    tipos: [
      "4 Pontas", "Dourada Fenda", "Dourada Porca", "Dourada Estrela",
      "Fenda", "Porca", "Estrela", "Ponta Fenda", "Ponta Porca", "Ponta Estrela",
      "Chaveirinho", "Kit 10 Pontas", "Kit Grande", "Kit Extra", "Extra",
    ].map(simpleTipo),
  },

  // ── H — PINÇAS ──
  {
    nome: "Pinças",
    tiposVenda: ["Unidade"],
    tipos: ["Reta", "Curva", "Comum"].map(simpleTipo),
  },

  // ── J — PUXA NYLON ──
  {
    nome: "Puxa Nylon",
    tiposVenda: ["Unidade"],
    tipos: ["Plástico", "Metal"].map(simpleTipo),
  },

  // ── L — TIRA MOLA ──
  {
    nome: "Tira Mola",
    tiposVenda: ["Unidade"],
    tipos: ["Plástico", "Metal"].map(simpleTipo),
  },

  // ── N — LIMA ──
  {
    nome: "Lima",
    tiposVenda: ["Unidade"],
    tipos: ["Pequena", "Média", "Grande"].map(simpleTipo),
  },

  // ── P — TORRE DE COLORAÇÃO ──
  {
    nome: "Torre de Coloração",
    tiposVenda: ["Unidade"],
    tipos: ["Metal"].map(simpleTipo),
  },

  // ── R — SUPORTE PARA GRAU ──
  {
    nome: "Suporte para Grau",
    tiposVenda: ["Unidade"],
    materiais: ["Metal", "Acetato", "Nylon", "TR"],
    tipos: [simpleTipo("Padrão")],
  },

  // ── T — FLANELAS ──
  {
    nome: "Flanelas",
    tiposVenda: ["Unidade", "Pacote 10 und", "Pacote 50 und", "Pacote 80 und", "Pacote 100 und"],
    tipos: ["Microfibra", "Camurça", "Mágica", "Antiembaçante", "Poliéster"].map(n => ({
      nome: n,
      variacoes: [
        { nome: "Pequena", cores: [...SEM_COR] },
        { nome: "Grande", cores: [...SEM_COR] },
      ],
    })),
  },

  // ── V — LIMPA LENTE ──
  {
    nome: "Limpa Lente",
    tiposVenda: ["Unidade", "Pacote 10 unidades"],
    tipos: [{
      nome: "Padrão",
      variacoes: ["25ml", "30ml", "50ml", "100ml"].map(v => ({ nome: v, cores: [...SEM_COR] })),
    }],
  },

  // ── X — PLAQUETAS ──
  {
    nome: "Plaquetas",
    tiposVenda: ["Unidade", "Pacote 2", "Pacote 5", "Pacote 10", "Pacote 50", "Pacote 100", "Pacote 200"],
    materiais: ["Silicone", "PVC", "Anatômica", "Ray-Ban", "Especial", "Adesiva", "AR"],
    tipos: [simpleTipo("Padrão")],
  },

  // ── Z — MOLAS ──
  {
    nome: "Molas",
    tiposVenda: ["Unidade", "Par", "Pacote com 10"],
    tipos: [
      {
        nome: "Mola com Caixa",
        variacoes: [
          "22mm", "145 C/Caixa", "5", "A01", "210 C/Caixa Larga", "60", "2", "1",
          "210 C/Caixa", "3-1", "4-1", "5-1", "6-1", "8-1", "10-1", "3", "8",
          "Extra Caixa 1", "Extra Caixa 2", "Extra Caixa 3", "Extra Caixa 4", "Extra Caixa 5",
        ].map(v => ({ nome: v, cores: [...SEM_COR] })),
      },
      {
        nome: "Mola",
        variacoes: [
          "57-6", "131-2", "76-1", "151-9", "400", "211 6-1", "89", "11-Mai",
          "262 1.4", "4-6", "230 1.2", "115", "109", "117", "204",
          "210 1.2 Espesso 1.2", "112", "116", "210 1.4", "145", "157", "215",
          "210 1.2", "105", "205", "AX47", "82", "209", "216", "203 1.4",
          "200", "211-1", "78-8", "432", "207", "208", "202",
          "Anzol Fina", "Anzol Grossa", "50", "137", "50-3", "200-5", "130",
          "Anzol Alumínio",
          "Extra 1", "Extra 2", "Extra 3", "Extra 4", "Extra 5",
        ].map(v => ({ nome: v, cores: [...SEM_COR] })),
      },
    ],
  },

  // ── AB — CHARNEIRA ──
  {
    nome: "Charneira",
    tiposVenda: ["Unidade", "Pacote 10 und"],
    tipos: [
      {
        nome: "Dupla",
        variacoes: [
          "1", "2", "3", "4",
          "Extra Dupla 1", "Extra Dupla 2", "Extra Dupla 3", "Extra Dupla 4", "Extra Dupla 5",
        ].map(v => ({ nome: v, cores: [...SEM_COR] })),
      },
      {
        nome: "Simples",
        variacoes: [
          ...Array.from({ length: 46 }, (_, i) => String(i + 5)),
          "Extra 51", "Extra 52", "Extra 53", "Extra 54", "Extra 55",
        ].map(v => ({ nome: v, cores: [...SEM_COR] })),
      },
    ],
  },

  // ── AD — TRAVA ──
  {
    nome: "Travas",
    tiposVenda: ["Pacote 10", "Pacote 25 und", "Pacote 50 und"],
    tipos: ["Pino Duplo", "Pino Simples", "Colorida", "Bucha Curta", "Bucha Longa"].map(n => ({
      nome: n,
      variacoes: genNumericVariations(1.1, 2.3, 0.1, [...CORES_TRAVA]),
    })),
  },

  // ── AF — PARAFUSOS ──
  {
    nome: "Parafusos",
    tiposVenda: ["Pacote 10", "Pacote 50", "Pacote 100"],
    tipos: [
      "Guia", "Rosca Soberba", "Fenda", "Estrela", "Rosca Metade", "Cabeça Maior",
      "Bob", "Liso Redondo Cabeça Maior", "Com Arruela", "Bob Rosca Metade",
      "Sextavado", "Liso Sextavado Com Arruela", "Plaqueta", "Haste",
    ].map(n => ({
      nome: n,
      variacoes: [{ nome: "Padrão", cores: [...CORES_PARAFUSO] }],
    })),
    variacoesDuplas: {
      label1: "Rosca (mm)",
      valores1: genNumeric(1.1, 2.3),
      label2: "Comprimento (mm)",
      valores2: genNumeric(1.0, 9.0),
    },
  },

  // ── AH — PORCAS ──
  {
    nome: "Porcas",
    tiposVenda: ["Pacote 10", "Pacote 50", "Pacote 100"],
    materiais: ["Metal", "Alumínio"],
    tipos: [{
      nome: "Padrão",
      variacoes: genNumericVariations(1.1, 2.0, 0.1, [
        ...CORES_PARAFUSO, "Branco", "Azul", "Vermelho", "Verde",
        "Marrom", "Cinza", "Champanhe", "Transparente",
      ]),
    }],
  },

  // ── AJ — ARRUELAS ──
  {
    nome: "Arruelas",
    tiposVenda: ["Pacote 10", "Pacote 50", "Pacote 100"],
    materiais: ["Metal", "Plástico"],
    tipos: [{
      nome: "Padrão",
      variacoes: genNumericVariations(1.1, 2.0),
    }],
  },

  // ── AL — CAPACETE ──
  {
    nome: "Capacete",
    tiposVenda: ["Pacote 10", "Pacote 50", "Pacote 100"],
    materiais: ["Metal", "Plástico"],
    tipos: [{
      nome: "Padrão",
      variacoes: genNumericVariations(1.1, 2.0),
    }],
  },

  // ── AN — BROCA ──
  {
    nome: "Broca",
    tiposVenda: ["Unidade"],
    tipos: [{
      nome: "Padrão",
      variacoes: ["0.6", "0.7", "0.8", "0.9", "1.0", ...genNumeric(1.1, 2.0)].map(v => ({ nome: v, cores: [...SEM_COR] })),
    }],
  },

  // ── AP — MACHO ──
  {
    nome: "Macho",
    tiposVenda: ["Unidade"],
    tipos: [{
      nome: "Padrão",
      variacoes: ["1.0", "1.2", "1.4", "1.6", "1.8", "2.0"].map(v => ({ nome: v, cores: [...SEM_COR] })),
    }],
  },

  // ── AR — CAIXA ORGANIZADOR ──
  {
    nome: "Caixa Organizador",
    tiposVenda: ["Unidade"],
    materiais: ["Plástico", "MDF"],
    tipos: [{
      nome: "Padrão",
      variacoes: ["Pequena", "Média", "Grande"].map(v => ({ nome: v, cores: [...SEM_COR] })),
    }],
  },

  // ── AT — PONTEIRAS ──
  {
    nome: "Ponteiras",
    tiposVenda: ["Par"],
    tipos: ["Ray-Ban", "Comum", "Ponteirão", "Emborrachada", "Revestimento"].map(n => ({
      nome: n,
      variacoes: [
        "1.4 Furo", "1.2 Furo", "1.6 Furo",
        "529", "339", "149", "130", "33", "131", "9", "T-35",
        "419", "2073", "413", "1", "2", "3",
        "Grande", "Média", "Pequena",
      ].map(v => ({ nome: v, cores: [...CORES_COMPLETAS] })),
    })),
  },

  // ── AV — HASTES ──
  {
    nome: "Hastes",
    tiposVenda: ["Par"],
    materiais: ["Acetato", "Metal", "Alumínio", "Parafusada Parafuso", "Parafusada Bucha"],
    tipos: [{
      nome: "Padrão",
      variacoes: [
        "Simples", "A87", "A88", "A86", "A85",
        "2.6mm", "5.0mm", "7.0mm", "9.0mm", "12mm", "15mm",
      ].map(v => ({ nome: v, cores: [...CORES_COMPLETAS_PLUS] })),
    }],
  },

  // ── AX — RÉGUAS ──
  {
    nome: "Réguas",
    tiposVenda: ["Unidade"],
    tipos: ["Régua", "Régua Medir DNP", "Paquímetro", "Régua com Oclusor", "Oclusor"].map(simpleTipo),
  },

  // ── AZ — PONTE ──
  {
    nome: "Pontes",
    tiposVenda: ["Unidade"],
    materiais: ["Metal", "Alumínio", "Titânio", "Silicone", "Rígida"],
    tipos: [{
      nome: "Padrão",
      variacoes: [
        "Parafusada com Bucha", "Parafusada com Parafuso",
        "Anatômica 1 Furo", "Anatômica 2 Furos", "Anatômica Encaixe", "Anatômica Parafusada",
        "1", "2", "3", "4", "5", "6",
        "384", "121", "58", "42", "99", "57", "165",
      ].map(v => ({ nome: v, cores: [...CORES_PONTE] })),
    }],
  },

  // ── BB — TESTE POLARIZADO ──
  {
    nome: "Teste Polarizado",
    tiposVenda: ["Unidade"],
    tipos: ["Cartão", "Teste Pequeno", "Teste Grande"].map(simpleTipo),
  },

  // ── BD — EXTENSOR ──
  {
    nome: "Extensor",
    tiposVenda: ["Par"],
    tipos: ["Adulto", "Infantil"].map(n => simpleTipoWithCores(n, [...CORES_COMPLETAS])),
  },

  // ── BF — CORDÃO ──
  {
    nome: "Cordão",
    tiposVenda: ["Unidade", "Dúzia"],
    tipos: ["Infantil", "Adulto", "Esportivo", "Tecido", "Nylon", "Miçanga", "Metal"].map(n =>
      simpleTipoWithCores(n, [...CORES_CORDAO])
    ),
  },

  // ── BH — CANETAS ──
  {
    nome: "Canetas",
    tiposVenda: ["Unidade"],
    tipos: [
      "Caneta Pintar Armação", "Caneta Marcar Lente",
      "Caneta Plástico", "Caneta Metal", "Caneta Papelão",
      "Caneta Plástico Personalizada", "Caneta Metal Personalizada", "Caneta Papelão Personalizada",
      "Caneta Luz Azul",
    ].map(n => simpleTipoWithCores(n, [...CORES_COMPLETAS_PLUS])),
  },

  // ── BJ — SACOLAS ──
  {
    nome: "Sacolas",
    tiposVenda: ["Unidade"],
    tipos: [
      "Plástico", "Papel", "Tecido", "TNT",
      "Plástico Personalizado", "Papel Personalizado", "Tecido Personalizado", "TNT Personalizado",
    ].map(n => simpleTipoWithCores(n, [...CORES_SACOLA])),
  },

  // ── BL — SAQUINHO PARA ARMAÇÃO ──
  {
    nome: "Saquinho para Armação",
    tiposVenda: ["Unidade", "Pacote 10", "Pacote 50", "Pacote 100"],
    tipos: [
      "Tecido Comum", "Tecido Pode Gravar",
    ].map(n => simpleTipoWithCores(n, [...CORES_COMPLETAS_PLUS])),
  },

  // ── BN — BROCHES ──
  {
    nome: "Broches",
    tiposVenda: ["Unidade"],
    tipos: ["Para Roupa", "Para Cabelo"].map(n => simpleTipoWithCores(n, [...CORES_COMPLETAS_PLUS])),
  },

  // ── BP — CHAVEIROS ──
  {
    nome: "Chaveiros",
    tiposVenda: ["Unidade"],
    materiais: ["Plástico", "Metal", "Madeira", "Couro"],
    tipos: [{
      nome: "Padrão",
      variacoes: [{ nome: "Padrão", cores: [...CORES_COMPLETAS_PLUS, "Madeira"] }],
    }],
  },

  // ── BR — PORTA O.S. ──
  {
    nome: "Porta O.S.",
    tiposVenda: ["Unidade"],
    tipos: ["Botão", "Zíper", "Velcro"].map(n => simpleTipoWithCores(n, [...CORES_PORTA_OS])),
  },

  // ── BT — EXPOSITOR ──
  {
    nome: "Expositor",
    tiposVenda: ["Unidade"],
    materiais: ["Giratório", "Acrílico", "Madeira", "Metal", "Papel", "Vidro"],
    tipos: [{
      nome: "Padrão",
      variacoes: Array.from({ length: 20 }, (_, i) => ({
        nome: `${i + 1} Lugar`,
        cores: [...CORES_EXPOSITOR],
      })),
    }],
  },

  // ── BV — VENTOSA ──
  {
    nome: "Ventosa",
    tiposVenda: ["Unidade"],
    tipos: ["Normal", "Com Imã"].map(n => ({
      nome: n,
      variacoes: Array.from({ length: 20 }, (_, i) => ({
        nome: String(i + 1),
        cores: [...SEM_COR],
      })),
    })),
  },

  // ── BX — OUTROS ──
  {
    nome: "Outros",
    tiposVenda: ["Unidade"],
    tipos: [
      "Suporte Alicate", "Extrator", "Analisador Lente de Contato",
      "Pupilômetro", "Medir Altura e DNP", "Caixa Prova",
      "Caixa Prova Multifocal", "Armação para Caixa Prova",
      "Teste UV", "Furadeira de Modelo", "Lensômetro",
      "Tabela", "Especímetro", "Clip-Car", "Cirex",
    ].map(simpleTipo),
  },

  // ── BZ — ESPELHOS ──
  {
    nome: "Espelhos",
    tiposVenda: ["Unidade"],
    tipos: ["Dupla Face", "Uma Face", "Pequeno", "Acrílico", "Dobrável"].map(simpleTipo),
  },

  // ── CB — MALETAS ──
  {
    nome: "Maletas",
    tiposVenda: ["Unidade"],
    materiais: ["Tecido", "Couro", "Papel", "Plástico", "Metal"],
    tipos: [{
      nome: "Padrão",
      variacoes: Array.from({ length: 300 }, (_, i) => ({
        nome: `${i + 1} Lugar`,
        cores: [...SEM_COR],
      })),
    }],
  },

  // ── CD — ESTOJOS ──
  {
    nome: "Estojos",
    tiposVenda: ["Unidade"],
    perguntarPersonalizado: true,
    tipos: [
      "Plástico Quadrado", "Plástico Redondo", "Couro", "Carteirinha",
      "Saquinho", "Zíper", "Infantil", "Infantil Sapatinho", "Infantil Carrinho",
      "Plástico", "Triângulo", "Tampa com Imã", "Madeira", "Texturizado", "Camurça",
    ].map(n => simpleTipoWithCores(n, [...CORES_ESTOJO])),
  },

  // ── CG — LENTES ──
  {
    nome: "Lentes",
    tiposVenda: ["Unidade", "Par"],
    isLente: true,
    tipos: [
      { nome: "Solar", variacoes: [{ nome: "Padrão", cores: [...SEM_COR] }] },
      { nome: "Receituário", variacoes: [{ nome: "Padrão", cores: [...SEM_COR] }] },
      { nome: "Blocos", variacoes: [{ nome: "Padrão", cores: [...SEM_COR] }] },
    ],
  },

  // ── KITS ──
  {
    nome: "Kits",
    tiposVenda: ["Unidade"],
    tipos: [
      "Kit Extensor + Cordão", "Kit Infantil", "Kit Adulto", "Kit Limpeza",
      "Kit Flanela", "Kit Parafusos", "Kit Chave",
      "Kit 01", "Kit 02", "Kit 03", "Kit 04", "Kit 05", "Kit 06",
    ].map(simpleTipo),
  },
];

// ── Lentes helper data ──

export const LENTES_SOLAR_TIPOS = ["Não Polarizado", "Polarizado", "Espelhado", "Espelhado Polarizado"];

export const LENTES_SOLAR_CORES = [
  "Preto", "Marrom", "Verde G15", "Roxo", "Rosa", "Amarelo", "Transitions",
  "Azul", "Laranja", "Prata", "Dourado", "Vermelho", "Verde",
  "Preto Degradê", "Marrom Degradê", "Verde G15 Degradê", "Roxo Degradê", "Rosa Degradê",
  "Amarelo Degradê", "Azul Degradê", "Laranja Degradê", "Prata Degradê",
  "Dourado Degradê", "Vermelho Degradê", "Verde Degradê",
];

export const LENTES_BASES = ["Base 2", "Base 4", "Base 6", "Base 8"];
export const LENTES_BLOCOS_BASES = ["Base 2", "Base 4", "Base 6", "Base 8", "Base 10"];

export const LENTES_INDICES = [
  '1.49 (Essence) - (Resina)',
  '1.56 (Classic) - (Resina)',
  '1.59 (Force) - (Policarbonato)',
  '1.61 (Fina Pro) - (Alto Índice)',
  '1.67 (Fina Elite) - (Alto Índice)',
  '1.74 (Ultra Fina) - (Alto Índice)',
];

export const LENTES_TRATAMENTOS = [
  "Sem Tratamento", "AR - Antirreflexo", "Multifocal", "Fotossensível",
  "Antiembaçante", "Filtro Azul AR", "Policarbonato", "Super Hidrofóbica",
  "Extendido", "Bifocal", "Unifocal",
];

// Helper functions
export function getCategoriaByName(nome: string): AccessoryCategory | undefined {
  return ACESSORIOS_CATEGORIAS.find(c => c.nome === nome);
}

export function getTiposByCategoria(categoriaNome: string): AccessoryType[] {
  return getCategoriaByName(categoriaNome)?.tipos ?? [];
}

export function getVariacoesByTipo(categoriaNome: string, tipoNome: string): AccessoryVariation[] {
  const cat = getCategoriaByName(categoriaNome);
  return cat?.tipos.find(t => t.nome === tipoNome)?.variacoes ?? [];
}

export function getCoresByVariacao(categoriaNome: string, tipoNome: string, variacaoNome: string): string[] {
  const variacoes = getVariacoesByTipo(categoriaNome, tipoNome);
  return variacoes.find(v => v.nome === variacaoNome)?.cores ?? [];
}

export function getMateriaisByCategoria(categoriaNome: string): string[] {
  return getCategoriaByName(categoriaNome)?.materiais ?? [];
}

export function getTiposVendaByCategoria(categoriaNome: string): string[] {
  return getCategoriaByName(categoriaNome)?.tiposVenda ?? [];
}

export function hasMaterial(categoriaNome: string): boolean {
  const cat = getCategoriaByName(categoriaNome);
  return !!cat?.materiais && cat.materiais.length > 0;
}

export function hasVariacoesDuplas(categoriaNome: string): boolean {
  return !!getCategoriaByName(categoriaNome)?.variacoesDuplas;
}

export function getVariacoesDuplas(categoriaNome: string) {
  return getCategoriaByName(categoriaNome)?.variacoesDuplas;
}

export function isPersonalizavel(categoriaNome: string): boolean {
  return !!getCategoriaByName(categoriaNome)?.perguntarPersonalizado;
}

export function isLenteCategory(categoriaNome: string): boolean {
  return !!getCategoriaByName(categoriaNome)?.isLente;
}

/** All category names */
export const TODAS_CATEGORIAS_ACESSORIO = ACESSORIOS_CATEGORIAS.map(c => c.nome);
