import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Plus, Pencil, Trash2, Percent, DollarSign, Package, Layers, ShoppingBag, Glasses } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useFilial } from "@/contexts/FilialContext";
import { useDescontosAtacado, type DescontoAtacado } from "@/hooks/useDescontosAtacado";
import { ESTILOS } from "@/data/productConstants";
import { TODAS_CATEGORIAS_ACESSORIO } from "@/data/accessoryConstants";
import { maskPercent, parsePercent, formatCentsToDisplay } from "@/lib/masks";
import { toast } from "sonner";

interface AtacadoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TIPO_DESCONTO_OPTIONS = [
  { value: "todos", label: "Todos os produtos e acessórios" },
  { value: "todas_armacoes", label: "Todas as armações" },
  { value: "todos_acessorios", label: "Todos os acessórios" },
  { value: "armacao_especifica", label: "Armação específica" },
  { value: "acessorio_especifico", label: "Acessório específico" },
] as const;

const EMPTY_FORM = {
  tipo_desconto: "todos" as string,
  categoria: "" as string,
  quantidade_minima: 6,
  tipo_valor: "percentual" as string,
  valor_desconto: 0,
};

const sortedEstilos = [...ESTILOS].sort((a, b) => a.localeCompare(b, "pt-BR"));
const sortedCategorias = [...TODAS_CATEGORIAS_ACESSORIO].sort((a, b) => a.localeCompare(b, "pt-BR"));

export function AtacadoDialog({ open, onOpenChange }: AtacadoDialogProps) {
  const { selectedFilial } = useFilial();
  const { data: descontos } = useDescontosAtacado();

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (d: DescontoAtacado) => {
    setForm({
      tipo_desconto: d.tipo_desconto,
      categoria: d.categoria,
      quantidade_minima: d.quantidade_minima,
      tipo_valor: d.tipo_valor,
      valor_desconto: d.valor_desconto,
    });
    setEditingId(d.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (form.valor_desconto <= 0) { toast.error("Informe o valor do desconto"); return; }
    if (form.quantidade_minima < 1) { toast.error("Quantidade mínima deve ser pelo menos 1"); return; }
    if ((form.tipo_desconto === "armacao_especifica" || form.tipo_desconto === "acessorio_especifico") && !form.categoria) {
      toast.error("Selecione uma opção"); return;
    }
    if (form.tipo_valor === "percentual" && form.valor_desconto > 100) { toast.error("Percentual não pode exceder 100%"); return; }

    setSaving(true);
    const fId = selectedFilial === "all" ? "1" : selectedFilial;

    const payload = {
      tipo_desconto: form.tipo_desconto,
      produto_id: null,
      categoria: (form.tipo_desconto === "armacao_especifica" || form.tipo_desconto === "acessorio_especifico") ? form.categoria : "",
      quantidade_minima: form.quantidade_minima,
      tipo_valor: form.tipo_valor,
      valor_desconto: form.valor_desconto,
      filial_id: fId,
      status: "active",
    };

    let error;
    if (editingId) {
      ({ error } = await (supabase as any).from("descontos_atacado").update(payload).eq("id", editingId));
    } else {
      ({ error } = await (supabase as any).from("descontos_atacado").insert(payload));
    }

    setSaving(false);
    if (error) { toast.error("Erro ao salvar desconto atacado"); return; }
    toast.success(editingId ? "Desconto atualizado" : "Desconto criado");
    resetForm();
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const { error } = await (supabase as any).from("descontos_atacado").delete().eq("id", deletingId);
    if (error) { toast.error("Erro ao remover desconto"); } else { toast.success("Desconto removido"); }
    setDeletingId(null);
  };

  const getDescontoLabel = (d: DescontoAtacado) => {
    if (d.tipo_desconto === "armacao_especifica" || d.tipo_desconto === "acessorio_especifico") return d.categoria || "—";
    const opt = TIPO_DESCONTO_OPTIONS.find(o => o.value === d.tipo_desconto);
    if (opt) return opt.label;
    if (d.tipo_desconto === "todas") return "Todas as armações";
    return d.tipo_desconto;
  };

  const getDescontoIcon = (tipo: string) => {
    if (tipo === "armacao_especifica") return <Glasses className="h-4 w-4" />;
    if (tipo === "acessorio_especifico") return <Package className="h-4 w-4" />;
    if (tipo === "todas_armacoes" || tipo === "todas") return <Glasses className="h-4 w-4" />;
    if (tipo === "todos_acessorios") return <ShoppingBag className="h-4 w-4" />;
    return <Layers className="h-4 w-4" />;
  };

  const formatValor = (d: DescontoAtacado) => {
    if (d.tipo_valor === "percentual") return `${d.valor_desconto}%`;
    return `R$ ${Number(d.valor_desconto).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-title">Descontos Atacado</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {!showForm && (
              <Button size="sm" className="gap-1.5" onClick={() => { resetForm(); setShowForm(true); }}>
                <Plus className="h-4 w-4" />
                Novo Desconto
              </Button>
            )}

            {showForm && (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                <h3 className="text-ui font-semibold">{editingId ? "Editar Desconto" : "Novo Desconto"}</h3>

                <div className="space-y-1.5">
                  <Label>Tipo de desconto</Label>
                  <Select value={form.tipo_desconto} onValueChange={v => setForm(f => ({ ...f, tipo_desconto: v, categoria: "" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPO_DESCONTO_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {form.tipo_desconto === "armacao_especifica" && (
                  <div className="space-y-1.5">
                    <Label>Estilo de armação</Label>
                    <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione um estilo" /></SelectTrigger>
                      <SelectContent>
                        {sortedEstilos.map(e => (
                          <SelectItem key={e} value={e}>{e}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {form.tipo_desconto === "acessorio_especifico" && (
                  <div className="space-y-1.5">
                    <Label>Categoria de acessório</Label>
                    <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione uma categoria" /></SelectTrigger>
                      <SelectContent>
                        {sortedCategorias.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Qtd. mínima</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.quantidade_minima}
                      onChange={e => setForm(f => ({ ...f, quantidade_minima: parseInt(e.target.value) || 1 }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tipo de valor</Label>
                    <Select value={form.tipo_valor} onValueChange={v => setForm(f => ({ ...f, tipo_valor: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentual">Percentual (%)</SelectItem>
                        <SelectItem value="fixo">Valor fixo (R$)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Valor do desconto</Label>
                    {form.tipo_valor === "fixo" ? (
                      <CurrencyInput
                        value={form.valor_desconto}
                        onValueChange={v => setForm(f => ({ ...f, valor_desconto: v }))}
                        placeholder="0,00"
                      />
                    ) : (
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={maskPercent(String(Math.round(form.valor_desconto * 100)))}
                        onChange={e => {
                          const v = parsePercent(e.target.value);
                          setForm(f => ({ ...f, valor_desconto: v }));
                        }}
                        placeholder="0,00"
                      />
                    )}
                  </div>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={resetForm}>Cancelar</Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {editingId ? "Salvar Alterações" : "Concluir Atacado"}
                  </Button>
                </div>
              </div>
            )}

            {descontos.length === 0 && !showForm ? (
              <p className="text-ui text-muted-foreground text-center py-8">Nenhum desconto de atacado cadastrado</p>
            ) : (
              <div className="space-y-2">
                {descontos.map(d => (
                  <div key={d.id} className="flex items-center justify-between rounded-lg border bg-card p-3 group hover:shadow-sm transition-shadow">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center justify-center h-8 w-8 rounded-md bg-primary/10 text-primary shrink-0">
                        {getDescontoIcon(d.tipo_desconto)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-ui font-medium truncate">{getDescontoLabel(d)}</p>
                        <div className="flex items-center gap-2 text-caption text-muted-foreground">
                          <span>Mín. {d.quantidade_minima} un.</span>
                          <span>·</span>
                          <span className="flex items-center gap-0.5">
                            {d.tipo_valor === "percentual" ? <Percent className="h-3 w-3" /> : <DollarSign className="h-3 w-3" />}
                            {formatValor(d)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="secondary" size="icon" className="h-7 w-7" onClick={() => startEdit(d)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => setDeletingId(d.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={o => { if (!o) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover desconto?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
