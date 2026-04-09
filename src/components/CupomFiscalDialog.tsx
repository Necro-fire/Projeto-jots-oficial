import { useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import CupomFiscal, { type CupomFiscalData } from "./CupomFiscal";

interface CupomFiscalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: CupomFiscalData | null;
}

export function CupomFiscalDialog({ open, onOpenChange, data }: CupomFiscalDialogProps) {
  const cupomRef = useRef<HTMLDivElement>(null);

  const handlePrint = useCallback(() => {
    if (!cupomRef.current) return;

    const printWindow = window.open("", "_blank", "width=320,height=600");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cupom Fiscal</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Courier New', Courier, monospace; font-size: 12px; }
          @media print {
            @page { margin: 0; size: 80mm auto; }
            body { width: 80mm; }
          }
        </style>
      </head>
      <body>${cupomRef.current.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  }, []);

  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cupom Fiscal</DialogTitle>
          <DialogDescription>
            Venda {data.venda.codigo || `#${data.venda.numero}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center border rounded-md p-2 bg-white overflow-auto max-h-[60vh]">
          <CupomFiscal ref={cupomRef} data={data} />
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1" />
            Imprimir Cupom
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
