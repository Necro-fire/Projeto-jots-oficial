import { useState, useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { Copy, Download, Tag } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import jotsLogo from "@/assets/jots-logo.png";
import { gerarZplLote } from "@/utils/gerarZpl";
import { baixarZpl } from "@/utils/baixarZpl";

interface Props {
  open: boolean;
  onClose: () => void;
  produto: {
    nome: string;
    codigoBarras: string;
  };
}

export function ModalImprimirEtiqueta({ open, onClose, produto }: Props) {
  const [quantidade, setQuantidade] = useState(1);
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (open && barcodeRef.current && produto.codigoBarras) {
      try {
        JsBarcode(barcodeRef.current, produto.codigoBarras, {
          format: "CODE128",
          width: 1.4,
          height: 40,
          displayValue: false,
          margin: 0,
        });
      } catch {
        // invalid barcode — leave svg empty
      }
    }
  }, [open, produto.codigoBarras]);

  const handleCopiar = async () => {
    const zpl = gerarZplLote(produto.codigoBarras, quantidade);
    try {
      await navigator.clipboard.writeText(zpl);
      toast.success("ZPL copiado para a área de transferência");
    } catch {
      toast.error("Erro ao copiar ZPL");
    }
  };

  const handleBaixar = () => {
    const zpl = gerarZplLote(produto.codigoBarras, quantidade);
    baixarZpl(zpl, produto.codigoBarras);
    toast.success(`Arquivo .zpl baixado (${quantidade} etiqueta${quantidade > 1 ? "s" : ""})`);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Imprimir Etiqueta — {produto.nome}
          </DialogTitle>
          <DialogDescription>Preview da etiqueta 95mm × 12mm</DialogDescription>
        </DialogHeader>

        {/* Preview — scaled 4x for readability (95mm*4 = 380mm visual, but we use px) */}
        <div className="border rounded-md bg-white p-2 overflow-x-auto">
          <div
            className="relative bg-white border border-dashed border-muted-foreground/30 mx-auto"
            style={{ width: "570px", height: "72px" }}
            aria-label="Preview da etiqueta"
          >
            {/* Area 1: empty 0-37.4mm = 0-224px (scale 6px/mm) */}
            {/* Area 2: JOTS logo 37.4-67mm = 224-402px */}
            <div
              className="absolute top-0 bottom-0 flex items-center justify-center"
              style={{ left: "224px", width: "178px" }}
            >
              <img src={jotsLogo} alt="JOTS" className="max-h-[60px] max-w-full object-contain" />
            </div>
            {/* Area 3: barcode 70-95mm = 420-570px */}
            <div
              className="absolute top-0 bottom-0 flex flex-col items-center justify-center"
              style={{ left: "420px", width: "150px" }}
            >
              <svg ref={barcodeRef} className="max-w-full" />
              <span className="text-[9px] font-bold tabular-nums leading-none mt-0.5">
                {produto.codigoBarras}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 items-end">
          <div>
            <Label htmlFor="qtd-etiquetas">Quantidade de etiquetas</Label>
            <Input
              id="qtd-etiquetas"
              type="number"
              min={1}
              max={999}
              value={quantidade}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setQuantidade(Number.isFinite(v) ? Math.min(999, Math.max(1, v)) : 1);
              }}
            />
          </div>
          <p className="text-caption text-muted-foreground">
            Código: <span className="font-mono">{produto.codigoBarras}</span>
          </p>
        </div>

        <div className="rounded-md bg-muted/50 p-3 text-caption text-muted-foreground">
          <p className="font-medium text-foreground mb-1">Como imprimir:</p>
          <p>
            Após baixar o arquivo <code className="font-mono">.zpl</code>, execute no CMD:
          </p>
          <pre className="mt-1 font-mono text-[11px] bg-background border rounded px-2 py-1 overflow-x-auto">
            copy /b etiqueta.zpl \\.\USB001
          </pre>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="outline" onClick={handleCopiar} className="gap-1.5">
            <Copy className="h-4 w-4" /> Copiar ZPL
          </Button>
          <Button onClick={handleBaixar} className="gap-1.5">
            <Download className="h-4 w-4" /> Baixar &amp; Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
