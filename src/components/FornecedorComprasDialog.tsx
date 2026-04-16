import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFilial } from "@/contexts/FilialContext";
import { useComprasFornecedor } from "@/hooks/useFornecedores";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CurrencyInput } from "@/components/ui/currency-input";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fornecedor: { id: string; nome: string } | null;
}

export function FornecedorComprasDialog({ open, onOpenChange, fornecedor }: Props) {
  const { data: compras, refetch } = useComprasFornecedor(fornecedor?.id ?? null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ descricao: "", valor_total: 0, data_compra: "", observacoes: "" });
  const { profile } = useAuth();
  const { selectedFilial } = useFilial();

  const handleSave = async () => {
    if (!fornecedor || !profile) return;
    if (!form.descricao.trim()) { toast.error("Descrição é obrigatória"); return; }
    setSaving(true);
    const { error } = await (supabase as any)
      .from("compras_fornecedor")
      .insert({
        fornecedor_id: fornecedor.id,
        descricao: form.descricao,
        valor_total: form.valor_total,
        data_compra: form.data_compra || new Date().toISOString(),
        observacoes: form.observacoes,
        filial_id: selectedFilial,
        usuario_id: profile.id,
        usuario_nome: profile.nome,
      });
    if (error) toast.error("Erro ao registrar compra");
    else {
      toast.success("Compra registrada");
      setForm({ descricao: "", valor_total: 0, data_compra: "", observacoes: "" });
      setShowForm(false);
      refetch();
    }
    setSaving(false);
  };

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("pt-BR");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico de Compras — {fornecedor?.nome}</DialogTitle>
        </DialogHeader>

        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-1" /> Nova Compra
          </Button>
        </div>

        {showForm && (
          <div className="border rounded-md p-3 space-y-3 bg-muted/30">
            <div>
              <Label>Descrição *</Label>
              <Input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor Total</Label>
                <CurrencyInput value={form.valor_total} onValueChange={v => setForm(f => ({ ...f, valor_total: v }))} />
              </div>
              <div>
                <Label>Data da Compra</Label>
                <Input type="date" value={form.data_compra} onChange={e => setForm(f => ({ ...f, data_compra: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? "Salvando..." : "Registrar Compra"}
            </Button>
          </div>
        )}

        {compras.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma compra registrada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Usuário</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compras.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(c.data_compra)}</TableCell>
                  <TableCell>{c.descricao}</TableCell>
                  <TableCell className="whitespace-nowrap font-medium">{formatCurrency(c.valor_total)}</TableCell>
                  <TableCell className="text-muted-foreground">{c.usuario_nome}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
