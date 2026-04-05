import { useState, useEffect } from "react";
import { Download, ExternalLink, Trash2, X, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useFilial } from "@/contexts/FilialContext";
import { getSignedUrl } from "@/lib/storageUtils";
import type { DbNotaFiscal } from "@/hooks/useNotasFiscais";

const statusMap: Record<string, { label: string; variant: "default" | "destructive" | "secondary"; className: string }> = {
  autorizada: { label: "Autorizada", variant: "default", className: "bg-success text-success-foreground" },
  cancelada: { label: "Cancelada", variant: "destructive", className: "" },
  pendente: { label: "Pendente", variant: "secondary", className: "bg-warning text-warning-foreground" },
};

interface NFDetailDialogProps {
  nf: DbNotaFiscal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  canManage: boolean;
}

export function NFDetailDialog({ nf, open, onOpenChange, onCancel, onDelete, canManage }: NFDetailDialogProps) {
  const { filiais } = useFilial();
  const [signedXml, setSignedXml] = useState<string | null>(null);
  const [signedPdf, setSignedPdf] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !nf) { setSignedXml(null); setSignedPdf(null); return; }
    if (nf.xml_url) getSignedUrl(nf.xml_url, 'nfe-files').then(setSignedXml);
    if (nf.pdf_url) getSignedUrl(nf.pdf_url, 'nfe-files').then(setSignedPdf);
  }, [open, nf?.xml_url, nf?.pdf_url]);

  if (!nf) return null;

  const st = statusMap[nf.status] || statusMap.pendente;
  const isEntrada = nf.tipo_operacao === "entrada";
  const getFilialName = (filialId: string) => filiais.find(f => f.id === filialId)?.name || `Filial ${filialId}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-ui">
            <FileText className="h-5 w-5 text-primary" />
            NF-e #{nf.numero}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={st.className || undefined} variant={st.variant}>{st.label}</Badge>
            <Badge variant="outline">{isEntrada ? "Entrada" : "Saída"}</Badge>
            <span className="text-ui font-medium tabular-nums text-primary ml-auto">R$ {Number(nf.valor_total).toFixed(2)}</span>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3 text-ui">
            {isEntrada ? (
              <>
                <div>
                  <p className="text-caption text-muted-foreground">Fornecedor</p>
                  <p className="font-medium">{nf.fornecedor_nome || "—"}</p>
                </div>
                <div>
                  <p className="text-caption text-muted-foreground">CNPJ Fornecedor</p>
                  <p className="font-medium">{nf.fornecedor_cnpj || "—"}</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-caption text-muted-foreground">Destinatário</p>
                  <p className="font-medium">{nf.client_name || "—"}</p>
                </div>
                <div>
                  <p className="text-caption text-muted-foreground">CNPJ/CPF</p>
                  <p className="font-medium">{nf.client_cnpj || "—"}</p>
                </div>
              </>
            )}
            <div>
              <p className="text-caption text-muted-foreground">Data de Emissão</p>
              <p className="font-medium">{new Date(nf.data_emissao).toLocaleDateString("pt-BR")}</p>
            </div>
            <div>
              <p className="text-caption text-muted-foreground">Filial</p>
              <p className="font-medium">{getFilialName(nf.filial_id)}</p>
            </div>
            {nf.venda_id && (
              <div>
                <p className="text-caption text-muted-foreground">Venda Vinculada</p>
                <p className="font-medium font-mono text-xs">{nf.venda_id.slice(0, 8).toUpperCase()}</p>
              </div>
            )}
          </div>

          {nf.chave_acesso && (
            <>
              <Separator />
              <div>
                <p className="text-caption text-muted-foreground mb-1">Chave de Acesso</p>
                <p className="text-xs font-mono break-all select-all">{nf.chave_acesso}</p>
              </div>
            </>
          )}

          {nf.observacoes && (
            <>
              <Separator />
              <div>
                <p className="text-caption text-muted-foreground mb-1">Observações</p>
                <p className="text-sm">{nf.observacoes}</p>
              </div>
            </>
          )}

          {/* Files */}
          {(signedXml || signedPdf) && (
            <>
              <Separator />
              <div>
                <p className="text-caption text-muted-foreground mb-2">Arquivos Anexos</p>
                <div className="flex gap-2">
                  {signedXml && (
                    <Button variant="outline" size="sm" className="h-8" asChild>
                      <a href={signedXml} target="_blank" rel="noopener noreferrer">
                        <Download className="h-3.5 w-3.5 mr-1" /> XML
                      </a>
                    </Button>
                  )}
                  {signedPdf && (
                    <Button variant="outline" size="sm" className="h-8" asChild>
                      <a href={signedPdf} target="_blank" rel="noopener noreferrer">
                        <Download className="h-3.5 w-3.5 mr-1" /> PDF / DANFE
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}

          <Separator />

          <div className="flex gap-2">
            {signedPdf && (
              <Button variant="outline" className="flex-1 h-9" asChild>
                <a href={signedPdf} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-2" /> Abrir DANFE
                </a>
              </Button>
            )}
            {canManage && nf.status === "autorizada" && (
              <Button variant="destructive" className="h-9" onClick={() => { onCancel(nf.id); onOpenChange(false); }}>
                <X className="h-3.5 w-3.5 mr-2" /> Cancelar NF
              </Button>
            )}
            {canManage && (
              <Button variant="ghost" className="h-9 text-destructive hover:text-destructive" onClick={() => onDelete(nf.id)}>
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Remover
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
