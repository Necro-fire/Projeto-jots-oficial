// Fixed options for product registration form fields

export const CLASSIFICACOES = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10"] as const;
export const CLASSIFICACAO_PERSONALIZADO = "Personalizado" as const;
export const CLASSIFICACOES_OPCOES = [...CLASSIFICACOES, CLASSIFICACAO_PERSONALIZADO] as const;

export const CLASSIFICACOES_PRODUTO = ["Receituário", "Solar", "Clip-on", "Acessório"] as const;
export type ClassificacaoProduto = typeof CLASSIFICACOES_PRODUTO[number];

export const CATEGORIAS_IDADE = ["Adulto", "Infantil"] as const;

export const GENEROS = ["Masculino", "Feminino", "Unissex"] as const;

export const ESTILOS = [
  "Aviador", "Esportivo", "Fio de Nylon", "Gatinho", "Parafusada (Bucha)",
  "Parafusada (Parafuso)", "Quadrado", "Redondo", "Retrô",
] as const;

export const CORES_SOLIDAS = [
  "Amarelo", "Azul", "Bege", "Branco", "Champanhe", "Cinza", "Dourado",
  "Grafite", "Laranja", "Lilás", "Marrom", "Oncinha", "Prata", "Preto",
  "Rosa", "Rose Gold", "Roxo", "Tartaruga", "Transparente", "Verde",
  "Vermelho", "Vinho",
] as const;

export const CORES_DEGRADE = [
  "Degradê Amarelo", "Degradê Azul", "Degradê Cinza", "Degradê Marrom",
  "Degradê Preto", "Degradê Rosa", "Degradê Verde",
] as const;

export const TODAS_CORES = [...CORES_SOLIDAS, ...CORES_DEGRADE] as const;

export const MATERIAIS_ARO = [
  "Acetato", "Alumínio", "Metal", "Nylon", "Silicone", "Titanium", "TR90",
] as const;

export const MATERIAIS_HASTE = [
  "Acetato", "Alumínio", "Gliter", "Metal", "Nylon", "Silicone", "Titanium", "TR90",
] as const;

// Legacy alias
export const MATERIAIS = MATERIAIS_ARO;

export const TIPOS_LENTE = [
  "Azul",
  "Colorido",
  "Espelhado Amarelo",
  "Espelhado Azul",
  "Espelhado Laranja",
  "Espelhado Prata",
  "G15 (Verde)",
  "G15 (Verde Degradê)",
  "Lente Transparente",
  "Marrom Degradê",
  "Marrom Total",
  "Night Drive (Amarela)",
  "Preto Degradê",
  "Preto Total",
  "Rosa",
] as const;

export const CORES_LENTE_CLIPON = [
  "Amarelo", "Azul", "Cinza", "Marrom", "Prata", "Preto", "Rosa", "Verde",
] as const;

export const MEDIDAS_LENTE = { min: 40, max: 65 } as const;
export const MEDIDAS_ALTURA_LENTE = { min: 15, max: 70 } as const;
export const MEDIDAS_PONTE = { min: 10, max: 30 } as const;
export const MEDIDAS_HASTE = { min: 125, max: 155 } as const;

export const TIPOS_HASTE = ["180", "360"] as const;

export const PONTES_ARMACAO = ["Plaqueta", "Anatômica", "Normal"] as const;

export const CATEGORIAS_IDADE_LABEL: Record<string, string> = {
  "Adulto": "Adulto (Ex: Masculino adulto, Feminino adulto)",
  "Infantil": "Infantil (Ex: Até 12 anos)",
};

export const GENEROS_LABEL: Record<string, string> = {
  "Masculino": "Masculino (Ex: Modelos mais largos/retos)",
  "Feminino": "Feminino (Ex: Modelos arredondados/delicados)",
  "Unissex": "Unissex (Ex: Modelos neutros)",
};

export const SUBCATEGORIAS_ACESSORIOS: Record<string, string[]> = {
  "Teste de Lente": [
    "Teste Polarizado Cartão", "Teste Polarizado Grande",
  ],
  "Parafusos e Fixação": [
    "Ponte de Parafuso", "Ponte de Bucha", "Arruela PVC", "Arruela Metal",
    "Porca 1.4", "Capacete Metal", "Capacete PVC 1.4", "Capacete PVC 1.2",
  ],
  "Plaquetas": [
    "Plaqueta Anatômica", "Plaqueta Rayban", "Plaqueta de Silicone",
    "Plaqueta de PVC", "Plaqueta de Ar",
  ],
  "Pontes": [
    "Ponte Anatômica Encaixe", "Ponte Anatômica 1 Furo", "Ponte Anatômica 2 Furo",
  ],
  "Parafusos": [
    "Parafuso 1.2 - 4.0", "Parafuso 1.4 - 3.0", "Parafuso 1.4 - 3.2",
    "Parafuso 1.4 - 3.6", "Parafuso 1.4 - 4.0", "Parafuso 1.4 - 5.0",
    "Parafuso 1.4 - 6.0", "Parafuso 1.6 - 3.6", "Parafuso Mini", "Parafuso Guia 1.4",
  ],
  "Limpeza": [
    "Kit Limpeza", "Flanela Microfibra", "Flanela Poliéster", "Flanela Mágica",
    "PCT 10 Flanela Poliéster", "Limpa Lentes PCT 10", "Limpa Lentes Unidade",
  ],
  "Cordões": [
    "Cordão Silicone Dúzia", "Cordão Tecido Dúzia", "Cordão Silicone Unidade", "Cordão Infantil",
  ],
  "Ferramentas": [
    "Chave Ponta Estrela", "Chave Ponta Allen", "Chave Ponta Fenda", "Chave Ponta Torx",
    "Chave Dourada Fenda", "Chave Dourada Estrela", "Kit Chave 4 Pontas", "Kit Chave 10 Pontas",
  ],
  "Outros Acessórios": [
    "Chaveiro", "Broche Óculos", "Meia", "Cirex", "Suporte Lente de Contato",
    "Suporte de Orelha", "Escala", "Porta O.S.",
  ],
  "Estojos": [
    "Estojo Liso Quadrado", "Estojo Liso Redondo", "Estojo Carteira EVA",
    "Estojo Receituário Zíper", "Estojo Solar Zíper", "Estojo Infantil Sapato",
    "Estojo Infantil Carro", "Estojo Texturizado Botão", "Estojo Liso Botão",
    "Estojo Tipo Caixa Imã", "Estojo Tipo Carteira",
  ],
  "Bolsas e Sacolas": [
    "Sacola de Papel", "Sacola TNT PCT c/10",
  ],
  "Outros": [
    "Porta Óculos", "Expositor 5 Lugares",
  ],
};

export const TODAS_SUBCATEGORIAS_ACESSORIOS = Object.values(SUBCATEGORIAS_ACESSORIOS).flat();
