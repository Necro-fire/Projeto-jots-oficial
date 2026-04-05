import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useFilial } from "@/contexts/FilialContext";
import { maskCpf, maskCnpj, maskCelular, maskCep, ESTADOS_BR } from "@/lib/masks";

interface ClientData {
  id?: string;
  responsible_name: string;
  store_name: string;
  nome_fantasia: string;
  tipo_cliente: string;
  cnpj: string;
  cpf: string;
  inscricao_estadual: string;
  phone: string;
  telefones: string[];
  email: string;
  cep: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  data_nascimento: string;
  observacoes: string;
  filial_id: string;
}

const emptyClient: ClientData = {
  responsible_name: "",
  store_name: "",
  nome_fantasia: "",
  tipo_cliente: "pf",
  cnpj: "",
  cpf: "",
  inscricao_estadual: "",
  phone: "",
  telefones: [],
  email: "",
  cep: "",
  endereco: "",
  bairro: "",
  cidade: "",
  estado: "",
  data_nascimento: "",
  observacoes: "",
  filial_id: "1",
};

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingClient?: ClientData | null;
}

export function ClientFormDialog({ open, onOpenChange, editingClient }: ClientFormDialogProps) {
  const [form, setForm] = useState<ClientData>(emptyClient);
  const [saving, setSaving] = useState(false);
  const { selectedFilial } = useFilial();

  useEffect(() => {
    if (editingClient) {
      setForm({
        ...editingClient,
        nome_fantasia: (editingClient as any).nome_fantasia || "",
        cpf: (editingClient as any).cpf || "",
        telefones: (editingClient as any).telefones || [],
      });
    } else {
      setForm({
        ...emptyClient,
        filial_id: selectedFilial !== "all" ? selectedFilial : "1",
      });
    }
  }, [editingClient, open, selectedFilial]);

  const isEditing = !!editingClient?.id;

  const set = (field: keyof ClientData, value: string | string[]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePrimaryDocChange = (value: string) => {
    const formatted = form.tipo_cliente === "pf" ? maskCpf(value) : maskCnpj(value);
    if (form.tipo_cliente === "pf") {
      set("cpf", formatted);
    } else {
      set("cnpj", formatted);
    }
  };

  const handleSecondaryDocChange = (value: string) => {
    const formatted = form.tipo_cliente === "pf" ? maskCnpj(value) : maskCpf(value);
    if (form.tipo_cliente === "pf") {
      set("cnpj", formatted);
    } else {
      set("cpf", formatted);
    }
  };

  const addPhone = () => {
    set("telefones", [...form.telefones, ""]);
  };

  const updatePhone = (index: number, value: string) => {
    const updated = [...form.telefones];
    updated[index] = maskCelular(value);
    set("telefones", updated);
  };

  const removePhone = (index: number) => {
    set("telefones", form.telefones.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!form.store_name.trim()) { toast.error("Informe a razão social"); return; }
    if (!form.phone.trim()) { toast.error("Informe o telefone principal"); return; }

    setSaving(true);
    try {
      const payload = {
        responsible_name: form.responsible_name.trim().toUpperCase() || form.store_name.trim().toUpperCase(),
        store_name: form.store_name.trim().toUpperCase(),
        nome_fantasia: form.nome_fantasia.trim().toUpperCase(),
        tipo_cliente: form.tipo_cliente,
        cnpj: form.cnpj.trim(),
        cpf: form.cpf.trim(),
        inscricao_estadual: form.inscricao_estadual.trim().toUpperCase(),
        phone: form.phone.trim(),
        whatsapp: form.phone.trim(),
        telefones: form.telefones.filter(t => t.trim()),
        email: form.email.trim().toUpperCase(),
        endereco: form.endereco.trim().toUpperCase(),
        bairro: form.bairro.trim().toUpperCase(),
        city: form.cidade.trim().toUpperCase(),
        state: form.estado,
        data_nascimento: form.data_nascimento || null,
        observacoes: form.observacoes.trim().toUpperCase(),
        filial_id: form.filial_id,
      };

      if (isEditing) {
        const { error } = await (supabase as any).from("clientes").update(payload).eq("id", editingClient!.id);
        if (error) throw error;
        toast.success("Cliente atualizado!");
      } else {
        const { error } = await (supabase as any).from("clientes").insert(payload);
        if (error) {
          if (error.message?.includes("clientes_cnpj_unique")) {
            toast.error("Já existe um cliente com este CPF/CNPJ");
            return;
          }
          throw error;
        }
        toast.success("Cliente cadastrado!");
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar cliente");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Razão Social *</Label>
            <Input value={form.store_name} onChange={(e) => set("store_name", e.target.value)} placeholder="Razão social da empresa ou nome completo" className="mt-1.5" />
          </div>

          <div>
            <Label>Nome do Cliente</Label>
            <Input value={form.responsible_name} onChange={(e) => set("responsible_name", e.target.value)} placeholder="Nome do responsável (opcional)" className="mt-1.5" />
          </div>

          <div>
            <Label>Nome Fantasia</Label>
            <Input value={form.nome_fantasia} onChange={(e) => set("nome_fantasia", e.target.value)} placeholder="Nome fantasia (opcional)" className="mt-1.5" />
          </div>

          {/* Telefone principal */}
          <div>
            <Label>Telefone / Celular *</Label>
            <Input value={form.phone} onChange={(e) => set("phone", maskCelular(e.target.value))} placeholder="(00) 0 0000-0000" className="mt-1.5" />
          </div>

          {/* Telefones adicionais */}
          {form.telefones.map((tel, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1">
                <Label>Telefone {i + 2}</Label>
                <Input value={tel} onChange={(e) => updatePhone(i, e.target.value)} placeholder="(00) 0 0000-0000" className="mt-1.5" />
              </div>
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removePhone(i)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={addPhone}>
            <Plus className="h-3.5 w-3.5" />
            Adicionar telefone
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo_cliente} onValueChange={(v) => { set("tipo_cliente", v); set("cnpj", ""); set("cpf", ""); set("inscricao_estadual", ""); }}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pf">Pessoa Física</SelectItem>
                  <SelectItem value="pj">Pessoa Jurídica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{form.tipo_cliente === "pf" ? "CPF" : "CNPJ"}</Label>
              <Input
                value={form.tipo_cliente === "pf" ? form.cpf : form.cnpj}
                onChange={(e) => handlePrimaryDocChange(e.target.value)}
                placeholder={form.tipo_cliente === "pf" ? "000.000.000-00" : "00.000.000/0000-00"}
                className="mt-1.5"
              />
            </div>
          </div>

          {/* Secondary document field */}
          <div>
            <Label>{form.tipo_cliente === "pf" ? "CNPJ (opcional)" : "CPF (opcional)"}</Label>
            <Input
              value={form.tipo_cliente === "pf" ? form.cnpj : form.cpf}
              onChange={(e) => handleSecondaryDocChange(e.target.value)}
              placeholder={form.tipo_cliente === "pf" ? "00.000.000/0000-00" : "000.000.000-00"}
              className="mt-1.5"
            />
          </div>

          {form.tipo_cliente === "pj" && (
            <div>
              <Label>Inscrição Estadual</Label>
              <Input value={form.inscricao_estadual} onChange={(e) => set("inscricao_estadual", e.target.value)} placeholder="Opcional" className="mt-1.5" />
            </div>
          )}

          <div>
            <Label>E-mail</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="email@exemplo.com" className="mt-1.5" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>CEP</Label>
              <Input value={form.cep || ""} onChange={(e) => set("cep", maskCep(e.target.value))} placeholder="00000-000" className="mt-1.5" />
            </div>
            <div className="col-span-2">
              <Label>Endereço</Label>
              <Input value={form.endereco} onChange={(e) => set("endereco", e.target.value)} placeholder="Rua, número, bairro" className="mt-1.5" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Bairro</Label>
              <Input value={form.bairro} onChange={(e) => set("bairro", e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Cidade</Label>
              <Input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Estado (UF)</Label>
              <Select value={form.estado} onValueChange={(v) => set("estado", v)}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>
                  {ESTADOS_BR.map((uf) => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Data de abertura</Label>
            <Input type="date" value={form.data_nascimento} onChange={(e) => set("data_nascimento", e.target.value)} className="mt-1.5" />
          </div>

          <div>
            <Label>Filial *</Label>
            <Select value={form.filial_id} onValueChange={(v) => set("filial_id", v)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Filial 1</SelectItem>
                <SelectItem value="2">Filial 2</SelectItem>
                <SelectItem value="3">Filial 3</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} placeholder="Anotações sobre o cliente" className="mt-1.5 min-h-[60px]" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {isEditing ? "Salvar" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
