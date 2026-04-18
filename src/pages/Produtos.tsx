import { useState, useMemo, useCallback } from "react";
import { Plus, Package, Pencil, Trash2, ShoppingCart, Printer, ImageDown, ZoomIn, Eye } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
// productImageFooter is used at save-time in ProductFormDialog
import JsBarcode from "jsbarcode";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/AuthContext";
import { AtacadoDialog } from "@/components/AtacadoDialog";
import { ProductImageDialog } from "@/components/pdv/ProductImageDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFilial } from "@/contexts/FilialContext";
import { FilialSelector } from "@/components/FilialSelector";
import { useProducts, type DbProduct } from "@/hooks/useSupabaseData";
import { ProductFormDialog } from "@/components/ProductFormDialog";
import { ProductFilters, useProductFilters, applyProductFilters, getStockLevel } from "@/components/ProductFilters";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Produtos() {
  const [showForm, setShowForm] = useState(false);
  const [showAtacado, setShowAtacado] = useState(false);
  const [editingProduct, setEditingProduct] = useState<DbProduct | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<DbProduct | null>(null);
  const { selectedFilial, filiais } = useFilial();
  const { filters, setFilters } = useProductFilters();
  const { hasPermission } = useAuth();
  const isMobile = useIsMobile();
  const canCreate = hasPermission('Produtos', 'create');
  const canEdit = hasPermission('Produtos', 'edit');
  const canDelete = hasPermission('Produtos', 'delete');
  const canViewImages = hasPermission('Produtos', 'view_images');
  const [zoomImage, setZoomImage] = useState<{ url: string; name: string; category?: string; classificacao?: string; haste?: number; lente?: number; ponte?: number } | null>(null);

  const { data: products } = useProducts();

  const getFilialName = (filialId: string) => filiais.find(f => f.id === filialId)?.name || filialId;

  const filtered = useMemo(() => applyProductFilters(products, filters), [products, filters]);

  const [deleteCheck, setDeleteCheck] = useState<{ canDelete: boolean; reason?: string } | null>(null);

  const checkAndDelete = async (product: DbProduct) => {
    setDeletingProduct(product);
    // Check sales
    const { count: salesCount } = await (supabase as any)
      .from("venda_items")
      .select("id", { count: "exact", head: true })
      .eq("produto_id", product.id);
    if (salesCount && salesCount > 0) {
      setDeleteCheck({ canDelete: false, reason: "Este produto já possui vendas registradas e não pode ser excluído." });
      return;
    }
    // Check stock
    const { data: estoque } = await (supabase as any)
      .from("estoque")
      .select("quantidade")
      .eq("produto_id", product.id);
    const totalStock = (estoque || []).reduce((sum: number, e: any) => sum + (e.quantidade || 0), 0);
    if (totalStock > 0) {
      setDeleteCheck({ canDelete: false, reason: "Não é possível excluir um produto com estoque disponível." });
      return;
    }
    setDeleteCheck({ canDelete: true });
  };

  const handleDelete = async () => {
    if (!deletingProduct) return;
    const { error } = await (supabase as any).from("produtos").delete().eq("id", deletingProduct.id);
    if (error) { toast.error("Erro ao excluir produto"); } else { toast.success("Produto excluído"); }
    setDeletingProduct(null);
    setDeleteCheck(null);
  };

  const handleInactivate = async () => {
    if (!deletingProduct) return;
    const { error } = await (supabase as any).from("produtos").update({ status: "inativo" }).eq("id", deletingProduct.id);
    if (error) { toast.error("Erro ao inativar produto"); } else { toast.success("Produto inativado com sucesso"); }
    setDeletingProduct(null);
    setDeleteCheck(null);
  };

  const handleEdit = (product: DbProduct) => {
    setEditingProduct(product);
    setShowForm(true);
  };

  const handleFormClose = (open: boolean) => {
    setShowForm(open);
    if (!open) setEditingProduct(null);
  };

  const sanitizeName = (name: string) =>
    name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").substring(0, 50);

  const toShareableBlob = async (url: string): Promise<{ blob: Blob; ext: string }> => {
    const res = await fetch(url);
    const original = await res.blob();
    const type = original.type || "";
    // PNG and JPG are universally compatible — keep as-is
    if (type === "image/png") return { blob: original, ext: "png" };
    if (type === "image/jpeg") return { blob: original, ext: "jpg" };
    // Convert WebP, GIF, etc. to JPG for maximum compatibility
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((b) => resolve({ blob: b || original, ext: "jpg" }), "image/jpeg", 0.92);
      };
      img.onerror = () => resolve({ blob: original, ext: "jpg" });
      img.src = URL.createObjectURL(original);
    });
  };

  // Open the correct WhatsApp target for the current device
  const openWhatsApp = () => {
    const url = isMobile ? "https://wa.me/" : "https://web.whatsapp.com/";
    return window.open(url, "_blank", "noopener,noreferrer");
  };

  // Generate a ZIP from the given files and trigger automatic download
  const downloadZip = async (files: File[], zipName = "imagens-compartilhamento.zip") => {
    const zip = new JSZip();
    files.forEach((f, i) => {
      // Standardize names inside the zip: produto-1.jpg, produto-2.jpg, ...
      const ext = f.name.split(".").pop() || "jpg";
      zip.file(`produto-${i + 1}.${ext}`, f);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, zipName);
  };

  // Mobile: native share sheet (with files attached, NO message). Always also generate ZIP for backup.
  // Desktop: download ZIP + open WhatsApp Web (no pre-filled message) in parallel.
  const shareViaWhatsApp = async (files: File[]) => {
    // Trigger ZIP download in parallel (works on both mobile and desktop)
    downloadZip(files).catch(() => toast.error("Erro ao gerar arquivo .zip"));

    // Mobile path — native share API includes WhatsApp in the chooser and attaches files directly
    if (isMobile && navigator.canShare && navigator.canShare({ files })) {
      try {
        await navigator.share({ title: "Imagens de Produtos", files });
        return;
      } catch (e: any) {
        if (e.name === "AbortError") return;
        // fall through to web fallback
      }
    }
    // Desktop path (or mobile fallback) — open WhatsApp Web/app without any message
    openWhatsApp();
    toast.success(
      files.length === 1
        ? "WhatsApp aberto — arquivo .zip baixado, anexe a imagem na conversa"
        : `WhatsApp aberto — arquivo .zip com ${files.length} imagens baixado`
    );
  };

  const handleExportImage = useCallback(async (product: DbProduct) => {
    if (!product.image_url) { toast.error("Produto sem imagem"); return; }
    // Open WhatsApp immediately inside the user gesture.
    const w = openWhatsApp();
    if (!w) toast.error("Popup bloqueado — permita popups para este site e tente novamente");
    try {
      const { blob, ext } = await toShareableBlob(product.image_url);
      const name = `produto-${product.id.slice(0, 8)}-${sanitizeName(product.model || product.referencia)}.${ext}`;
      const mimeType = ext === "png" ? "image/png" : "image/jpeg";
      const file = new File([blob], name, { type: mimeType });
      if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ title: "Imagens de Produtos", files: [file] }); }
        catch (e: any) { if (e.name !== "AbortError") {/* fall through to zip */} }
      }
      await downloadZip([file]);
      toast.success("Arquivo .zip baixado — anexe no WhatsApp");
    } catch { toast.error("Erro ao compartilhar imagem"); }
  }, [isMobile]);

  const [exporting, setExporting] = useState(false);

  const handleExportAll = useCallback(async () => {
    const withImages = filtered.filter(p => p.image_url);
    if (withImages.length === 0) { toast.error("Nenhum produto com imagem para exportar"); return; }
    // Open WhatsApp immediately inside the user gesture.
    const w = openWhatsApp();
    if (!w) toast.error("Popup bloqueado — permita popups para este site e tente novamente");
    setExporting(true);
    try {
      const files: File[] = [];
      await Promise.all(withImages.map(async (p) => {
        try {
          const { blob, ext } = await toShareableBlob(p.image_url);
          const name = `produto-${p.id.slice(0, 8)}-${sanitizeName(p.model || p.referencia)}.${ext}`;
          const mimeType = ext === "png" ? "image/png" : "image/jpeg";
          files.push(new File([blob], name, { type: mimeType }));
        } catch { /* skip failed */ }
      }));
      if (files.length === 0) { toast.error("Nenhuma imagem processada"); setExporting(false); return; }
      if (isMobile && navigator.canShare && navigator.canShare({ files })) {
        try { await navigator.share({ title: "Imagens de Produtos", files }); }
        catch (e: any) { if (e.name !== "AbortError") {/* fall through to zip */} }
      }
      await downloadZip(files);
      toast.success(`Arquivo .zip com ${files.length} imagens baixado`);
    } catch { toast.error("Erro ao compartilhar imagens"); }
    finally { setExporting(false); }
  }, [filtered, isMobile]);

  const handlePrintLabel = useCallback((product: DbProduct) => {
    const canvas = document.createElement("canvas");
    try {
      JsBarcode(canvas, product.barcode || product.code, {
        format: "CODE128",
        width: 2,
        height: 40,
        displayValue: true,
        fontSize: 10,
        margin: 2,
      });
    } catch {
      toast.error("Código de barras inválido");
      return;
    }
    const barcodeDataUrl = canvas.toDataURL("image/png");
    const printWindow = window.open("", "_blank", "width=400,height=200");
    if (!printWindow) { toast.error("Popup bloqueado"); return; }
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Etiqueta</title><style>
      @page { size: 95mm 12mm; margin: 0; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { width: 95mm; height: 12mm; display: flex; align-items: center; }
      img { height: 10mm; width: auto; margin-left: 1mm; }
    </style></head><body>
      <img src="${barcodeDataUrl}" />
    </body></html>`);
    printWindow.document.close();
    printWindow.onload = () => { printWindow.print(); printWindow.close(); };
  }, []);


  return (
    <div>
      <FilialSelector />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-title font-semibold tracking-tighter">Produtos</h1>
            <p className="text-ui text-muted-foreground">{filtered.length} produtos</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="gap-1.5 text-[#25D366] hover:text-[#25D366]" onClick={handleExportAll} disabled={exporting}>
              <WhatsAppIcon className="h-4 w-4" />
              {exporting ? "Preparando..." : "Enviar por WhatsApp"}
            </Button>
            {canCreate && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowAtacado(true)}>
                <ShoppingCart className="h-4 w-4" />
                Atacado
              </Button>
            )}
            {canCreate && (
              <Button size="sm" className="gap-1.5" onClick={() => { setEditingProduct(null); setShowForm(true); }}>
                <Plus className="h-4 w-4" />
                Novo Produto
              </Button>
            )}
          </div>
        </div>

        {products.length > 0 && <ProductFilters filters={filters} onChange={setFilters} products={products} />}

        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map(product => {
              return (
                <div key={product.id} className="rounded-lg shadow-card bg-card p-3 group hover:shadow-md transition-shadow relative">
                    <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {canViewImages && product.image_url && (
                        <Button variant="secondary" size="icon" className="h-7 w-7" title="Visualizar" onClick={() => setZoomImage({ url: product.image_url, name: product.model || product.referencia, category: product.category, classificacao: (product as any).classificacao, haste: product.temple_size, lente: product.lens_size, ponte: product.bridge_size })}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button variant="secondary" size="icon" className="h-7 w-7" onClick={() => handleEdit(product)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => checkAndDelete(product)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                  <div className="aspect-[3/2] rounded-md bg-secondary flex items-center justify-center overflow-hidden">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.model || product.referencia} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-muted-foreground/30 text-title font-bold">{product.model || product.referencia}</span>
                    )}
                  </div>
                  <div className="mt-3 flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <h3 className="text-ui font-semibold truncate">
                        {product.model || product.referencia}
                        {(product as any).classificacao && <span className="ml-1 text-primary">({(product as any).classificacao})</span>}
                      </h3>
                      <p className="text-[10px] font-mono text-muted-foreground/60">{product.referencia}</p>
                      <p className="text-[10px] font-mono text-muted-foreground/60">{product.barcode}</p>
                      {!(product as any).is_acessorio && (product.cor_armacao || product.color) && (
                        <p className="text-caption text-muted-foreground">
                          {product.cor_armacao || product.color}
                          {product.material_aro && ` · ${product.material_aro}`}
                        </p>
                      )}
                      {(product as any).is_acessorio && (product as any).subcategoria_acessorio && (
                        <p className="text-caption text-muted-foreground">{(product as any).subcategoria_acessorio}</p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(product as any).estilo && <Badge variant="outline" className="text-caption">{(product as any).estilo}</Badge>}
                        {(product as any).categoria_idade && <Badge variant="outline" className="text-caption">{(product as any).categoria_idade}</Badge>}
                        {(product as any).genero && <Badge variant="outline" className="text-caption">{(product as any).genero}</Badge>}
                        
                        {(product as any).is_acessorio && <Badge variant="secondary" className="text-caption">Acessório</Badge>}
                      </div>
                      {selectedFilial === "all" && (
                        <p className="text-caption text-primary">{getFilialName(product.filial_id)}</p>
                      )}
                    </div>
                    <span className="text-ui font-medium tabular-nums text-primary whitespace-nowrap">
                      R$ {Number(product.retail_price)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    {!(product as any).is_acessorio ? (
                      <div className="flex gap-2 text-caption font-mono text-muted-foreground">
                        <span>{product.lens_size}mm</span>
                        <span>□</span>
                        <span>{product.bridge_size}mm</span>
                        <span>—</span>
                        <span>{product.temple_size}mm</span>
                      </div>
                    ) : (
                      <div />
                    )}
                    {(() => {
                      const level = getStockLevel(product.stock, 0);
                      return (
                        <Badge
                          variant={level === "out_of_stock" ? "destructive" : level === "critical" || level === "low" ? "outline" : "secondary"}
                          className={`text-caption tabular-nums ${level === "critical" ? "border-orange-500 text-orange-600" : level === "low" ? "border-warning text-warning" : ""}`}
                        >
                          {product.stock} un.
                          {level === "low" && " ⚠"}
                          {level === "critical" && " 🟠"}
                        </Badge>
                      );
                    })()}
                    {product.image_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-[#25D366] hover:text-[#25D366]"
                        title="Enviar imagem por WhatsApp"
                        onClick={(e) => { e.stopPropagation(); handleExportImage(product); }}
                      >
                        <WhatsAppIcon className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Imprimir etiqueta"
                      onClick={(e) => { e.stopPropagation(); handlePrintLabel(product); }}
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Package className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-ui font-medium">Nenhum produto encontrado</p>
            <p className="text-caption mt-1">Tente ajustar os filtros ou cadastre um novo produto</p>
          </div>
        )}

        <ProductFormDialog open={showForm} onOpenChange={handleFormClose} product={editingProduct} />
        <AtacadoDialog open={showAtacado} onOpenChange={setShowAtacado} />
        {zoomImage && (
           <ProductImageDialog
            open={!!zoomImage}
            onOpenChange={(o) => { if (!o) setZoomImage(null); }}
            imageUrl={zoomImage.url}
            productName={zoomImage.name}
            category={zoomImage.category}
            classificacao={zoomImage.classificacao}
            haste={zoomImage.haste}
            lente={zoomImage.lente}
            ponte={zoomImage.ponte}
          />
        )}
        

        <AlertDialog open={!!deletingProduct} onOpenChange={(o) => { if (!o) { setDeletingProduct(null); setDeleteCheck(null); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {deleteCheck?.canDelete === false ? "Não é possível excluir" : "Excluir produto?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deleteCheck === null
                  ? "Verificando dependências..."
                  : deleteCheck.canDelete
                    ? `O produto "${deletingProduct?.referencia}" será removido permanentemente.`
                    : deleteCheck.reason}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              {deleteCheck?.canDelete === false ? (
                <AlertDialogAction onClick={handleInactivate} className="bg-amber-600 text-white hover:bg-amber-700">
                  Inativar Produto
                </AlertDialogAction>
              ) : deleteCheck?.canDelete ? (
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Excluir
                </AlertDialogAction>
              ) : null}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
