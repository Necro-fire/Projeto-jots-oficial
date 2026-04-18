import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, User, Package, ShoppingCart, RotateCcw, ArrowLeftRight, Pencil, Plus, CheckCircle2, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useNavigate } from "react-router-dom";
import type { Consignado } from "@/hooks/useConsignados";
import { ConsignadoClienteHistoricoDialog } from "./ConsignadoClienteHistoricoDialog";

interface Props {
  items: Consignado[];
  filialId: string;
  onMarkVendido: (item: Consignado) => void;
  onMarkDevolvido: (item: Consignado) => void;
  onTrocar: (item: Consignado) => void;
  onEdit?: (item: Consignado) => void;
}

interface ClienteCart {
  clienteId: string | null;
  clienteNome: string;
  clienteLoja: string;
  items: Consignado[];
  totalValor: number;
  totalQtd: number;
  ultimaAtualizacao: string;
}

/**
 * Visão "Carrinho persistente por cliente": agrupa consignados ATIVOS por cliente,
 * permitindo gerenciar tudo que o cliente tem em mãos antes da venda final.
 */
export function ConsignadoCarrinhoCliente({ items, filialId, onMarkVendido, onMarkDevolvido, onTrocar, onEdit }: Props) {
  const navigate = useNavigate();
  const [openClients, setOpenClients] = useState<Set<string>>(new Set());
  const [historyCart, setHistoryCart] = useState<ClienteCart | null>(null);

  // All consignados grouped by client (used for client-level history dialog)
  const allByClient = useMemo(() => {
    const map = new Map<string, Consignado[]>();
    for (const item of items) {
      const key = item.cliente_id || "__sem_cliente__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [items]);

  const carts = useMemo<ClienteCart[]>(() => {
    const onlyActive = items.filter(i => i.status === "consignado");
    const map = new Map<string, ClienteCart>();

    for (const item of onlyActive) {
      const key = item.cliente_id || "__sem_cliente__";
      const existing = map.get(key);
      if (existing) {
        existing.items.push(item);
        existing.totalValor += Number(item.valor_total);
        existing.totalQtd += item.quantidade;
        if (item.updated_at > existing.ultimaAtualizacao) {
          existing.ultimaAtualizacao = item.updated_at;
        }
      } else {
        map.set(key, {
          clienteId: item.cliente_id,
          clienteNome: item.cliente_nome || "",
          clienteLoja: item.cliente_loja || "Sem cliente vinculado",
          items: [item],
          totalValor: Number(item.valor_total),
          totalQtd: item.quantidade,
          ultimaAtualizacao: item.updated_at,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      b.ultimaAtualizacao.localeCompare(a.ultimaAtualizacao)
    );
  }, [items]);

  const toggleClient = (key: string) => {
    setOpenClients(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleAdicionarMais = (clienteId: string | null) => {
    navigate("/pdv", {
      state: {
        consignacaoMode: true,
        filialId,
        prefilledClient: clienteId || undefined,
      },
    });
  };

  const handleConverterEmVenda = (cart: ClienteCart) => {
    if (!cart.clienteId) return;
    navigate("/pdv", {
      state: {
        fromCarrinhoConsignado: {
          clienteId: cart.clienteId,
          filialId,
          consignados: cart.items.map(it => ({
            consignadoId: it.id,
            produtoId: it.produto_id,
            quantidade: it.quantidade,
          })),
        },
      },
    });
  };

  const renderHistoryDialog = () => (
    <ConsignadoClienteHistoricoDialog
      open={!!historyCart}
      onOpenChange={o => { if (!o) setHistoryCart(null); }}
      clienteId={historyCart?.clienteId || null}
      clienteLabel={historyCart ? `${historyCart.clienteLoja}${historyCart.clienteNome && historyCart.clienteNome !== historyCart.clienteLoja ? ` · ${historyCart.clienteNome}` : ""}` : ""}
      consignadosDoCliente={historyCart ? (allByClient.get(historyCart.clienteId || "__sem_cliente__") || []) : []}
    />
  );

  if (carts.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg">
          <Package className="h-10 w-10 mb-2 opacity-30" />
          <p className="text-ui font-medium">Nenhum carrinho de consignação aberto</p>
          <p className="text-caption mt-1">Inicie uma nova consignação no PDV para criar um carrinho de cliente.</p>
        </div>
        {renderHistoryDialog()}
      </>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md bg-muted/50 border px-3 py-2 text-caption text-muted-foreground">
        💡 Cada cliente possui um <strong>carrinho persistente</strong> com seus produtos consignados ativos. Edite, troque, devolva ou converta em venda a qualquer momento.
      </div>

      {carts.map(cart => {
        const key = cart.clienteId || "__sem_cliente__";
        const isOpen = openClients.has(key);
        return (
          <Collapsible key={key} open={isOpen} onOpenChange={() => toggleClient(key)}>
            <div className="rounded-lg border bg-card overflow-hidden">
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left">
                  {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-ui font-semibold truncate">{cart.clienteLoja}</span>
                      {cart.clienteNome && cart.clienteNome !== cart.clienteLoja && (
                        <span className="text-caption text-muted-foreground">· {cart.clienteNome}</span>
                      )}
                    </div>
                    <p className="text-caption text-muted-foreground">
                      {cart.items.length} {cart.items.length === 1 ? "registro" : "registros"} · {cart.totalQtd} un. · Atualizado {new Date(cart.ultimaAtualizacao).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-caption tabular-nums">
                      R$ {cart.totalValor.toFixed(2)}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1 h-8"
                      onClick={(e) => { e.stopPropagation(); setHistoryCart(cart); }}
                      title="Ver histórico completo do cliente"
                    >
                      <History className="h-3.5 w-3.5" />
                      Histórico
                    </Button>
                    {cart.clienteId && (
                      <>
                        <Button
                          size="sm"
                          className="gap-1 h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={(e) => { e.stopPropagation(); handleConverterEmVenda(cart); }}
                          title="Cliente decidiu ficar com os produtos — converter em venda no PDV"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Converter em venda
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 h-8"
                          onClick={(e) => { e.stopPropagation(); handleAdicionarMais(cart.clienteId); }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Adicionar
                        </Button>
                      </>
                    )}
                  </div>
                </button>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="border-t divide-y">
                  {cart.items.map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-3 pl-12">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-ui font-medium font-mono">{item.codigo}</span>
                          <Badge variant="outline" className="text-caption">{item.quantidade} un.</Badge>
                        </div>
                        <p className="text-caption text-muted-foreground mt-0.5">
                          {item.produto_referencia || item.produto_code} · {item.produto_model}
                        </p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          R$ {Number(item.valor_unitario).toFixed(2)} un. · Total R$ {Number(item.valor_total).toFixed(2)}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {onEdit && (
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(item)} title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                          onClick={() => onMarkVendido(item)}
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />
                          Vender
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => onTrocar(item)}
                          title="Trocar"
                        >
                          <ArrowLeftRight className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-blue-600 border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                          onClick={() => onMarkDevolvido(item)}
                          title="Devolver"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}
      {renderHistoryDialog()}
    </div>
  );
}
