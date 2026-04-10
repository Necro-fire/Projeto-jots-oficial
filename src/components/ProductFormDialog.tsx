import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useFilial } from "@/contexts/FilialContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImagePlus, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { NumericStepper } from "@/components/ui/numeric-stepper";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { DbProduct } from "@/hooks/useSupabaseData";
import { generateProductCodes, findProductByHash, upsertEstoque } from "@/hooks/useSupabaseData";

import { generateProductHash } from "@/lib/productHash";
import { shouldHaveFooter, renderImageWithFooter } from "@/lib/productImageFooter";
import {
  CLASSIFICACOES, CATEGORIAS_IDADE, GENEROS, ESTILOS, TODAS_CORES, CORES_SOLIDAS,
  MATERIAIS_ARO, MATERIAIS_HASTE, TIPOS_LENTE, CORES_LENTE_CLIPON,
  MEDIDAS_LENTE, MEDIDAS_ALTURA_LENTE, MEDIDAS_PONTE, MEDIDAS_HASTE as MEDIDAS_HASTE_RANGE,
  TIPOS_HASTE, PONTES_ARMACAO, CLASSIFICACOES_PRODUTO, type ClassificacaoProduto,
} from "@/data/productConstants";
import {
  ACESSORIOS_CATEGORIAS, getTiposByCategoria, getVariacoesByTipo,
  getCoresByVariacao, getMateriaisByCategoria, getTiposVendaByCategoria, hasMaterial,
  hasVariacoesDuplas, getVariacoesDuplas, isPersonalizavel, isLenteCategory,
  LENTES_SOLAR_TIPOS, LENTES_SOLAR_CORES, LENTES_BASES, LENTES_BLOCOS_BASES,
  LENTES_INDICES, LENTES_TRATAMENTOS,
} from "@/data/accessoryConstants";
import { Checkbox } from "@/components/ui/checkbox";

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: DbProduct | null;
}

export function ProductFormDialog({ open, onOpenChange, product }: ProductFormDialogProps) {
  const { selectedFilial } = useFilial();
  const filialLocked = selectedFilial !== "all";
  const [classificacaoProduto, setClassificacaoProduto] = useState<ClassificacaoProduto | "">("");
  const isAcessorio = classificacaoProduto === "Acessório";

  // Clip-on state
  const [cliponQtdLentes, setCliponQtdLentes] = useState(0);
  const [cliponLentes, setCliponLentes] = useState<{ tipo: string; cor: string }[]>([]);
  const [referencia, setReferencia] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState<number>(0);
  const [custo, setCusto] = useState<number>(0);
  const [detail, setDetail] = useState("");
  const [filial, setFilial] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  

  // Frame-specific fields
  const [categoriaIdade, setCategoriaIdade] = useState("");
  const [genero, setGenero] = useState("");
  const [estilo, setEstilo] = useState("");
  const [corArmacao, setCorArmacao] = useState("");
  const [corHaste, setCorHaste] = useState("");
  const [materialAro, setMaterialAro] = useState("");
  const [materialHaste, setMaterialHaste] = useState("");
  const [lensSize, setLensSize] = useState("");
  const [alturaLente, setAlturaLente] = useState("");
  const [bridgeSize, setBridgeSize] = useState("");
  const [templeSize, setTempleSize] = useState("");
  const [tipoLente, setTipoLente] = useState("");
  const [polarizado, setPolarizado] = useState("");
  const [tipoHaste, setTipoHaste] = useState("");
  const [ponteArmacao, setPonteArmacao] = useState("");
  const [ncm, setNcm] = useState("");
  const [classificacao, setClassificacao] = useState("");

  // Accessory fields (new hierarchical)
  const [subcategoriaAcessorio, setSubcategoriaAcessorio] = useState(""); // legacy compat
  const [categoriaAcessorio, setCategoriaAcessorio] = useState("");
  const [tipoAcessorio, setTipoAcessorio] = useState("");
  const [variacaoAcessorio, setVariacaoAcessorio] = useState("");
  const [corAcessorio, setCorAcessorio] = useState("");
  const [materialAcessorio, setMaterialAcessorio] = useState("");
  const [tipoVenda, setTipoVenda] = useState("");
  // Parafusos dual variations
  const [variacaoRosca, setVariacaoRosca] = useState("");
  const [variacaoComprimento, setVariacaoComprimento] = useState("");
  // Estojos personalizado
  const [isPersonalizado, setIsPersonalizado] = useState(false);
  const [acrescimoPersonalizado, setAcrescimoPersonalizado] = useState<number>(0);
  // Lentes CG
  const [lenteSolarTipo, setLenteSolarTipo] = useState("");
  const [lenteSolarCor, setLenteSolarCor] = useState("");
  const [lenteBase, setLenteBase] = useState("");
  const [lenteIndice, setLenteIndice] = useState("");
  const [lenteTratamentos, setLenteTratamentos] = useState<string[]>([]);
  const [lenteEsferico, setLenteEsferico] = useState("");
  const [lenteCilindrico, setLenteCilindrico] = useState("");
  const [lenteAdicao, setLenteAdicao] = useState("");
  const [lenteDiametro, setLenteDiametro] = useState("");

  const isEditing = !!product;

  // Derived lists for cascading selects
  const tiposAcessorio = getTiposByCategoria(categoriaAcessorio);
  const variacoesAcessorio = getVariacoesByTipo(categoriaAcessorio, tipoAcessorio);
  const coresAcessorio = getCoresByVariacao(categoriaAcessorio, tipoAcessorio, variacaoAcessorio);
  const materiaisAcessorio = getMateriaisByCategoria(categoriaAcessorio);
  const tiposVendaAcessorio = getTiposVendaByCategoria(categoriaAcessorio);
  const showMaterial = hasMaterial(categoriaAcessorio);

  useEffect(() => {
    if (product) {
      const cat = product.category as ClassificacaoProduto;
      setClassificacaoProduto(product.is_acessorio ? "Acessório" : (["Receituário", "Solar", "Clip-on"].includes(cat) ? cat : ""));
      // Load clip-on lenses from tipo_lente JSON
      if (cat === "Clip-on" && product.tipo_lente) {
        try {
          const parsed = JSON.parse(product.tipo_lente);
          if (Array.isArray(parsed)) {
            setCliponQtdLentes(parsed.length);
            setCliponLentes(parsed);
          }
        } catch { /* not JSON, ignore */ }
      }
      setReferencia(product.referencia || "");
      setName(product.model);
      setPrice(Number(product.retail_price) || 0);
      setCusto(Number(product.custo) || 0);
      setDetail(product.description || "");
      setFilial(filialLocked ? selectedFilial : product.filial_id);
      setQuantidade(String(product.stock));
      setCategoriaIdade(product.categoria_idade || "");
      setGenero(product.genero || "");
      setEstilo(product.estilo || "");
      setCorArmacao(product.cor_armacao || "");
      setCorHaste((product as any).cor_haste || "");
      setMaterialAro(product.material_aro || "");
      setMaterialHaste(product.material_haste || "");
      setLensSize(product.lens_size ? String(product.lens_size) : "");
      setAlturaLente(product.altura_lente ? String(product.altura_lente) : "");
      setBridgeSize(product.bridge_size ? String(product.bridge_size) : "");
      setTempleSize(product.temple_size ? String(product.temple_size) : "");
      setTipoLente(product.tipo_lente || "");
      setPolarizado((product as any).polarizado || "");
      setTipoHaste((product as any).tipo_haste || "");
      setPonteArmacao((product as any).ponte_armacao || "");
      setSubcategoriaAcessorio((product as any).subcategoria_acessorio || "");
      setCategoriaAcessorio((product as any).categoria_acessorio || "");
      setTipoAcessorio((product as any).tipo_acessorio || "");
      setVariacaoAcessorio((product as any).variacao_acessorio || "");
      setCorAcessorio((product as any).cor_acessorio || "");
      setMaterialAcessorio((product as any).material_acessorio || "");
      setTipoVenda((product as any).tipo_venda || "");
      setNcm((product as any).ncm || "");
      setClassificacao((product as any).classificacao || "");
      setImagePreview(product.image_url || null);
      setDuplicateInfo(null);
    } else {
      resetForm();
    }
  }, [product, open, selectedFilial, filialLocked]);

  const resetForm = () => {
    setClassificacaoProduto("");
    setCliponQtdLentes(0);
    setCliponLentes([]);
    setReferencia("");
    setName("");
    setPrice(0);
    setCusto(0);
    setDetail("");
    setFilial(filialLocked ? selectedFilial : "");
    setQuantidade("1");
    
    setImageFile(null);
    setImagePreview(null);
    setCategoriaIdade("");
    setGenero("");
    setEstilo("");
    setCorArmacao("");
    setCorHaste("");
    setMaterialAro("");
    setMaterialHaste("");
    setLensSize("");
    setAlturaLente("");
    setBridgeSize("");
    setTempleSize("");
    setTipoLente("");
    setPolarizado("");
    setTipoHaste("");
    setPonteArmacao("");
    setNcm("");
    setClassificacao("");
    setSubcategoriaAcessorio("");
    setCategoriaAcessorio("");
    setTipoAcessorio("");
    setVariacaoAcessorio("");
    setCorAcessorio("");
    setMaterialAcessorio("");
    setTipoVenda("");
    setVariacaoRosca("");
    setVariacaoComprimento("");
    setIsPersonalizado(false);
    setAcrescimoPersonalizado(0);
    setLenteSolarTipo("");
    setLenteSolarCor("");
    setLenteBase("");
    setLenteIndice("");
    setLenteTratamentos([]);
    setLenteEsferico("");
    setLenteCilindrico("");
    setLenteAdicao("");
    setLenteDiametro("");
    setDuplicateInfo(null);
  };

  // Build a legacy-compat subcategoria string from hierarchical fields
  const buildSubcategoria = () => {
    if (!categoriaAcessorio) return "";
    const parts = [categoriaAcessorio, tipoAcessorio, variacaoAcessorio].filter(Boolean);
    return parts.join(" > ");
  };

  // Check for duplicates when key fields change (only for new products)
  useEffect(() => {
    if (isEditing || !referencia.trim() || !filial) {
      setDuplicateInfo(null);
      return;
    }

    const checkDuplicate = async () => {
      const filials = filial === "all" ? ["1", "2", "3"] : [filial];
      for (const fId of filials) {
        if (classificacao) {
          const { data: exactMatch } = await (supabase as any)
            .from("produtos")
            .select("id, referencia, classificacao")
            .eq("referencia", referencia.trim())
            .eq("classificacao", classificacao)
            .eq("filial_id", fId)
            .maybeSingle();
          if (exactMatch) {
            setDuplicateInfo(`Este produto já está cadastrado no sistema. (Código "${referencia.trim()}" com classificação ${classificacao} na filial ${fId})`);
            return;
          }
        }
      }
      setDuplicateInfo(null);
    };

    const timeout = setTimeout(checkDuplicate, 500);
    return () => clearTimeout(timeout);
  }, [referencia, classificacao, filial, isEditing]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const uploadImage = async (file: File): Promise<string> => {
    const ext = file.name.split(".").pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSave = async () => {
    if (!classificacaoProduto) { toast.error("Selecione a classificação do produto"); return; }
    if (!isAcessorio && !referencia.trim()) { toast.error("Informe o código da peça"); return; }
    if (!isAcessorio && !classificacao) { toast.error("Selecione a classificação (C1-C10)"); return; }
    if (!price || price <= 0) { toast.error("Informe um preço válido"); return; }
    if (!filial) { toast.error("Selecione uma filial"); return; }
    if (!/^\d{8}$/.test(ncm)) { toast.error("Informe um NCM válido com 8 dígitos numéricos"); return; }

    if (duplicateInfo && !isEditing) {
      toast.error("Este produto já está cadastrado no sistema.");
      return;
    }

    const effectiveReferencia = isAcessorio ? ncm : referencia.trim();
    const effectiveClassificacao = isAcessorio ? "" : classificacao;

    if (!isAcessorio) {
      const filials = isEditing ? [filial] : (filial === "all" ? ["1", "2", "3"] : [filial]);
      for (const fId of filials) {
        const { data: existing } = await (supabase as any)
          .from("produtos")
          .select("id")
          .eq("referencia", effectiveReferencia)
          .eq("classificacao", effectiveClassificacao)
          .eq("filial_id", fId)
          .maybeSingle();
        if (existing && (!isEditing || existing.id !== product?.id)) {
          toast.error("Este produto já está cadastrado no sistema.");
          return;
        }
      }
    }

    setSaving(true);
    try {
      let imageUrl = isEditing ? (product?.image_url || "") : "";
      if (imageFile) {
        imageUrl = await uploadImage(imageFile);
      }

      const subcatComputed = buildSubcategoria();

      const hash = generateProductHash({
        referencia: referencia.trim(),
        classificacao,
        categoriaIdade,
        genero,
        estilo,
        corArmacao,
        materialAro,
        materialHaste,
        lensSize: Number(lensSize) || 0,
        alturaLente: Number(alturaLente) || 0,
        bridgeSize: Number(bridgeSize) || 0,
        templeSize: Number(templeSize) || 0,
        tipoLente,
        isAcessorio,
        subcategoriaAcessorio: subcatComputed,
      });

      const qty = Number(quantidade) || 1;

      const accessoryFields = {
        categoria_acessorio: isAcessorio ? categoriaAcessorio : "",
        tipo_acessorio: isAcessorio ? tipoAcessorio : "",
        variacao_acessorio: isAcessorio ? variacaoAcessorio : "",
        cor_acessorio: isAcessorio ? corAcessorio : "",
        material_acessorio: isAcessorio ? materialAcessorio : "",
        tipo_venda: isAcessorio ? tipoVenda : "",
      };

      // Tipo de haste: se nenhuma opção marcada, é "Comum"
      const tipoHasteValue = isAcessorio ? "" : (tipoHaste || "Comum");
      const polarizadoValue = isAcessorio || classificacaoProduto === "Receituário" || classificacaoProduto === "Clip-on" ? "" : polarizado;

      // For Clip-on, store lenses as JSON in tipo_lente
      const tipoLenteValue = classificacaoProduto === "Clip-on"
        ? JSON.stringify(cliponLentes)
        : classificacaoProduto === "Receituário" ? "" : tipoLente;

      const buildBaseData = (codes?: { code: string; barcode: string }, fId?: string) => ({
        ...(codes ? { code: codes.code, barcode: codes.barcode } : {}),
        referencia: effectiveReferencia,
        model: effectiveReferencia,
        classificacao: effectiveClassificacao,
        category: classificacaoProduto,
        retail_price: price,
        custo: custo || 0,
        description: detail.trim(),
        image_url: imageUrl,
        filial_id: fId || filial,
        is_acessorio: isAcessorio,
        categoria_idade: isAcessorio ? "" : categoriaIdade,
        genero: isAcessorio ? "" : genero,
        estilo: isAcessorio ? "" : estilo,
        cor_armacao: isAcessorio ? "" : corArmacao,
        cor_haste: isAcessorio ? "" : corHaste,
        color: isAcessorio ? corAcessorio : corArmacao,
        material_aro: isAcessorio ? "" : materialAro,
        material_haste: isAcessorio ? "" : materialHaste,
        lens_size: isAcessorio ? 0 : (Number(lensSize) || 0),
        altura_lente: isAcessorio ? 0 : (Number(alturaLente) || 0),
        bridge_size: isAcessorio ? 0 : (Number(bridgeSize) || 0),
        temple_size: isAcessorio ? 0 : (Number(templeSize) || 0),
        tipo_lente: isAcessorio ? "" : tipoLenteValue,
        polarizado: polarizadoValue,
        tipo_haste: tipoHasteValue,
        ponte_armacao: isAcessorio ? "" : ponteArmacao,
        subcategoria_acessorio: isAcessorio ? subcatComputed : "",
        hash_produto: hash,
        ncm,
        stock: qty,
        ...accessoryFields,
      });

      if (isEditing) {
        const baseData = buildBaseData();

        const { error } = await (supabase as any).from("produtos").update(baseData).eq("id", product!.id);
        if (error) throw error;

        const { data: existingEstoque } = await (supabase as any)
          .from("estoque")
          .select("id")
          .eq("produto_id", product!.id)
          .eq("filial_id", filial)
          .maybeSingle();

        if (existingEstoque) {
          await (supabase as any).from("estoque").update({ quantidade: qty }).eq("id", existingEstoque.id);
        } else {
          await (supabase as any).from("estoque").insert({ produto_id: product!.id, filial_id: filial, quantidade: qty });
        }

        toast.success("Produto atualizado com sucesso!");
      } else {
        const targetFilials = filial === "all" ? ["1", "2", "3"] : [filial];

        for (const fId of targetFilials) {
          const codes = await generateProductCodes();
          const baseData = buildBaseData(codes, fId);

          const { data: newProduct, error } = await (supabase as any).from("produtos").insert(baseData).select().single();
          if (error) throw error;

          await (supabase as any).from("estoque").insert({
            produto_id: newProduct.id,
            filial_id: fId,
            quantidade: qty,
          });

          toast.success(
            targetFilials.length > 1
              ? `Produto cadastrado na filial ${fId}!`
              : `Produto cadastrado! Código de barras: ${codes.barcode}`
          );
        }
      }

      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar produto");
    } finally {
      setSaving(false);
    }
  };

  const sortedCoresSolidas = [...CORES_SOLIDAS].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Produto" : "Novo Produto"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Duplicate Detection Banner */}
          {duplicateInfo && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-caption text-destructive">{duplicateInfo}</p>
            </div>
          )}

          {/* Product Classification */}
          <div className="rounded-lg border p-3">
            <Label className="font-medium">Classificação do Produto *</Label>
            <Select value={classificacaoProduto} onValueChange={(v) => {
              setClassificacaoProduto(v as ClassificacaoProduto);
              if (v !== "Clip-on") { setCliponQtdLentes(0); setCliponLentes([]); }
              if (v === "Receituário") { setTipoLente(""); setPolarizado(""); }
            }}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione a classificação" /></SelectTrigger>
              <SelectContent>
                {CLASSIFICACOES_PRODUTO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Image */}
          <div>
            <Label>Imagem do produto</Label>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-1.5 w-full aspect-[3/2] rounded-lg border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center gap-2 hover:border-primary/50 transition-colors overflow-hidden bg-secondary/30"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <>
                  <ImagePlus className="h-8 w-8 text-muted-foreground/40" />
                  <span className="text-caption text-muted-foreground">Clique para adicionar imagem</span>
                </>
              )}
            </button>
          </div>

          {/* 1. Identificação */}
          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="text-sm font-semibold px-1">Identificação</legend>
            {!isAcessorio && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="referencia">Código da peça *</Label>
                  <Input id="referencia" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Ex: ISA2387" className="mt-1.5" />
                </div>
                <div>
                  <Label>Classificação *</Label>
                  <Select value={classificacao} onValueChange={setClassificacao}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {CLASSIFICACOES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="ncm">{isAcessorio ? "Código do Acessório (NCM) *" : "Código NCM *"}</Label>
              <Input
                id="ncm"
                value={ncm}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                  setNcm(v);
                }}
                placeholder="Ex: 90049090"
                maxLength={8}
                className="mt-1.5"
              />
              {ncm.length > 0 && ncm.length < 8 && (
                <p className="text-xs text-destructive mt-1">{8 - ncm.length} dígitos restantes</p>
              )}
            </div>
            {isEditing && product && (
              <div>
                <Label className="text-muted-foreground">Código de barras</Label>
                <Input value={product.barcode} disabled className="mt-1.5 bg-muted" />
              </div>
            )}
            {!isEditing && (
              <div className="flex items-center gap-2 text-caption text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Código de barras será gerado automaticamente</span>
              </div>
            )}
          </fieldset>


          {/* FRAME-SPECIFIC FIELDS */}
          {!isAcessorio && (
            <>
              {/* 2. Classificação */}
              <fieldset className="space-y-3 rounded-lg border p-3">
                <legend className="text-sm font-semibold px-1">Classificação</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Categoria</Label>
                    <Select value={categoriaIdade} onValueChange={setCategoriaIdade}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Adulto e Infantil" /></SelectTrigger>
                      <SelectContent>
                        {[...CATEGORIAS_IDADE].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Gênero</Label>
                    <Select value={genero} onValueChange={setGenero}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Masculino, Feminino e Unissex" /></SelectTrigger>
                      <SelectContent>
                        {[...GENEROS].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(g => (
                          <SelectItem key={g} value={g}>{g}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </fieldset>

              {/* 3. Estilo */}
              <div>
                <Label>Estilo da Armação</Label>
                <Select value={estilo} onValueChange={setEstilo}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione o estilo" /></SelectTrigger>
                  <SelectContent>
                    {[...ESTILOS].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* 4. Cor da Armação + Cor da Haste */}
              <fieldset className="space-y-3 rounded-lg border p-3">
                <legend className="text-sm font-semibold px-1">Cores</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Cor da Armação</Label>
                    <Select value={corArmacao} onValueChange={setCorArmacao}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione a cor" /></SelectTrigger>
                      <SelectContent>
                        {[...TODAS_CORES].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Cor da Haste</Label>
                    <Select value={corHaste} onValueChange={setCorHaste}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione a cor" /></SelectTrigger>
                      <SelectContent>
                        {sortedCoresSolidas.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </fieldset>

              {/* 5. Material */}
              <fieldset className="space-y-3 rounded-lg border p-3">
                <legend className="text-sm font-semibold px-1">Material</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Material do Aro</Label>
                    <Select value={materialAro} onValueChange={setMaterialAro}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {[...MATERIAIS_ARO].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Material da Haste</Label>
                    <Select value={materialHaste} onValueChange={setMaterialHaste}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {[...MATERIAIS_HASTE].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </fieldset>

              {/* Tipo de Haste */}
              <fieldset className="space-y-3 rounded-lg border p-3">
                <legend className="text-sm font-semibold px-1">Haste</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tipo de Haste</Label>
                    <Select value={tipoHaste} onValueChange={setTipoHaste}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Comum" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Comum">Comum</SelectItem>
                        {TIPOS_HASTE.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground mt-1">Se não selecionado, será considerado Comum</p>
                  </div>
                  <div>
                    <Label>Ponte da Armação</Label>
                    <Select value={ponteArmacao} onValueChange={setPonteArmacao}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {[...PONTES_ARMACAO].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </fieldset>

              {/* 6. Medidas */}
              <fieldset className="space-y-3 rounded-lg border p-3">
                <legend className="text-sm font-semibold px-1">Medidas (mm)</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Largura da Lente ({MEDIDAS_LENTE.min}-{MEDIDAS_LENTE.max})</Label>
                    <Input type="number" min={MEDIDAS_LENTE.min} max={MEDIDAS_LENTE.max} value={lensSize} onChange={(e) => setLensSize(e.target.value)} className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Altura da Lente ({MEDIDAS_ALTURA_LENTE.min}-{MEDIDAS_ALTURA_LENTE.max})</Label>
                    <Input type="number" min={MEDIDAS_ALTURA_LENTE.min} max={MEDIDAS_ALTURA_LENTE.max} value={alturaLente} onChange={(e) => setAlturaLente(e.target.value)} className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Largura da Ponte ({MEDIDAS_PONTE.min}-{MEDIDAS_PONTE.max})</Label>
                    <Input type="number" min={MEDIDAS_PONTE.min} max={MEDIDAS_PONTE.max} value={bridgeSize} onChange={(e) => setBridgeSize(e.target.value)} className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Comprimento da Haste ({MEDIDAS_HASTE_RANGE.min}-{MEDIDAS_HASTE_RANGE.max})</Label>
                    <Input type="number" min={MEDIDAS_HASTE_RANGE.min} max={MEDIDAS_HASTE_RANGE.max} value={templeSize} onChange={(e) => setTempleSize(e.target.value)} className="mt-1.5" />
                  </div>
                </div>
              </fieldset>

              {/* 7. Tipo de Lente + Polarizado — Solar only */}
              {classificacaoProduto === "Solar" && (
                <fieldset className="space-y-3 rounded-lg border p-3">
                  <legend className="text-sm font-semibold px-1">Lente</legend>
                  <div>
                    <Label>Tipo de Lente</Label>
                    <Select value={tipoLente} onValueChange={setTipoLente}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione o tipo de lente" /></SelectTrigger>
                      <SelectContent>
                        {[...TIPOS_LENTE].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Polarizado</Label>
                    <Select value={polarizado} onValueChange={setPolarizado}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Sim">Sim</SelectItem>
                        <SelectItem value="Não">Não</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </fieldset>
              )}

              {/* 7b. Clip-on — dynamic lens selectors */}
              {classificacaoProduto === "Clip-on" && (
                <fieldset className="space-y-3 rounded-lg border p-3">
                  <legend className="text-sm font-semibold px-1">Lentes do Clip-on</legend>
                  <div>
                    <Label>Quantidade de Lentes</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={cliponQtdLentes || ""}
                      onChange={(e) => {
                        const qty = Math.min(10, Math.max(0, Number(e.target.value) || 0));
                        setCliponQtdLentes(qty);
                        setCliponLentes(prev => {
                          const arr = [...prev];
                          while (arr.length < qty) arr.push({ tipo: "", cor: "" });
                          return arr.slice(0, qty);
                        });
                      }}
                      className="mt-1.5 w-24"
                      placeholder="Ex: 3"
                    />
                  </div>
                  {cliponLentes.map((lente, idx) => (
                    <div key={idx} className="p-2 rounded-md bg-secondary/30">
                      <div>
                        <Label className="text-caption">Lente {idx + 1} — Tipo</Label>
                        <Select value={lente.tipo} onValueChange={(v) => {
                          const arr = [...cliponLentes];
                          arr[idx] = { ...arr[idx], tipo: v };
                          setCliponLentes(arr);
                        }}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Tipo" /></SelectTrigger>
                          <SelectContent>
                            {[...TIPOS_LENTE].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </fieldset>
              )}
            </>
          )}

          {/* ACCESSORY-SPECIFIC FIELDS — Cascading selects */}
          {isAcessorio && (
            <fieldset className="space-y-3 rounded-lg border p-3">
              <legend className="text-sm font-semibold px-1">Classificação do Acessório</legend>

              {/* Categoria */}
              <div>
                <Label>Categoria *</Label>
                <Select
                  value={categoriaAcessorio}
                  onValueChange={(v) => {
                    setCategoriaAcessorio(v);
                    setVariacaoAcessorio("");
                    setCorAcessorio("");
                    setMaterialAcessorio("");
                    setTipoVenda("");
                    setVariacaoRosca("");
                    setVariacaoComprimento("");
                    setIsPersonalizado(false);
                    setAcrescimoPersonalizado(0);
                    setLenteSolarTipo("");
                    setLenteSolarCor("");
                    setLenteBase("");
                    setLenteIndice("");
                    setLenteTratamentos([]);
                    setLenteEsferico("");
                    setLenteCilindrico("");
                    setLenteAdicao("");
                    setLenteDiametro("");
                    // Auto-select "Padrão" if it's the only tipo
                    const tipos = getTiposByCategoria(v);
                    if (tipos.length === 1 && tipos[0].nome === "Padrão") {
                      setTipoAcessorio("Padrão");
                    } else {
                      setTipoAcessorio("");
                    }
                  }}
                >
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                  <SelectContent>
                    {[...ACESSORIOS_CATEGORIAS].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(c => (
                      <SelectItem key={c.nome} value={c.nome}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tipo — hidden when only "Padrão" exists */}
              {categoriaAcessorio && tiposAcessorio.length > 0 && !(tiposAcessorio.length === 1 && tiposAcessorio[0].nome === "Padrão") && (
                <div>
                  <Label>Tipo *</Label>
                  <Select
                    value={tipoAcessorio}
                    onValueChange={(v) => {
                      setTipoAcessorio(v);
                      setVariacaoAcessorio("");
                      setCorAcessorio("");
                      setLenteSolarTipo("");
                      setLenteSolarCor("");
                      setLenteBase("");
                      setLenteIndice("");
                      setLenteTratamentos([]);
                      setLenteEsferico("");
                      setLenteCilindrico("");
                      setLenteAdicao("");
                      setLenteDiametro("");
                    }}
                  >
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                    <SelectContent>
                      {[...tiposAcessorio].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(t => (
                        <SelectItem key={t.nome} value={t.nome}>{t.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Variação */}
              {tipoAcessorio && variacoesAcessorio.length > 0 && !variacoesAcessorio.every(v => v.nome === "Padrão") && (
                <div>
                  <Label>Variação</Label>
                  <Select
                    value={variacaoAcessorio}
                    onValueChange={(v) => {
                      setVariacaoAcessorio(v);
                      setCorAcessorio("");
                    }}
                  >
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione a variação" /></SelectTrigger>
                    <SelectContent>
                      {[...variacoesAcessorio].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(v => (
                        <SelectItem key={v.nome} value={v.nome}>{v.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Parafusos: Dual variations (Rosca + Comprimento) */}
              {hasVariacoesDuplas(categoriaAcessorio) && (() => {
                const duplas = getVariacoesDuplas(categoriaAcessorio);
                if (!duplas) return null;
                return (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>{duplas.label1}</Label>
                      <Select value={variacaoRosca} onValueChange={setVariacaoRosca}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {duplas.valores1.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{duplas.label2}</Label>
                      <Select value={variacaoComprimento} onValueChange={setVariacaoComprimento}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {duplas.valores2.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })()}

              {/* Material */}
              {showMaterial && materiaisAcessorio.length > 0 && (
                <div>
                  <Label>Material</Label>
                  <Select value={materialAcessorio} onValueChange={setMaterialAcessorio}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione o material" /></SelectTrigger>
                    <SelectContent>
                      {[...materiaisAcessorio].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(m => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Tipo de Venda */}
              {categoriaAcessorio && tiposVendaAcessorio.length > 0 && (
                <div>
                  <Label>Tipo de Venda *</Label>
                  <Select value={tipoVenda} onValueChange={setTipoVenda}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione o tipo de venda" /></SelectTrigger>
                    <SelectContent>
                      {[...tiposVendaAcessorio].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(tv => (
                        <SelectItem key={tv} value={tv}>{tv}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Cor — show when tipo has cores (not just "Nenhuma") */}
              {tipoAcessorio && (() => {
                // Get cores from the selected variação, or from the first variação if only "Padrão"
                const selectedVar = variacaoAcessorio || (variacoesAcessorio.length === 1 && variacoesAcessorio[0].nome === "Padrão" ? "Padrão" : "");
                const cores = selectedVar ? getCoresByVariacao(categoriaAcessorio, tipoAcessorio, selectedVar) : [];
                const hasCores = cores.length > 0 && !(cores.length === 1 && cores[0] === "Nenhuma");
                if (!hasCores) return null;
                return (
                  <div>
                    <Label>Cor</Label>
                    <Select value={corAcessorio} onValueChange={setCorAcessorio}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione a cor" /></SelectTrigger>
                    <SelectContent>
                      {[...cores].filter(c => c !== "Nenhuma").sort((a, b) => a.localeCompare(b, 'pt-BR')).map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })()}

              {/* Estojos: Personalizado toggle + acréscimo */}
              {isPersonalizavel(categoriaAcessorio) && (
                <div className="space-y-2 p-3 rounded-md bg-secondary/30">
                  <div className="flex items-center gap-2">
                    <Switch checked={isPersonalizado} onCheckedChange={setIsPersonalizado} />
                    <Label>Personalizado?</Label>
                  </div>
                  {isPersonalizado && (
                    <div>
                      <Label>Acréscimo por unidade (R$)</Label>
                      <CurrencyInput value={acrescimoPersonalizado} onValueChange={setAcrescimoPersonalizado} placeholder="0,00" className="mt-1.5" />
                    </div>
                  )}
                </div>
              )}

              {/* ── LENTES CG — Special Fields ── */}
              {isLenteCategory(categoriaAcessorio) && tipoAcessorio === "Solar" && (
                <fieldset className="space-y-3 rounded-lg border p-3">
                  <legend className="text-sm font-semibold px-1">Lente Solar</legend>
                  <div>
                    <Label>Tipo</Label>
                    <Select value={lenteSolarTipo} onValueChange={setLenteSolarTipo}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {[...LENTES_SOLAR_TIPOS].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Cor</Label>
                    <Select value={lenteSolarCor} onValueChange={setLenteSolarCor}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione a cor" /></SelectTrigger>
                      <SelectContent>
                        {[...LENTES_SOLAR_CORES].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Base</Label>
                    <Select value={lenteBase} onValueChange={setLenteBase}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione a base" /></SelectTrigger>
                      <SelectContent>
                        {LENTES_BASES.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </fieldset>
              )}

              {isLenteCategory(categoriaAcessorio) && tipoAcessorio === "Receituário" && (
                <fieldset className="space-y-3 rounded-lg border p-3">
                  <legend className="text-sm font-semibold px-1">Lente Receituário</legend>
                  <div>
                    <Label>Índice</Label>
                    <Select value={lenteIndice} onValueChange={setLenteIndice}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione o índice" /></SelectTrigger>
                      <SelectContent>
                        {LENTES_INDICES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-2 block">Tratamentos</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {[...LENTES_TRATAMENTOS].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(t => (
                        <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={lenteTratamentos.includes(t)}
                            onCheckedChange={(checked) => {
                              setLenteTratamentos(prev =>
                                checked ? [...prev, t] : prev.filter(x => x !== t)
                              );
                            }}
                          />
                          {t}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Esférico (+12.00 a -12.00)</Label>
                      <Select value={lenteEsferico} onValueChange={setLenteEsferico}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 97 }, (_, i) => {
                            const val = 12 - i * 0.25;
                            return (val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2));
                          }).map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Cilíndrico (0.00 a -6.00)</Label>
                      <Select value={lenteCilindrico} onValueChange={setLenteCilindrico}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 25 }, (_, i) => {
                            const val = -(i * 0.25);
                            return val.toFixed(2);
                          }).map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Adição (+1.00 a +3.00)</Label>
                      <Select value={lenteAdicao} onValueChange={setLenteAdicao}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 9 }, (_, i) => {
                            const val = 1 + i * 0.25;
                            return `+${val.toFixed(2)}`;
                          }).map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Diâmetro (65mm a 80mm)</Label>
                      <Select value={lenteDiametro} onValueChange={setLenteDiametro}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 16 }, (_, i) => `${65 + i}mm`).map(v => (
                            <SelectItem key={v} value={v}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </fieldset>
              )}

              {isLenteCategory(categoriaAcessorio) && tipoAcessorio === "Blocos" && (
                <fieldset className="space-y-3 rounded-lg border p-3">
                  <legend className="text-sm font-semibold px-1">Bloco</legend>
                  <div>
                    <Label>Índice</Label>
                    <Select value={lenteIndice} onValueChange={setLenteIndice}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione o índice" /></SelectTrigger>
                      <SelectContent>
                        {LENTES_INDICES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-2 block">Tratamentos</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {[...LENTES_TRATAMENTOS].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(t => (
                        <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={lenteTratamentos.includes(t)}
                            onCheckedChange={(checked) => {
                              setLenteTratamentos(prev =>
                                checked ? [...prev, t] : prev.filter(x => x !== t)
                              );
                            }}
                          />
                          {t}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Diâmetro (65mm a 80mm)</Label>
                      <Select value={lenteDiametro} onValueChange={setLenteDiametro}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 16 }, (_, i) => `${65 + i}mm`).map(v => (
                            <SelectItem key={v} value={v}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Base</Label>
                      <Select value={lenteBase} onValueChange={setLenteBase}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {LENTES_BLOCOS_BASES.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </fieldset>
              )}
            </fieldset>
          )}

          {/* Preço, Custo e Quantidade */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="product-price">Preço (R$) *</Label>
              <CurrencyInput id="product-price" value={price} onValueChange={setPrice} placeholder="0,00" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="product-custo">Custo (R$)</Label>
              <CurrencyInput id="product-custo" value={custo} onValueChange={setCusto} placeholder="0,00" className="mt-1.5" />
            </div>
            <div>
              <Label>{isEditing ? "Quantidade em estoque" : "Quantidade a adicionar"}</Label>
              <div className="mt-1.5">
                <Input
                  type="number"
                  min={1}
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  className="w-20 text-center font-semibold tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* Detalhe */}
          <div>
            <Label htmlFor="product-detail">Detalhe (opcional)</Label>
            <Textarea id="product-detail" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Descrição ou observações" className="mt-1.5 min-h-[60px]" />
          </div>

          {/* Filial */}
          <div>
            <Label>Filial *</Label>
            {filialLocked ? (
              <div className="mt-1.5">
                <Input value={`Filial ${selectedFilial}`} disabled className="bg-muted" />
                <p className="text-[11px] text-muted-foreground mt-1">Filial definida pelo contexto atual. Selecione "Todas" para escolher outra.</p>
              </div>
            ) : (
              <Select value={filial} onValueChange={setFilial}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione a filial" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Filial 1</SelectItem>
                  <SelectItem value="2">Filial 2</SelectItem>
                  <SelectItem value="3">Filial 3</SelectItem>
                  {!isEditing && <SelectItem value="all">Todas as Filiais</SelectItem>}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || (!!duplicateInfo && !isEditing)}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {isEditing ? "Salvar" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
