export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alertas_estoque: {
        Row: {
          categoria: string
          cor: string | null
          created_at: string
          filial_id: string
          id: string
          material_acessorio: string
          quantidade_minima: number
          tipo: string
          tipo_acessorio: string
          variacao_acessorio: string
        }
        Insert: {
          categoria: string
          cor?: string | null
          created_at?: string
          filial_id?: string
          id?: string
          material_acessorio?: string
          quantidade_minima?: number
          tipo?: string
          tipo_acessorio?: string
          variacao_acessorio?: string
        }
        Update: {
          categoria?: string
          cor?: string | null
          created_at?: string
          filial_id?: string
          id?: string
          material_acessorio?: string
          quantidade_minima?: number
          tipo?: string
          tipo_acessorio?: string
          variacao_acessorio?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          module: string
          origin: string | null
          user_id: string
          user_name: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          module: string
          origin?: string | null
          user_id: string
          user_name?: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          module?: string
          origin?: string | null
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      boleto_alertas: {
        Row: {
          created_at: string
          data_vencimento: string
          filial_id: string
          id: string
          intervalo_dias: number
          parcela_numero: number
          status: string
          total_parcelas: number
          updated_at: string
          valor_parcela: number
          venda_id: string
        }
        Insert: {
          created_at?: string
          data_vencimento?: string
          filial_id?: string
          id?: string
          intervalo_dias?: number
          parcela_numero?: number
          status?: string
          total_parcelas?: number
          updated_at?: string
          valor_parcela?: number
          venda_id: string
        }
        Update: {
          created_at?: string
          data_vencimento?: string
          filial_id?: string
          id?: string
          intervalo_dias?: number
          parcela_numero?: number
          status?: string
          total_parcelas?: number
          updated_at?: string
          valor_parcela?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boleto_alertas_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      caixa_movimentacoes: {
        Row: {
          caixa_id: string
          created_at: string
          descricao: string
          forma_pagamento: string
          id: string
          tipo: string
          usuario_id: string
          usuario_nome: string
          valor: number
          venda_id: string | null
        }
        Insert: {
          caixa_id: string
          created_at?: string
          descricao?: string
          forma_pagamento?: string
          id?: string
          tipo: string
          usuario_id: string
          usuario_nome?: string
          valor?: number
          venda_id?: string | null
        }
        Update: {
          caixa_id?: string
          created_at?: string
          descricao?: string
          forma_pagamento?: string
          id?: string
          tipo?: string
          usuario_id?: string
          usuario_nome?: string
          valor?: number
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caixa_movimentacoes_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "caixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_movimentacoes_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      caixas: {
        Row: {
          aberto_em: string
          created_at: string
          diferenca: number | null
          fechado_em: string | null
          filial_id: string
          id: string
          observacoes_fechamento: string | null
          status: string
          usuario_abertura_id: string
          usuario_abertura_nome: string
          usuario_fechamento_id: string | null
          usuario_fechamento_nome: string | null
          valor_abertura: number
          valor_fechamento_esperado: number | null
          valor_fechamento_informado: number | null
        }
        Insert: {
          aberto_em?: string
          created_at?: string
          diferenca?: number | null
          fechado_em?: string | null
          filial_id?: string
          id?: string
          observacoes_fechamento?: string | null
          status?: string
          usuario_abertura_id: string
          usuario_abertura_nome?: string
          usuario_fechamento_id?: string | null
          usuario_fechamento_nome?: string | null
          valor_abertura?: number
          valor_fechamento_esperado?: number | null
          valor_fechamento_informado?: number | null
        }
        Update: {
          aberto_em?: string
          created_at?: string
          diferenca?: number | null
          fechado_em?: string | null
          filial_id?: string
          id?: string
          observacoes_fechamento?: string | null
          status?: string
          usuario_abertura_id?: string
          usuario_abertura_nome?: string
          usuario_fechamento_id?: string | null
          usuario_fechamento_nome?: string | null
          valor_abertura?: number
          valor_fechamento_esperado?: number | null
          valor_fechamento_informado?: number | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          bairro: string
          city: string
          cnpj: string
          cpf: string
          created_at: string
          credit_limit: number
          data_nascimento: string | null
          email: string
          endereco: string
          filial_id: string
          id: string
          inscricao_estadual: string
          nome_fantasia: string
          observacoes: string
          phone: string
          responsible_name: string
          state: string
          status: string
          store_name: string
          telefones: string[]
          tipo_cliente: string
          whatsapp: string
        }
        Insert: {
          bairro?: string
          city?: string
          cnpj?: string
          cpf?: string
          created_at?: string
          credit_limit?: number
          data_nascimento?: string | null
          email?: string
          endereco?: string
          filial_id?: string
          id?: string
          inscricao_estadual?: string
          nome_fantasia?: string
          observacoes?: string
          phone?: string
          responsible_name: string
          state?: string
          status?: string
          store_name: string
          telefones?: string[]
          tipo_cliente?: string
          whatsapp?: string
        }
        Update: {
          bairro?: string
          city?: string
          cnpj?: string
          cpf?: string
          created_at?: string
          credit_limit?: number
          data_nascimento?: string | null
          email?: string
          endereco?: string
          filial_id?: string
          id?: string
          inscricao_estadual?: string
          nome_fantasia?: string
          observacoes?: string
          phone?: string
          responsible_name?: string
          state?: string
          status?: string
          store_name?: string
          telefones?: string[]
          tipo_cliente?: string
          whatsapp?: string
        }
        Relationships: []
      }
      compra_items: {
        Row: {
          compra_id: string
          created_at: string
          id: string
          produto_code: string
          produto_id: string
          produto_model: string
          quantidade: number
          total: number
          valor_unitario: number
        }
        Insert: {
          compra_id: string
          created_at?: string
          id?: string
          produto_code?: string
          produto_id: string
          produto_model?: string
          quantidade?: number
          total?: number
          valor_unitario?: number
        }
        Update: {
          compra_id?: string
          created_at?: string
          id?: string
          produto_code?: string
          produto_id?: string
          produto_model?: string
          quantidade?: number
          total?: number
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "compra_items_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras_fornecedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_fornecedor: {
        Row: {
          codigo: string
          created_at: string
          data_compra: string
          descricao: string
          filial_id: string
          fornecedor_id: string
          id: string
          observacoes: string
          usuario_id: string
          usuario_nome: string
          valor_total: number
        }
        Insert: {
          codigo?: string
          created_at?: string
          data_compra?: string
          descricao?: string
          filial_id?: string
          fornecedor_id: string
          id?: string
          observacoes?: string
          usuario_id: string
          usuario_nome?: string
          valor_total?: number
        }
        Update: {
          codigo?: string
          created_at?: string
          data_compra?: string
          descricao?: string
          filial_id?: string
          fornecedor_id?: string
          id?: string
          observacoes?: string
          usuario_id?: string
          usuario_nome?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "compras_fornecedor_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      consignado_historico: {
        Row: {
          acao: string
          consignado_id: string
          created_at: string
          detalhes: Json
          id: string
          usuario_id: string | null
          usuario_nome: string
        }
        Insert: {
          acao: string
          consignado_id: string
          created_at?: string
          detalhes?: Json
          id?: string
          usuario_id?: string | null
          usuario_nome?: string
        }
        Update: {
          acao?: string
          consignado_id?: string
          created_at?: string
          detalhes?: Json
          id?: string
          usuario_id?: string | null
          usuario_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "consignado_historico_consignado_id_fkey"
            columns: ["consignado_id"]
            isOneToOne: false
            referencedRelation: "consignados"
            referencedColumns: ["id"]
          },
        ]
      }
      consignado_trocas: {
        Row: {
          consignado_novo_id: string
          consignado_original_id: string
          created_at: string
          diferenca_valor: number
          id: string
          observacoes: string
          tipo_diferenca: string
          usuario_id: string | null
          usuario_nome: string
        }
        Insert: {
          consignado_novo_id: string
          consignado_original_id: string
          created_at?: string
          diferenca_valor?: number
          id?: string
          observacoes?: string
          tipo_diferenca?: string
          usuario_id?: string | null
          usuario_nome?: string
        }
        Update: {
          consignado_novo_id?: string
          consignado_original_id?: string
          created_at?: string
          diferenca_valor?: number
          id?: string
          observacoes?: string
          tipo_diferenca?: string
          usuario_id?: string | null
          usuario_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "consignado_trocas_consignado_novo_id_fkey"
            columns: ["consignado_novo_id"]
            isOneToOne: false
            referencedRelation: "consignados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignado_trocas_consignado_original_id_fkey"
            columns: ["consignado_original_id"]
            isOneToOne: false
            referencedRelation: "consignados"
            referencedColumns: ["id"]
          },
        ]
      }
      consignados: {
        Row: {
          cliente_id: string | null
          codigo: string
          created_at: string
          filial_id: string
          id: string
          observacoes: string
          produto_id: string
          quantidade: number
          status: string
          updated_at: string
          valor_total: number
          valor_unitario: number
          venda_id: string | null
          vendedor_nome: string
        }
        Insert: {
          cliente_id?: string | null
          codigo?: string
          created_at?: string
          filial_id?: string
          id?: string
          observacoes?: string
          produto_id: string
          quantidade?: number
          status?: string
          updated_at?: string
          valor_total?: number
          valor_unitario?: number
          venda_id?: string | null
          vendedor_nome?: string
        }
        Update: {
          cliente_id?: string | null
          codigo?: string
          created_at?: string
          filial_id?: string
          id?: string
          observacoes?: string
          produto_id?: string
          quantidade?: number
          status?: string
          updated_at?: string
          valor_total?: number
          valor_unitario?: number
          venda_id?: string | null
          vendedor_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "consignados_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignados_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      descontos_atacado: {
        Row: {
          categoria: string
          created_at: string
          filial_id: string
          id: string
          produto_id: string | null
          quantidade_minima: number
          status: string
          tipo_desconto: string
          tipo_valor: string
          valor_desconto: number
        }
        Insert: {
          categoria?: string
          created_at?: string
          filial_id?: string
          id?: string
          produto_id?: string | null
          quantidade_minima?: number
          status?: string
          tipo_desconto?: string
          tipo_valor?: string
          valor_desconto?: number
        }
        Update: {
          categoria?: string
          created_at?: string
          filial_id?: string
          id?: string
          produto_id?: string | null
          quantidade_minima?: number
          status?: string
          tipo_desconto?: string
          tipo_valor?: string
          valor_desconto?: number
        }
        Relationships: [
          {
            foreignKeyName: "descontos_atacado_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          ambiente: string
          ativa: boolean
          bairro: string
          celular: string
          cep: string
          cidade: string
          cnae: string
          cnpj: string
          codigo_ibge: string
          codigo_municipio: string
          created_at: string
          email: string
          endereco: string
          estado: string
          filial_id: string | null
          filial_padrao: boolean
          id: string
          inscricao_estadual: string
          nome_fantasia: string
          numero: string
          razao_social: string
          regime_tributario: string
          serie_nf: string
          telefone: string
        }
        Insert: {
          ambiente?: string
          ativa?: boolean
          bairro?: string
          celular?: string
          cep?: string
          cidade?: string
          cnae?: string
          cnpj: string
          codigo_ibge?: string
          codigo_municipio?: string
          created_at?: string
          email?: string
          endereco?: string
          estado?: string
          filial_id?: string | null
          filial_padrao?: boolean
          id?: string
          inscricao_estadual?: string
          nome_fantasia?: string
          numero?: string
          razao_social: string
          regime_tributario?: string
          serie_nf?: string
          telefone?: string
        }
        Update: {
          ambiente?: string
          ativa?: boolean
          bairro?: string
          celular?: string
          cep?: string
          cidade?: string
          cnae?: string
          cnpj?: string
          codigo_ibge?: string
          codigo_municipio?: string
          created_at?: string
          email?: string
          endereco?: string
          estado?: string
          filial_id?: string | null
          filial_padrao?: boolean
          id?: string
          inscricao_estadual?: string
          nome_fantasia?: string
          numero?: string
          razao_social?: string
          regime_tributario?: string
          serie_nf?: string
          telefone?: string
        }
        Relationships: []
      }
      estoque: {
        Row: {
          created_at: string
          filial_id: string
          id: string
          produto_id: string
          quantidade: number
        }
        Insert: {
          created_at?: string
          filial_id?: string
          id?: string
          produto_id: string
          quantidade?: number
        }
        Update: {
          created_at?: string
          filial_id?: string
          id?: string
          produto_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedor_produtos: {
        Row: {
          created_at: string
          fornecedor_id: string
          id: string
          produto_id: string
        }
        Insert: {
          created_at?: string
          fornecedor_id: string
          id?: string
          produto_id: string
        }
        Update: {
          created_at?: string
          fornecedor_id?: string
          id?: string
          produto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fornecedor_produtos_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fornecedor_produtos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          cidade: string
          cnpj_cpf: string
          codigo: string
          created_at: string
          email: string
          endereco: string
          estado: string
          filial_id: string
          id: string
          nome: string
          observacoes: string
          status: string
          telefone: string
        }
        Insert: {
          cidade?: string
          cnpj_cpf?: string
          codigo?: string
          created_at?: string
          email?: string
          endereco?: string
          estado?: string
          filial_id?: string
          id?: string
          nome: string
          observacoes?: string
          status?: string
          telefone?: string
        }
        Update: {
          cidade?: string
          cnpj_cpf?: string
          codigo?: string
          created_at?: string
          email?: string
          endereco?: string
          estado?: string
          filial_id?: string
          id?: string
          nome?: string
          observacoes?: string
          status?: string
          telefone?: string
        }
        Relationships: []
      }
      funcionarios_auth: {
        Row: {
          cargo: string | null
          codigo_acesso: string
          cpf: string
          created_at: string | null
          filial_id: string | null
          id: string
          nome: string
          status: string | null
          telefone: string | null
          user_id: string | null
        }
        Insert: {
          cargo?: string | null
          codigo_acesso: string
          cpf?: string
          created_at?: string | null
          filial_id?: string | null
          id?: string
          nome: string
          status?: string | null
          telefone?: string | null
          user_id?: string | null
        }
        Update: {
          cargo?: string | null
          codigo_acesso?: string
          cpf?: string
          created_at?: string | null
          filial_id?: string | null
          id?: string
          nome?: string
          status?: string | null
          telefone?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          cpf: string
          created_at: string
          id: string
          ip_address: string | null
          success: boolean
        }
        Insert: {
          cpf: string
          created_at?: string
          id?: string
          ip_address?: string | null
          success?: boolean
        }
        Update: {
          cpf?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          success?: boolean
        }
        Relationships: []
      }
      notas_fiscais: {
        Row: {
          chave_acesso: string
          client_cnpj: string
          client_name: string
          created_at: string
          data_emissao: string
          empresa_id: string | null
          filial_id: string
          fornecedor_cnpj: string
          fornecedor_nome: string
          id: string
          numero: number
          observacoes: string
          pdf_url: string
          status: string
          tipo_operacao: string
          valor_total: number
          venda_id: string | null
          xml_url: string
        }
        Insert: {
          chave_acesso?: string
          client_cnpj?: string
          client_name?: string
          created_at?: string
          data_emissao?: string
          empresa_id?: string | null
          filial_id?: string
          fornecedor_cnpj?: string
          fornecedor_nome?: string
          id?: string
          numero?: number
          observacoes?: string
          pdf_url?: string
          status?: string
          tipo_operacao?: string
          valor_total?: number
          venda_id?: string | null
          xml_url?: string
        }
        Update: {
          chave_acesso?: string
          client_cnpj?: string
          client_name?: string
          created_at?: string
          data_emissao?: string
          empresa_id?: string | null
          filial_id?: string
          fornecedor_cnpj?: string
          fornecedor_nome?: string
          id?: string
          numero?: number
          observacoes?: string
          pdf_url?: string
          status?: string
          tipo_operacao?: string
          valor_total?: number
          venda_id?: string | null
          xml_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_fiscais_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          created_at: string | null
          description: string | null
          id: string
          module: string
        }
        Insert: {
          action: string
          created_at?: string | null
          description?: string | null
          id?: string
          module: string
        }
        Update: {
          action?: string
          created_at?: string | null
          description?: string | null
          id?: string
          module?: string
        }
        Relationships: []
      }
      produtos: {
        Row: {
          altura_lente: number
          barcode: string
          bridge_size: number
          categoria_acessorio: string
          categoria_idade: string
          category: string
          classificacao: string
          code: string
          color: string
          cor_acessorio: string
          cor_armacao: string
          cor_haste: string
          created_at: string
          custo: number
          description: string
          estilo: string
          filial_id: string
          genero: string
          hash_produto: string
          id: string
          image_url: string
          is_acessorio: boolean
          lens_size: number
          material: string
          material_acessorio: string
          material_aro: string
          material_haste: string
          min_stock: number
          model: string
          ncm: string
          polarizado: string
          ponte_armacao: string
          referencia: string
          retail_price: number
          status: string
          stock: number
          subcategoria_acessorio: string
          temple_size: number
          tipo_acessorio: string
          tipo_haste: string
          tipo_lente: string
          tipo_produto_id: string | null
          tipo_venda: string
          variacao_acessorio: string
          wholesale_min_qty: number
          wholesale_price: number
        }
        Insert: {
          altura_lente?: number
          barcode?: string
          bridge_size?: number
          categoria_acessorio?: string
          categoria_idade?: string
          category?: string
          classificacao?: string
          code: string
          color?: string
          cor_acessorio?: string
          cor_armacao?: string
          cor_haste?: string
          created_at?: string
          custo?: number
          description?: string
          estilo?: string
          filial_id?: string
          genero?: string
          hash_produto?: string
          id?: string
          image_url?: string
          is_acessorio?: boolean
          lens_size?: number
          material?: string
          material_acessorio?: string
          material_aro?: string
          material_haste?: string
          min_stock?: number
          model: string
          ncm?: string
          polarizado?: string
          ponte_armacao?: string
          referencia?: string
          retail_price?: number
          status?: string
          stock?: number
          subcategoria_acessorio?: string
          temple_size?: number
          tipo_acessorio?: string
          tipo_haste?: string
          tipo_lente?: string
          tipo_produto_id?: string | null
          tipo_venda?: string
          variacao_acessorio?: string
          wholesale_min_qty?: number
          wholesale_price?: number
        }
        Update: {
          altura_lente?: number
          barcode?: string
          bridge_size?: number
          categoria_acessorio?: string
          categoria_idade?: string
          category?: string
          classificacao?: string
          code?: string
          color?: string
          cor_acessorio?: string
          cor_armacao?: string
          cor_haste?: string
          created_at?: string
          custo?: number
          description?: string
          estilo?: string
          filial_id?: string
          genero?: string
          hash_produto?: string
          id?: string
          image_url?: string
          is_acessorio?: boolean
          lens_size?: number
          material?: string
          material_acessorio?: string
          material_aro?: string
          material_haste?: string
          min_stock?: number
          model?: string
          ncm?: string
          polarizado?: string
          ponte_armacao?: string
          referencia?: string
          retail_price?: number
          status?: string
          stock?: number
          subcategoria_acessorio?: string
          temple_size?: number
          tipo_acessorio?: string
          tipo_haste?: string
          tipo_lente?: string
          tipo_produto_id?: string | null
          tipo_venda?: string
          variacao_acessorio?: string
          wholesale_min_qty?: number
          wholesale_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "produtos_tipo_produto_id_fkey"
            columns: ["tipo_produto_id"]
            isOneToOne: false
            referencedRelation: "tipos_produto"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          id: string
          nome: string
          tipo: string
        }
        Insert: {
          created_at?: string | null
          email?: string
          id: string
          nome?: string
          tipo?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          nome?: string
          tipo?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      security_alerts: {
        Row: {
          alert_type: string
          created_at: string
          details: Json | null
          id: string
          message: string
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          user_id: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string
          details?: Json | null
          id?: string
          message: string
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          user_id?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          details?: Json | null
          id?: string
          message?: string
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          user_id?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          value?: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          value?: string
        }
        Relationships: []
      }
      tipos_produto: {
        Row: {
          created_at: string
          estoque_minimo_alerta: number
          id: string
          nome_tipo: string
        }
        Insert: {
          created_at?: string
          estoque_minimo_alerta?: number
          id?: string
          nome_tipo: string
        }
        Update: {
          created_at?: string
          estoque_minimo_alerta?: number
          id?: string
          nome_tipo?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      venda_item_cancelamentos: {
        Row: {
          created_at: string
          id: string
          motivo: string
          produto_id: string
          quantity: number
          unit_price: number
          usuario_id: string
          usuario_nome: string
          venda_id: string
          venda_item_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          motivo?: string
          produto_id: string
          quantity?: number
          unit_price?: number
          usuario_id: string
          usuario_nome?: string
          venda_id: string
          venda_item_id: string
        }
        Update: {
          created_at?: string
          id?: string
          motivo?: string
          produto_id?: string
          quantity?: number
          unit_price?: number
          usuario_id?: string
          usuario_nome?: string
          venda_id?: string
          venda_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venda_item_cancelamentos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_item_cancelamentos_venda_item_id_fkey"
            columns: ["venda_item_id"]
            isOneToOne: false
            referencedRelation: "venda_items"
            referencedColumns: ["id"]
          },
        ]
      }
      venda_items: {
        Row: {
          custo_unitario: number
          id: string
          product_code: string
          product_model: string
          produto_id: string
          quantity: number
          status: string
          total: number
          unit_price: number
          venda_id: string
        }
        Insert: {
          custo_unitario?: number
          id?: string
          product_code?: string
          product_model?: string
          produto_id: string
          quantity?: number
          status?: string
          total?: number
          unit_price?: number
          venda_id: string
        }
        Update: {
          custo_unitario?: number
          id?: string
          product_code?: string
          product_model?: string
          produto_id?: string
          quantity?: number
          status?: string
          total?: number
          unit_price?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venda_items_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_items_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas: {
        Row: {
          cancelled_at: string | null
          cancelled_by_id: string | null
          cancelled_by_name: string | null
          client_id: string | null
          client_name: string
          created_at: string
          discount: number
          filial_id: string
          id: string
          motivo_cancelamento: string | null
          number: number
          origin: string
          payment_method: string
          sale_code: string
          seller_name: string
          status: string
          status_boleto: string
          total: number
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by_id?: string | null
          cancelled_by_name?: string | null
          client_id?: string | null
          client_name?: string
          created_at?: string
          discount?: number
          filial_id?: string
          id?: string
          motivo_cancelamento?: string | null
          number?: number
          origin?: string
          payment_method?: string
          sale_code?: string
          seller_name?: string
          status?: string
          status_boleto?: string
          total?: number
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by_id?: string | null
          cancelled_by_name?: string | null
          client_id?: string | null
          client_name?: string
          created_at?: string
          discount?: number
          filial_id?: string
          id?: string
          motivo_cancelamento?: string | null
          number?: number
          origin?: string
          payment_method?: string
          sale_code?: string
          seller_name?: string
          status?: string
          status_boleto?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_write: { Args: { _user_id: string }; Returns: boolean }
      cancelar_item_venda: {
        Args: {
          _motivo: string
          _user_id: string
          _user_name: string
          _venda_item_id: string
        }
        Returns: undefined
      }
      cancelar_venda: {
        Args: {
          _motivo: string
          _user_id: string
          _user_name: string
          _venda_id: string
        }
        Returns: undefined
      }
      generate_compra_code: { Args: never; Returns: string }
      generate_fornecedor_code: { Args: never; Returns: string }
      generate_product_codes: { Args: never; Returns: Json }
      get_profiles_count: { Args: never; Returns: number }
      get_user_permissions: {
        Args: { _user_id: string }
        Returns: {
          action: string
          module: string
        }[]
      }
      has_permission: {
        Args: { _action: string; _module: string; _user_id: string }
        Returns: boolean
      }
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
      reconcile_inventory_for_product: {
        Args: { _filial_id: string; _produto_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
