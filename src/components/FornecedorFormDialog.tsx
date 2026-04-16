import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useFilial } from "@/contexts/FilialContext";
import { toast } from "sonner";

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
    } else {
      setForm(empty);
    }
  }, [editing, open]);

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      if (editing?.id) {
        const { error } = await (supabase as any)
          .from("fornecedores")
          .update({ ...form })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Fornecedor atualizado");
      } else {
        const { error } = await (supabase as any)
          .from("fornecedores")
          .insert({ ...form, filial_id: selectedFilial });
        if (error) throw error;
        toast.success("Fornecedor cadastrado");
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
          <div>
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>CNPJ/CPF</Label>
              <Input value={form.cnpj_cpf} onChange={e => setForm(f => ({ ...f, cnpj_cpf: e.target.value }))} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} />
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
              <Label>Estado</Label>
              <Input value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))} />
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
