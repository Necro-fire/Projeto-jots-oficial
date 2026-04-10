import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shouldHaveFooter } from "@/lib/productImageFooter";

interface ProductImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  productName: string;
  /** Product category (e.g. "Receituário") — used to decide footer */
  category?: string;
  /** Product code (referencia) */
  productCode?: string;
  /** Classification (C1-C10) */
  classificacao?: string;
}

export function ProductImageDialog({
  open,
  onOpenChange,
  imageUrl,
  productName,
  category,
  productCode,
  classificacao,
}: ProductImageDialogProps) {
  const [zoom, setZoom] = useState(1);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.5, 4));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.5, 0.5));
  const handleReset = () => setZoom(1);

  const showFooter = !!(category && shouldHaveFooter(category) && productCode);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setZoom(1);
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl p-2">
        <div className="flex items-center gap-2 px-2 pt-1 pb-2 pr-10">
          <p className="text-sm font-medium truncate flex-1">{productName}</p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs tabular-nums w-10 text-center text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="overflow-auto max-h-[70vh] flex items-center justify-center bg-secondary rounded-md relative">
          <div className="relative inline-block" style={{ transform: `scale(${zoom})`, transformOrigin: "center center", transition: "transform 0.2s" }}>
            <img
              src={imageUrl}
              alt={productName}
              draggable={false}
            />
            {showFooter && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/55 px-3 py-1.5 flex justify-between items-center">
                <span className="text-white text-xs font-semibold">COD: {productCode}</span>
                {classificacao && (
                  <span className="text-white text-xs font-semibold">{classificacao}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
