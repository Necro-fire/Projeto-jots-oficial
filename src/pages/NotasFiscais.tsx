import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Download, X, Search, Filter, Eye, FilePlus, ArrowUpDown, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilialSelector } from "@/components/FilialSelector";
import { useFilial } from "@/contexts/FilialContext";
import { useAuth } from "@/contexts/AuthContext";
import { useNotasFiscais, type DbNotaFiscal } from "@/hooks/useNotasFiscais";
import { NFDetailDialog } from "@/components/NFDetailDialog";
import { toast } from "sonner";

const statusMap: Record<string, { label: string; variant: "default" | "destructive" | "secondary"; className: string }> = {
  autorizada: { label: "Autorizada", variant: "default", className: "bg-success text-success-foreground" },
  cancelada: { label: "Cancelada", variant: "destructive", className: "" },
  pendente: { label: "Pendente", variant: "secondary", className: "bg-warning text-warning-foreground" },
};

export default function NotasFiscais() {
  const navigate = useNavigate();
  const { selectedFilial, filiais } = useFilial();
  const { hasPermission } = useAuth();
  const canAddNF = hasPermission("Fiscal", "add_nf");
  const canCancelNF = hasPermission("Fiscal", "cancel_nf");
  const canManage = canAddNF || canCancelNF;
  const { data: notas, updateStatus, deleteNF } = useNotasFiscais();
  const [search, setSearch] = useState("");
  
  const [tipoFilter, setTipoFilter] = useState("all");
  const [selectedNF, setSelectedNF] = useState<DbNotaFiscal | null>(null);

  const filtered = useMemo(() => {
    let result = notas.filter(nf => {
      const matchFilial = selectedFilial === "all" || nf.filial_id === selectedFilial;
      const matchSearch = !search || 
        nf.client_name.toLowerCase().includes(search.toLowerCase()) || 
        String(nf.numero).includes(search) ||
        nf.chave_acesso.includes(search) ||
        nf.fornecedor_nome?.toLowerCase().includes(search.toLowerCase());
      const matchTipo = tipoFilter === "all" || nf.tipo_operacao === tipoFilter;
      return matchFilial && matchSearch && matchTipo;
    });
    return result.sort((a, b) => new Date(b.data_emissao).getTime() - new Date(a.data_emissao).getTime());
  }, [notas, selectedFilial, search, tipoFilter]);

  const getFilialName = (filialId: string) => filiais.find(f => f.id === filialId)?.name || `Filial ${filialId}`;

  const handleCancel = async (id: string) => {
    try {
      await updateStatus(id, "cancelada");
      toast.success("NF-e cancelada");
    } catch {
      toast.error("Erro ao cancelar NF-e");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNF(id);
      toast.success("NF-e removida");
      setSelectedNF(null);
    } catch {
      toast.error("Erro ao remover NF-e");
    }
  };


  return (
    <div>
      <FilialSelector hideAll />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-title font-semibold tracking-tighter">Notas Fiscais</h1>
            <p className="text-ui text-muted-foreground">Gestão de NF-e cadastradas</p>
          </div>
          {canAddNF && (
            <Button onClick={() => navigate("/adicionar-nf")} className="h-9">
              <FilePlus className="h-4 w-4 mr-2" />
              Adicionar NF-e
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por cliente, número, chave ou fornecedor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          <Select value={tipoFilter} onValueChange={setTipoFilter}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="entrada">Entrada</SelectItem>
              <SelectItem value="saida">Saída</SelectItem>
            </SelectContent>
          </Select>
        </div>


        <div className="space-y-1">
          {filtered.map(nf => {
            const isEntrada = nf.tipo_operacao === "entrada";
            return (
              <div
                key={nf.id}
                className="flex items-center justify-between py-3 px-4 rounded-md hover:bg-secondary/50 transition-colors cursor-pointer"
                onClick={() => setSelectedNF(nf)}
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-ui font-medium">NF-e #{nf.numero}</p>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                        {isEntrada ? "Entrada" : "Saída"}
                      </Badge>
                      {nf.xml_url && <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-primary border-primary/30">XML</Badge>}
                      {nf.pdf_url && <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-destructive border-destructive/30">PDF</Badge>}
                    </div>
                    <p className="text-caption text-muted-foreground">
                      {isEntrada ? nf.fornecedor_nome || "Fornecedor" : nf.client_name} · {new Date(nf.data_emissao).toLocaleDateString("pt-BR")} · {getFilialName(nf.filial_id)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-ui font-medium tabular-nums text-primary">R$ {Number(nf.valor_total).toFixed(2)}</span>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-ui font-medium">Nenhuma nota encontrada</p>
              <p className="text-caption mt-1">As NF-e cadastradas aparecerão aqui</p>
            </div>
          )}
        </div>
      </div>

      <NFDetailDialog
        nf={selectedNF}
        open={!!selectedNF}
        onOpenChange={o => { if (!o) setSelectedNF(null); }}
        onCancel={handleCancel}
        onDelete={handleDelete}
        canManage={canManage}
      />
    </div>
  );
}
