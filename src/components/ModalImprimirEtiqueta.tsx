import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Printer, Tag } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import etiquetaLogo from "@/assets/jots-logo-etiqueta.png";

interface Props {
  open: boolean;
  onClose: () => void;
  produto: {
    nome: string;
    codigoBarras: string;
  };
}

const PRINT_STYLE_ID = "etiqueta-print-style";

export function ModalImprimirEtiqueta({ open, onClose, produto }: Props) {
  const previewBarcodeRef = useRef<SVGSVGElement>(null);
  const printBarcodeRef = useRef<SVGSVGElement>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string>("");
  const [logoReady, setLogoReady] = useState(false);

  // Pre-load logo as a data URL so it's guaranteed to render at print time,
  // even on browsers that skip un-decoded external images during printing.
  useEffect(() => {
    let cancelled = false;
    setLogoReady(false);
    fetch(etiquetaLogo)
      .then((r) => r.blob())
      .then((blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }))
      .then((dataUrl) => {
        if (cancelled) return;
        setLogoDataUrl(dataUrl);
        setLogoReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLogoDataUrl(etiquetaLogo);
        setLogoReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open || !produto.codigoBarras) return;
    const opts = {
      format: "CODE128" as const,
      displayValue: false,
      margin: 0,
    };
    try {
      if (previewBarcodeRef.current) {
        JsBarcode(previewBarcodeRef.current, produto.codigoBarras, { ...opts, width: 1.4, height: 40 });
      }
      if (printBarcodeRef.current) {
        // High-resolution barcode: thicker bars + taller for crisp thermal print
        JsBarcode(printBarcodeRef.current, produto.codigoBarras, { ...opts, width: 3, height: 80 });
      }
    } catch {
      // invalid barcode — leave svg empty
    }
  }, [open, produto.codigoBarras]);

  // Inject @page + print-only CSS once
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById(PRINT_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = PRINT_STYLE_ID;
    style.textContent = `
      @media print {
        @page { size: 95mm 12mm; margin: 0; }
        html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
        body * { visibility: hidden !important; }
        #etiqueta-print-area, #etiqueta-print-area * { visibility: visible !important; }
        #etiqueta-print-area {
          position: fixed !important;
          left: 0 !important;
          top: 0 !important;
          width: 95mm !important;
          height: 12mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
        }
        #etiqueta-print-area img {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `;
    document.head.appendChild(style);
  }, []);

  const handleImprimir = async () => {
    const img = document.querySelector<HTMLImageElement>("#etiqueta-print-area img");
    if (img) {
      try {
        if (!img.complete) {
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          });
        }
        if ((img as any).decode) await (img as any).decode().catch(() => {});
      } catch { /* ignore */ }
    }
    window.print();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Imprimir Etiqueta — {produto.nome}
            </DialogTitle>
            <DialogDescription>Etiqueta 95mm × 12mm — impressão via navegador</DialogDescription>
          </DialogHeader>

          {/* Preview ampliado (6px/mm) — apenas visual no modal */}
          <div className="border rounded-md bg-white p-2 overflow-x-auto">
            <div
              className="relative bg-white border border-dashed border-muted-foreground/30 mx-auto"
              style={{ width: "570px", height: "72px" }}
              aria-label="Preview da etiqueta"
            >
              {/* Área 2: logo 37.4–67mm = 224–402px */}
              <div
                className="absolute top-0 bottom-0 flex items-center justify-center"
                style={{ left: "224px", width: "178px" }}
              >
                {logoDataUrl && <img src={logoDataUrl} alt="JOTS" className="max-h-[60px] max-w-full object-contain" />}
              </div>
              {/* Área 3: barcode 70–95mm = 420–570px */}
              <div
                className="absolute top-0 bottom-0 flex flex-col items-center justify-center"
                style={{ left: "420px", width: "150px" }}
              >
                <svg ref={previewBarcodeRef} className="max-w-full" />
                <span className="text-[9px] font-bold tabular-nums leading-none mt-0.5">
                  {produto.codigoBarras}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Como imprimir:</p>
            <p>
              Clique em <strong>Imprimir</strong>. No diálogo do navegador, selecione sua impressora térmica
              e confirme. O layout já está formatado para 95mm × 12mm.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleImprimir} disabled={!logoReady} className="gap-1.5">
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Área de impressão fixa em mm — sempre montada quando o modal está aberto */}
      {open && (
        <div
          id="etiqueta-print-area"
          aria-hidden="true"
          style={{
            position: "fixed",
            left: "-10000px",
            top: 0,
            width: "95mm",
            height: "12mm",
            background: "#fff",
            overflow: "hidden",
          }}
        >
          {/* Área 2: logo 37.4mm → 67mm (largura 29.6mm) */}
          <div
            style={{
              position: "absolute",
              left: "37.4mm",
              top: 0,
              width: "29.6mm",
              height: "12mm",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {logoDataUrl && (
              <img
                src={logoDataUrl}
                alt="JOTS"
                style={{ maxHeight: "10mm", maxWidth: "100%", objectFit: "contain", display: "block" }}
              />
            )}
          </div>
          {/* Área 3: barcode 70mm → 95mm (largura 25mm) */}
          <div
            style={{
              position: "absolute",
              left: "70mm",
              top: 0,
              width: "25mm",
              height: "12mm",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              ref={printBarcodeRef}
              style={{ width: "24mm", height: "8mm", display: "block" }}
              preserveAspectRatio="none"
            />
            <span
              style={{
                fontFamily: "monospace",
                fontWeight: 700,
                fontSize: "2mm",
                lineHeight: 1,
                marginTop: "0.3mm",
              }}
            >
              {produto.codigoBarras}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
