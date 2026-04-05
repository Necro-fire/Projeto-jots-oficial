import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { maskCnpj, maskCep, maskPhone, maskCelular, unmask, isValidCnpj, ESTADOS_BR } from "@/lib/masks";
import type { DbEmpresa } from "@/hooks/useEmpresas";

interface EmpresaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingEmpresa?: DbEmpresa | null;
  currentCount: number;
  nextFilialId?: string;
}

const emptyForm = {
  razao_social: "",
  nome_fantasia: "",
  cnpj: "",
  inscricao_estadual: "",
  regime_tributario: "",
  cnae: "",
  cep: "",
  endereco: "",
  numero: "",
  bairro: "",
  cidade: "",
  estado: "",
  codigo_ibge: "",
  codigo_municipio: "",
  telefone: "",
  celular: "",
  email: "",
  serie_nf: "1",
  ambiente: "homologacao",
};

export function EmpresaFormDialog({ open, onOpenChange, editingEmpresa, currentCount, nextFilialId }: EmpresaFormDialogProps) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const isEditing = !!editingEmpresa?.id;

  useEffect(() => {
    if (editingEmpresa) {
      setForm({
        razao_social: editingEmpresa.razao_social,
        nome_fantasia: editingEmpresa.nome_fantasia,
        cnpj: editingEmpresa.cnpj,
        inscricao_estadual: editingEmpresa.inscricao_estadual,
        regime_tributario: editingEmpresa.regime_tributario,
        cnae: editingEmpresa.cnae,
        cep: editingEmpresa.cep,
        endereco: editingEmpresa.endereco,
        numero: editingEmpresa.numero,
        bairro: editingEmpresa.bairro,
        cidade: editingEmpresa.cidade,
        estado: editingEmpresa.estado,
        codigo_ibge: editingEmpresa.codigo_ibge,
        codigo_municipio: editingEmpresa.codigo_municipio,
        telefone: editingEmpresa.telefone,
        celular: editingEmpresa.celular,
        email: editingEmpresa.email,
        serie_nf: editingEmpresa.serie_nf,
        ambiente: editingEmpresa.ambiente,
      });
    } else {
      setForm(emptyForm);
    }
  }, [editingEmpresa, open]);

  const set = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  const handleSave = async () => {
    if (!form.razao_social.trim()) { toast.error("Informe a razão social"); return; }
    if (!isValidCnpj(form.cnpj)) { toast.error("CNPJ inválido (14 dígitos)"); return; }

    if (!isEditing && currentCount >= 3) {
      toast.error("Máximo de 3 filiais atingido");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        razao_social: form.razao_social.trim(),
        nome_fantasia: form.nome_fantasia.trim(),
        cnpj: form.cnpj.trim(),
        inscricao_estadual: form.inscricao_estadual.trim(),
        regime_tributario: form.regime_tributario,
        cnae: form.cnae.trim(),
        cep: form.cep.trim(),
        endereco: form.endereco.trim(),
        numero: form.numero.trim(),
        bairro: form.bairro.trim(),
        cidade: form.cidade.trim(),
        estado: form.estado,
        codigo_ibge: form.codigo_ibge.trim(),
        codigo_municipio: form.codigo_municipio.trim(),
        telefone: form.telefone.trim(),
        celular: form.celular.trim(),
        email: form.email.trim(),
        serie_nf: form.serie_nf.trim(),
        ambiente: form.ambiente,
      };

      if (isEditing) {
        const { error } = await (supabase as any).from("empresas").update(payload).eq("id", editingEmpresa!.id);
        if (error) throw error;
        toast.success("Empresa atualizada!");
      } else {
        const { error } = await (supabase as any).from("empresas").insert({
          ...payload,
          filial_id: nextFilialId || String(currentCount + 1),
        });
        if (error) {
          if (error.message?.includes("empresas_cnpj_unique")) {
            toast.error("Já existe uma empresa com este CNPJ");
            return;
          }
          throw error;
        }
        toast.success("Empresa cadastrada!");
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Empresa" : "Nova Empresa (Filial)"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dados cadastrais */}
          <div className="space-y-3">
            <p className="text-caption font-medium text-muted-foreground">Dados Cadastrais</p>
            <div>
              <Label>Razão Social *</Label>
              <Input value={form.razao_social} onChange={(e) => set("razao_social", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Nome Fantasia</Label>
              <Input value={form.nome_fantasia} onChange={(e) => set("nome_fantasia", e.target.value)} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>CNPJ *</Label>
                <Input value={form.cnpj} onChange={(e) => set("cnpj", maskCnpj(e.target.value))} placeholder="00.000.000/0000-00" className="mt-1" />
              </div>
              <div>
                <Label>Inscrição Estadual</Label>
                <Input value={form.inscricao_estadual} onChange={(e) => set("inscricao_estadual", e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Regime Tributário</Label>
                <Select value={form.regime_tributario} onValueChange={(v) => set("regime_tributario", v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                    <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                    <SelectItem value="lucro_real">Lucro Real</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>CNAE</Label>
                <Input value={form.cnae} onChange={(e) => set("cnae", e.target.value)} className="mt-1" />
              </div>
            </div>
          </div>

          <Separator />

          {/* Endereço */}
          <div className="space-y-3">
            <p className="text-caption font-medium text-muted-foreground">Endereço</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>CEP</Label>
                <Input value={form.cep} onChange={(e) => set("cep", maskCep(e.target.value))} placeholder="00000-000" className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label>Rua / Logradouro</Label>
                <Input value={form.endereco} onChange={(e) => set("endereco", e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Número</Label>
                <Input value={form.numero} onChange={(e) => set("numero", e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Bairro</Label>
                <Input value={form.bairro} onChange={(e) => set("bairro", e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Cidade</Label>
                <Input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Estado (UF)</Label>
                <Select value={form.estado} onValueChange={(v) => set("estado", v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>
                    {ESTADOS_BR.map((uf) => (
                      <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cód. Município</Label>
                <Input value={form.codigo_municipio} onChange={(e) => set("codigo_municipio", e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Cód. IBGE</Label>
                <Input value={form.codigo_ibge} onChange={(e) => set("codigo_ibge", e.target.value)} className="mt-1" />
              </div>
            </div>
          </div>

          <Separator />

          {/* Contato */}
          <div className="space-y-3">
            <p className="text-caption font-medium text-muted-foreground">Contato</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Telefone</Label>
                <Input value={form.telefone} onChange={(e) => set("telefone", maskPhone(e.target.value))} placeholder="(00) 0000-0000" className="mt-1" />
              </div>
              <div>
                <Label>Celular</Label>
                <Input value={form.celular} onChange={(e) => set("celular", maskCelular(e.target.value))} placeholder="(00) 0 0000-0000" className="mt-1" />
              </div>
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="mt-1" />
            </div>
          </div>

          <Separator />

          {/* Fiscal */}
          <div className="space-y-3">
            <p className="text-caption font-medium text-muted-foreground">Dados Fiscais</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Série da NF</Label>
                <Input value={form.serie_nf} onChange={(e) => set("serie_nf", e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Ambiente</Label>
                <Select value={form.ambiente} onValueChange={(v) => set("ambiente", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="homologacao">Homologação</SelectItem>
                    <SelectItem value="producao">Produção</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
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
