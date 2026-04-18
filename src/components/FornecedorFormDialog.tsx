import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Globe, Building2, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useFilial } from "@/contexts/FilialContext";
import { toast } from "sonner";
import { maskCpfCnpj, maskCelular, ESTADOS_BR } from "@/lib/masks";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: any;
  onSaved: () => void;
}

const empty = {
  nome: "", cnpj_cpf: "", telefone: "", email: "",
  endereco: "", cidade: "", estado: "", observacoes: "",
};

export function FornecedorFormDialog({ open, onOpenChange, editing, onSaved }: Props) {
  const [form, setForm] = useState(empty);
  const [isGlobal, setIsGlobal] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const { selectedFilial } = useFilial();

  useEffect(() => {
    if (editing) {
      setForm({
        nome: editing.nome || "",
        cnpj_cpf: editing.cnpj_cpf || "",
        telefone: editing.telefone || "",
        email: editing.email || "",
        endereco: editing.endereco || "",
        cidade: editing.cidade || "",
        estado: editing.estado || "",
        observacoes: editing.observacoes || "",
      });
      setIsGlobal(editing.filial_id === "all");
      setIsActive((editing.status ?? "active") === "active");
    } else {
      setForm(empty);
      // Se está visualizando "Todas as filiais", default para global
      setIsGlobal(selectedFilial === "all");
      setIsActive(true);
    }
  }, [editing, open, selectedFilial]);

  const handleSave = async () => {
    if (!form.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    // Determinar filial_id final
    let targetFilial: string;
    if (isGlobal) {
      targetFilial = "all";
    } else if (editing?.id) {
      // Edição local: mantém a filial atual do registro (ou usa selectedFilial se vier de global → local)
      targetFilial = editing.filial_id === "all" ? (selectedFilial !== "all" ? selectedFilial : "1") : editing.filial_id;
    } else {
      // Novo local: precisa de uma filial específica
      if (selectedFilial === "all") {
        toast.error("Selecione uma filial específica para cadastrar fornecedor local, ou marque como Global.");
        return;
      }
      targetFilial = selectedFilial;
    }

    setSaving(true);
    try {
      const status = isActive ? "active" : "inactive";
      if (editing?.id) {
        const { error } = await (supabase as any)
          .from("fornecedores")
          .update({ ...form, filial_id: targetFilial, status })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success(isGlobal ? "Fornecedor global atualizado (todas as filiais)" : "Fornecedor atualizado");
      } else {
        const { error } = await (supabase as any)
          .from("fornecedores")
          .insert({ ...form, filial_id: targetFilial, status });
        if (error) throw error;
        toast.success(isGlobal ? "Fornecedor global cadastrado" : "Fornecedor cadastrado");
      }
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar Fornecedor" : "Novo Fornecedor"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
            <div className="flex items-center gap-2">
              {isGlobal ? <Globe className="h-4 w-4 text-primary" /> : <Building2 className="h-4 w-4 text-muted-foreground" />}
              <div>
                <Label className="text-sm font-medium cursor-pointer" htmlFor="global-switch">
                  {isGlobal ? "Fornecedor Global" : "Fornecedor Local"}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {isGlobal
                    ? "Vinculado a todas as filiais"
                    : `Vinculado apenas à ${selectedFilial === "all" ? "filial selecionada" : "Filial " + selectedFilial}`}
                </p>
              </div>
            </div>
            <Switch id="global-switch" checked={isGlobal} onCheckedChange={setIsGlobal} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
            <div className="flex items-center gap-2">
              {isActive ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
              <div>
                <Label className="text-sm font-medium cursor-pointer" htmlFor="status-switch">
                  {isActive ? "Fornecedor Ativo" : "Fornecedor Inativo"}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {isActive
                    ? "Disponível em compras e novas operações"
                    : "Não aparece em novas operações; histórico preservado"}
                </p>
              </div>
            </div>
            <Switch id="status-switch" checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <div>
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>CNPJ/CPF</Label>
              <Input value={form.cnpj_cpf} onChange={e => setForm(f => ({ ...f, cnpj_cpf: maskCpfCnpj(e.target.value) }))} placeholder="000.000.000-00" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: maskCelular(e.target.value) }))} placeholder="(00) 0 0000-0000" />
            </div>
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" preserveCase value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label>Endereço</Label>
            <Input value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cidade</Label>
              <Input value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))} />
            </div>
            <div>
              <Label>Estado (UF)</Label>
              <Select value={form.estado} onValueChange={v => setForm(f => ({ ...f, estado: v }))}>
                <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>
                  {ESTADOS_BR.map(uf => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Salvando..." : editing ? "Atualizar" : "Cadastrar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
