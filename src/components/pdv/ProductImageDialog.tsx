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
  category?: string;
  classificacao?: string;
  haste?: number;
  lente?: number;
  ponte?: number;
}

export function ProductImageDialog({
  open,
  onOpenChange,
  imageUrl,
  productName,
  category,
  classificacao,
  haste,
  lente,
  ponte,
}: ProductImageDialogProps) {
  const [zoom, setZoom] = useState(1);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.5, 4));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.5, 0.5));
  const handleReset = () => setZoom(1);

  const showFooter = !!(category && shouldHaveFooter(category));


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
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-4 py-2 flex flex-col gap-0.5">
                <span className="text-white text-xs font-semibold leading-tight">{productName}</span>
                <span className="text-white/90 text-[11px] font-medium leading-tight">
                  {[classificacao, [haste && `Haste: ${haste}`, lente && `Lente: ${lente}`, ponte && `Ponte: ${ponte}`].filter(Boolean).join("  ")].filter(Boolean).join("   |   ")}
                </span>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
