import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { useCompraItems, CompraComFornecedor } from "@/hooks/useHistoricoCompras";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  compra: CompraComFornecedor | null;
  onRefetch?: () => void;
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function CompraDetailDialog({ open, onOpenChange, compra, onRefetch }: Props) {
  const { data: items, loading } = useCompraItems(compra?.id ?? null);
  const { profile, isAdmin } = useAuth();
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ descricao: "", valor_total: 0, observacoes: "" });
  const [saving, setSaving] = useState(false);

  if (!compra) return null;

  const startEdit = () => {
    setEditForm({
      descricao: compra.descricao || "",
      valor_total: compra.valor_total,
      observacoes: compra.observacoes || "",
    });
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const oldValor = compra.valor_total;
      const newValor = editForm.valor_total;
      const diferenca = newValor - oldValor;

      const { error } = await (supabase as any)
        .from("compras_fornecedor")
        .update({
          descricao: editForm.descricao,
          valor_total: newValor,
          observacoes: editForm.observacoes,
        })
        .eq("id", compra.id);

      if (error) throw error;

      // Adjust caixa if value changed
      if (diferenca !== 0) {
        const { data: caixaAberto } = await (supabase as any)
          .from("caixas")
          .select("id")
          .eq("filial_id", compra.filial_id)
          .eq("status", "aberto")
          .maybeSingle();

        if (caixaAberto) {
          await (supabase as any).from("caixa_movimentacoes").insert({
            caixa_id: caixaAberto.id,
            tipo: diferenca > 0 ? "saida" : "entrada",
            valor: Math.abs(diferenca),
            forma_pagamento: "dinheiro",
            descricao: `Ajuste compra ${compra.codigo}: ${diferenca > 0 ? "acréscimo" : "redução"} de ${fmt(Math.abs(diferenca))}`,
            usuario_id: profile.id,
            usuario_nome: profile.nome,
          });
        }
      }

      toast.success("Compra atualizada");
      setEditing(false);
      onRefetch?.();
    } catch (err: any) {
      toast.error("Erro ao atualizar: " + (err.message || ""));
    }
    setSaving(false);
  };

  const handleCancel = async () => {
    if (!profile) return;
    setCancelling(true);
    try {
      // Reverse the expense in caixa
      const { data: caixaAberto } = await (supabase as any)
        .from("caixas")
        .select("id")
        .eq("filial_id", compra.filial_id)
        .eq("status", "aberto")
        .maybeSingle();

      if (caixaAberto) {
        await (supabase as any).from("caixa_movimentacoes").insert({
          caixa_id: caixaAberto.id,
          tipo: "entrada",
          valor: compra.valor_total,
          forma_pagamento: "dinheiro",
          descricao: `Estorno compra cancelada ${compra.codigo} — ${compra.fornecedor?.nome || ""}`,
          usuario_id: profile.id,
          usuario_nome: profile.nome,
        });
      }

      // Delete compra_items
      await (supabase as any).from("compra_items").delete().eq("compra_id", compra.id);
      // Delete the compra
      const { error } = await (supabase as any).from("compras_fornecedor").delete().eq("id", compra.id);
      if (error) throw error;

      toast.success("Compra cancelada e estornada no caixa");
      setShowConfirmCancel(false);
      onOpenChange(false);
      onRefetch?.();
    } catch (err: any) {
      toast.error("Erro ao cancelar: " + (err.message || ""));
    }
    setCancelling(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Detalhes da Compra
              <Badge variant="outline" className="font-mono">{compra.codigo}</Badge>
            </DialogTitle>
          </DialogHeader>

          {editing ? (
            <div className="space-y-3">
              <div>
                <Label>Descrição</Label>
                <Input value={editForm.descricao} onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))} />
              </div>
              <div>
                <Label>Valor Total</Label>
                <CurrencyInput value={editForm.valor_total} onValueChange={v => setEditForm(f => ({ ...f, valor_total: v }))} />
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea value={editForm.observacoes} onChange={e => setEditForm(f => ({ ...f, observacoes: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveEdit} disabled={saving} className="flex-1">
                  {saving ? "Salvando..." : "Salvar Alterações"}
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Fornecedor:</span>
                  <p className="font-medium">{compra.fornecedor?.nome ?? "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Data:</span>
                  <p className="font-medium">{fmtDate(compra.data_compra)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Valor Total:</span>
                  <p className="font-medium text-primary">{fmt(compra.valor_total)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Registrado por:</span>
                  <p className="font-medium">{compra.usuario_nome}</p>
                </div>
                {compra.descricao && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Descrição:</span>
                    <p>{compra.descricao}</p>
                  </div>
                )}
                {compra.observacoes && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Observações:</span>
                    <p>{compra.observacoes}</p>
                  </div>
                )}
              </div>

              {isAdmin && (
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" onClick={startEdit}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setShowConfirmCancel(true)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Cancelar Compra
                  </Button>
                </div>
              )}

              <h4 className="font-semibold text-sm mt-2">Produtos</h4>
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum produto registrado nesta compra.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead className="text-center">Qtd</TableHead>
                      <TableHead className="text-right">Vlr. Unit.</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">{item.produto_code}</TableCell>
                        <TableCell>{item.produto_model}</TableCell>
                        <TableCell className="text-center">{item.quantidade}</TableCell>
                        <TableCell className="text-right">{fmt(item.valor_unitario)}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(item.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirmCancel} onOpenChange={setShowConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar compra {compra.codigo}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá remover a compra e estornar o valor de {fmt(compra.valor_total)} no caixa. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelling} className="bg-destructive text-destructive-foreground">
              {cancelling ? "Cancelando..." : "Confirmar Cancelamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
