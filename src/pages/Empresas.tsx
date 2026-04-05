import { useState } from "react";
import { Plus, Building2, Pencil, Trash2, Star, StarOff, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresas, type DbEmpresa } from "@/hooks/useEmpresas";
import { EmpresaFormDialog } from "@/components/EmpresaFormDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Empresas() {
  const { data: empresas, refetch } = useEmpresas();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DbEmpresa | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleEdit = (emp: DbEmpresa) => {
    setEditing(emp);
    setShowForm(true);
  };

  const handleNew = () => {
    if (empresas.length >= 3) {
      toast.error("Máximo de 3 filiais atingido");
      return;
    }
    setEditing(null);
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const { error } = await (supabase as any).from("empresas").delete().eq("id", deletingId);
    if (error) toast.error("Erro ao excluir empresa");
    else { toast.success("Empresa excluída"); refetch(); }
    setDeletingId(null);
  };

  const toggleAtiva = async (emp: DbEmpresa) => {
    const { error } = await (supabase as any).from("empresas").update({ ativa: !emp.ativa }).eq("id", emp.id);
    if (error) toast.error("Erro ao atualizar");
    else { toast.success(emp.ativa ? "Filial desativada" : "Filial ativada"); refetch(); }
  };

  const setDefault = async (emp: DbEmpresa) => {
    await (supabase as any).from("empresas").update({ filial_padrao: false }).neq("id", "");
    const { error } = await (supabase as any).from("empresas").update({ filial_padrao: true }).eq("id", emp.id);
    if (error) toast.error("Erro ao definir padrão");
    else { toast.success("Filial padrão definida"); refetch(); }
  };

  const regimeLabel = (v: string) => {
    const map: Record<string, string> = {
      simples_nacional: "Simples Nacional",
      lucro_presumido: "Lucro Presumido",
      lucro_real: "Lucro Real",
    };
    return map[v] || v;
  };

  // Next available filial_id
  const usedFilialIds = empresas.map(e => e.filial_id).filter(Boolean);
  const nextFilialId = ["1", "2", "3"].find(id => !usedFilialIds.includes(id)) || "";

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-title font-semibold tracking-tighter">Empresas (Filiais)</h1>
          <p className="text-ui text-muted-foreground">
            {empresas.length}/3 filiais cadastradas
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={handleNew} disabled={empresas.length >= 3}>
          <Plus className="h-4 w-4" />
          Nova Filial
        </Button>
      </div>

      {empresas.length > 0 ? (
        <div className="space-y-3">
          {empresas.map((emp) => (
            <div
              key={emp.id}
              className={`rounded-lg border p-4 transition-colors group ${
                !emp.ativa ? "opacity-60 bg-muted/30" : "hover:bg-secondary/50"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-ui font-medium">{emp.razao_social}</p>
                    {emp.filial_id && (
                      <Badge variant="outline" className="text-caption">Filial {emp.filial_id}</Badge>
                    )}
                    {emp.filial_padrao && (
                      <Badge variant="default" className="text-caption">Padrão</Badge>
                    )}
                    {!emp.ativa && (
                      <Badge variant="secondary" className="text-caption">Inativa</Badge>
                    )}
                  </div>
                  {emp.nome_fantasia && (
                    <p className="text-caption text-muted-foreground">{emp.nome_fantasia}</p>
                  )}
                  <p className="text-caption text-muted-foreground">
                    CNPJ: {emp.cnpj}
                    {emp.regime_tributario && ` · ${regimeLabel(emp.regime_tributario)}`}
                  </p>
                  {(emp.cidade || emp.estado) && (
                    <p className="text-caption text-muted-foreground">
                      {[emp.endereco, emp.numero, emp.bairro, emp.cidade, emp.estado].filter(Boolean).join(", ")}
                    </p>
                  )}
                  {(emp.telefone || emp.celular) && (
                    <p className="text-caption text-muted-foreground">
                      {[emp.telefone, emp.celular].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => setDefault(emp)}
                    title={emp.filial_padrao ? "Filial padrão" : "Definir como padrão"}
                  >
                    {emp.filial_padrao ? <Star className="h-3.5 w-3.5 text-warning fill-warning" /> : <StarOff className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => toggleAtiva(emp)}
                    title={emp.ativa ? "Desativar" : "Ativar"}
                  >
                    {emp.ativa ? <Power className="h-3.5 w-3.5 text-success" /> : <PowerOff className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => handleEdit(emp)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                    onClick={() => setDeletingId(emp.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Building2 className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-ui font-medium">Nenhuma filial cadastrada</p>
          <p className="text-caption mt-1">Cadastre sua primeira empresa para começar</p>
          <Button size="sm" className="mt-4 gap-1.5" onClick={handleNew}>
            <Plus className="h-4 w-4" />
            Cadastrar Empresa
          </Button>
        </div>
      )}

      <EmpresaFormDialog
        open={showForm}
        onOpenChange={(v) => { setShowForm(v); if (!v) setEditing(null); }}
        editingEmpresa={editing}
        currentCount={empresas.length}
        nextFilialId={nextFilialId}
      />

      <AlertDialog open={!!deletingId} onOpenChange={(v) => !v && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A empresa será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
