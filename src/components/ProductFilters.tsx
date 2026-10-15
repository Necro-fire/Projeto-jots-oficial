import { useState, useMemo, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Filter, X, Search, Lock, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useFilial } from "@/contexts/FilialContext";
import { cn } from "@/lib/utils";
import { normalizeSearchText } from "@/lib/productSearch";
import {
  CATEGORIAS_IDADE, GENEROS, ESTILOS, TODAS_CORES,
  MATERIAIS_ARO, MATERIAIS_HASTE, TIPOS_LENTE,
  TIPOS_HASTE, PONTES_ARMACAO,
} from "@/data/productConstants";
import { ACESSORIOS_CATEGORIAS, getTiposByCategoria } from "@/data/accessoryConstants";
import {
  applyProductFilters, countActiveFilters, createEmptyFilters, lensTypesOf, splitValues,
  ACCESSORY_FILTER_KEYS, FRAME_FILTER_KEYS,
  type FilterableProduct, type ProductFilterListKey, type ProductFilterValues,
} from "@/lib/productFilterLogic";

export {
  applyProductFilters, getStockLevel, getStockStatus,
  type ProductFilterValues, type StockLevel,
} from "@/lib/productFilterLogic";

// Filtros lembrados por tela enquanto a aba estiver aberta (voltar para Produtos/Estoque mantém a seleção).
const filterMemory = new Map<string, ProductFilterValues>();

export function useProductFilters(memoryKey = "default") {
  const [filters, setFiltersState] = useState<ProductFilterValues>(
    () => filterMemory.get(memoryKey) ?? createEmptyFilters(),
  );
  const setFilters: Dispatch<SetStateAction<ProductFilterValues>> = useCallback((action) => {
    setFiltersState(prev => {
      const next = typeof action === "function" ? action(prev) : action;
      filterMemory.set(memoryKey, next);
      return next;
    });
  }, [memoryKey]);
  return { filters, setFilters };
}

interface OptionItem { value: string; label: string }
type Option = string | OptionItem;

const toItem = (o: Option): OptionItem => (typeof o === "string" ? { value: o, label: o } : o);

/** Opções fixas do cadastro + valores que existem nos produtos (cadastros antigos ou personalizados). */
function mergeOptions(base: readonly string[], present: Iterable<string>): string[] {
  return Array.from(new Set([...base, ...present].filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
}

/**
 * Seleção múltipla: lista de opções marcáveis, aberta dentro da própria janela de filtros.
 * Marcar uma opção a inclui no resultado (produto com qualquer uma das marcadas).
 */
function MultiSelectFilter({ label, values, onChange, options, allLabel = "Todos", disabled }: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: readonly Option[];
  allLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const items = useMemo(() => options.map(toItem), [options]);
  const labelOf = (v: string) => items.find(i => i.value === v)?.label ?? v;
  const shown = useMemo(() => {
    const q = normalizeSearchText(query);
    return items.filter(i => !q || normalizeSearchText(i.label).includes(q));
  }, [items, query]);

  const toggle = (value: string) =>
    onChange(values.includes(value) ? values.filter(v => v !== value) : [...values, value]);

  const summary = values.length === 0
    ? allLabel
    : values.length <= 2
      ? values.map(labelOf).join(", ")
      : `${values.length} selecionados`;

  return (
    <div className="space-y-1">
      <Label className="text-caption">{label}</Label>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={cn("h-8 w-full justify-between px-3 text-sm font-normal", values.length === 0 && "text-muted-foreground")}
      >
        <span className="truncate">{summary}</span>
        <span className="flex items-center gap-1 shrink-0">
          {values.length > 0 && (
            <Badge variant="default" className="h-4 min-w-4 px-1 text-[10px] rounded-full">{values.length}</Badge>
          )}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </span>
      </Button>
      {open && (
        <div className="rounded-md border bg-background p-1">
          {items.length > 8 && (
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar opção..."
              className="h-7 mb-1 text-sm"
            />
          )}
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-[11px] text-muted-foreground">
              {values.length === 0 ? "Marque uma ou mais opções" : `${values.length} marcada${values.length > 1 ? "s" : ""}`}
            </span>
            {values.length > 0 && (
              <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => onChange([])}>
                Limpar seleção
              </button>
            )}
          </div>
          <div className="max-h-44 overflow-y-auto">
            {shown.length === 0 && <p className="px-2 py-2 text-caption text-muted-foreground">Nenhuma opção encontrada</p>}
            {shown.map(item => {
              const checked = values.includes(item.value);
              return (
                <button
                  key={item.value}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggle(item.value)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <span className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                    checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
                  )}>
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const STOCK_STATUS_LABEL: Record<string, string> = {
  normal: "Normal",
  low: "Baixo",
  critical: "Crítico",
  out_of_stock: "Esgotado",
};

const FIELD_LABEL: Partial<Record<ProductFilterListKey, string>> = {
  classificacaoProduto: "Classificação",
  categoriaIdade: "Idade",
  genero: "Gênero",
  estilo: "Estilo",
  corArmacao: "Cor",
  corHaste: "Cor da haste",
  materialAro: "Material aro",
  materialHaste: "Material haste",
  tipoLente: "Lente",
  polarizado: "Polarizado",
  tipoHaste: "Haste",
  ponteArmacao: "Ponte",
  tamanhoArmacao: "Tamanho",
  filterLensSize: "Largura lente",
  filterAlturaLente: "Altura lente",
  filterBridgeSize: "Largura ponte",
  filterTempleSize: "Comp. haste",
  catAcessorio: "Categoria",
  tipoAcessorio: "Tipo",
  corAcessorio: "Cor acessório",
  filial: "Filial",
  stockStatus: "Estoque",
};

const CHIP_ORDER: ProductFilterListKey[] = [
  ...FRAME_FILTER_KEYS, ...ACCESSORY_FILTER_KEYS, "stockStatus", "filial",
];

interface ProductFiltersProps {
  filters: ProductFilterValues;
  onChange: (filters: ProductFilterValues) => void;
  /** Produtos da tela: alimentam as opções disponíveis (medidas, cores, tipos) e a contagem de resultados. */
  products?: FilterableProduct[];
}

export function ProductFilters({ filters, onChange, products = [] }: ProductFiltersProps) {
  const { selectedFilial, filiais } = useFilial();
  const filialLocked = selectedFilial !== "all";
  const [draft, setDraft] = useState<ProductFilterValues>({ ...filters });
  const [open, setOpen] = useState(false);
  const [priceError, setPriceError] = useState("");

  const activeCount = countActiveFilters(filters, { ignoreFilial: filialLocked });
  const showAccessoryFilters = draft.tipoItem === "acessorio" || draft.tipoItem === "all";
  const showFrameFilters = draft.tipoItem === "normal" || draft.tipoItem === "all";

  // Uma filial escolhida no filtro deixa de valer quando a filial global é fixada (a lista já vem filtrada).
  useEffect(() => {
    if (filialLocked && filters.filial.length > 0) onChange({ ...filters, filial: [] });
  }, [filialLocked, filters, onChange]);

  const activeProducts = useMemo(() => products.filter(p => p.status !== "inativo"), [products]);

  // Opções disponíveis: lista fixa do cadastro + o que de fato existe nos produtos.
  const available = useMemo(() => {
    const frames = activeProducts.filter(p => !p.is_acessorio);
    const accessories = activeProducts.filter(p => p.is_acessorio);
    const sizes = new Set<string>();
    const lens = new Set<number>();
    const altura = new Set<number>();
    const bridge = new Set<number>();
    const temple = new Set<number>();
    frames.forEach(p => {
      const l = p.lens_size || 0, b = p.bridge_size || 0, t = p.temple_size || 0;
      if (l > 0 || b > 0 || t > 0) sizes.add(`${l}-${b}-${t}`);
      if (l > 0) lens.add(l);
      if ((p.altura_lente || 0) > 0) altura.add(p.altura_lente as number);
      if (b > 0) bridge.add(b);
      if (t > 0) temple.add(t);
    });
    const nums = (s: Set<number>) => Array.from(s).sort((a, b) => a - b).map(String);
    const flat = (list: FilterableProduct[], get: (p: FilterableProduct) => string[]) =>
      list.flatMap(get);
    return {
      sizes: Array.from(sizes).sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b)),
      lens: nums(lens), altura: nums(altura), bridge: nums(bridge), temple: nums(temple),
      estilos: mergeOptions(ESTILOS, frames.map(p => p.estilo || "")),
      coresArmacao: mergeOptions(TODAS_CORES, flat(frames, p => splitValues(p.cor_armacao))),
      coresHaste: mergeOptions(TODAS_CORES, flat(frames, p => splitValues(p.cor_haste))),
      materiaisAro: mergeOptions(MATERIAIS_ARO, frames.map(p => p.material_aro || "")),
      materiaisHaste: mergeOptions(MATERIAIS_HASTE, frames.map(p => p.material_haste || "")),
      tiposLente: mergeOptions(TIPOS_LENTE, flat(frames, p => lensTypesOf(p.tipo_lente))),
      pontes: mergeOptions(PONTES_ARMACAO, frames.map(p => p.ponte_armacao || "")),
      categoriasAcessorio: mergeOptions(ACESSORIOS_CATEGORIAS.map(c => c.nome), accessories.map(p => p.categoria_acessorio || "")),
      coresAcessorio: mergeOptions(
        ["Nenhuma", ...TODAS_CORES],
        flat(accessories, p => splitValues(p.cor_acessorio)),
      ),
      accessories,
      hasMinStock: activeProducts.some(p => (Number(p.min_stock) || 0) > 0),
    };
  }, [activeProducts]);

  // Tipos de acessório das categorias marcadas (ou todos os existentes quando nenhuma foi marcada).
  const tiposAcessorioFor = useCallback((cats: string[]): string[] => {
    const fromConstants = cats.flatMap(c => getTiposByCategoria(c).map(t => t.nome));
    const fromProducts = available.accessories
      .filter(p => cats.length === 0 || cats.includes(p.categoria_acessorio || ""))
      .map(p => p.tipo_acessorio || "");
    return mergeOptions(fromConstants, fromProducts);
  }, [available.accessories]);

  const tiposAcessorio = useMemo(() => tiposAcessorioFor(draft.catAcessorio), [tiposAcessorioFor, draft.catAcessorio]);

  const stockStatusOptions: OptionItem[] = useMemo(() => {
    const keys = ["normal", "out_of_stock"];
    // Baixo/Crítico dependem do estoque mínimo do produto: só aparecem quando algum produto tem mínimo.
    if (available.hasMinStock || draft.stockStatus.some(s => s === "low" || s === "critical")) keys.splice(1, 0, "low", "critical");
    return keys.map(k => ({ value: k, label: STOCK_STATUS_LABEL[k] }));
  }, [available.hasMinStock, draft.stockStatus]);

  const filialOptions: OptionItem[] = useMemo(
    () => filiais.map(f => ({ value: f.id, label: f.name })),
    [filiais],
  );

  const validate = (d: ProductFilterValues): boolean => {
    if (d.priceMin && d.priceMax && Number(d.priceMin) > Number(d.priceMax)) {
      setPriceError("Valor mínimo não pode ser maior que o máximo");
      return false;
    }
    setPriceError("");
    return true;
  };

  const effectiveDraft = useMemo<ProductFilterValues>(
    () => ({ ...draft, search: filters.search, filial: filialLocked ? [] : draft.filial }),
    [draft, filters.search, filialLocked],
  );

  // Quantos produtos o filtro em edição retornaria (mostrado no botão Aplicar).
  const previewCount = useMemo(
    () => (open && products.length > 0 ? applyProductFilters(products, effectiveDraft).length : null),
    [open, products, effectiveDraft],
  );

  const draftActiveCount = countActiveFilters(effectiveDraft, { ignoreFilial: filialLocked });

  const handleApply = () => {
    if (!validate(draft)) return;
    onChange(effectiveDraft);
    setOpen(false);
  };

  const handleClear = () => {
    const cleared = { ...createEmptyFilters(), search: filters.search };
    setDraft(cleared);
    setPriceError("");
    onChange(cleared);
    setOpen(false);
  };

  const removeChip = (key: ProductFilterListKey, value: string) =>
    onChange({ ...filters, [key]: filters[key].filter(v => v !== value) });

  const setList = (key: ProductFilterListKey) => (values: string[]) =>
    setDraft(d => ({ ...d, [key]: values }));

  const setTipoItem = (tipoItem: string) =>
    setDraft(d => {
      const next = { ...d, tipoItem };
      // Esconder um grupo de campos também limpa o que havia sido marcado nele.
      const reset = tipoItem === "acessorio" ? FRAME_FILTER_KEYS : tipoItem === "normal" ? ACCESSORY_FILTER_KEYS : [];
      reset.forEach(k => { next[k] = []; });
      return next;
    });

  const setCategoriasAcessorio = (cats: string[]) =>
    setDraft(d => {
      const validTipos = new Set(tiposAcessorioFor(cats));
      return { ...d, catAcessorio: cats, tipoAcessorio: d.tipoAcessorio.filter(t => validTipos.has(t)) };
    });

  // Pesquisa rápida (opcional): identifica o produto pelo código digitado/colado/escaneado.
  // O código digitado é sempre preservado no campo, mesmo sem resultado.
  const [quickSearch, setQuickSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastNotified = useRef("");

  useEffect(() => {
    if (!quickSearch) { lastNotified.current = ""; return; }
    const term = filters.search.trim();
    if (term.length < 4) { lastNotified.current = ""; return; }
    const timer = setTimeout(() => {
      if (lastNotified.current === term) return;
      lastNotified.current = term;
      const norm = (v?: string) => (v || "").trim().toLowerCase();
      const t = term.toLowerCase();
      const found = products.find(p =>
        norm(p.barcode) === t || norm(p.code) === t || norm(p.referencia) === t
      );
      if (found) {
        toast.success(`Produto identificado: ${found.model || found.referencia}`);
      } else {
        toast.error(`Nenhum produto encontrado para o código ${term}`);
      }
      searchInputRef.current?.select();
    }, 350);
    return () => clearTimeout(timer);
  }, [filters.search, quickSearch, products]);

  const chips = useMemo(() => {
    const labelFor = (key: ProductFilterListKey, value: string) => {
      if (key === "filial") return filiais.find(f => f.id === value)?.name ?? value;
      if (key === "stockStatus") return STOCK_STATUS_LABEL[value] ?? value;
      return value;
    };
    return CHIP_ORDER
      .filter(key => !(key === "filial" && filialLocked))
      .flatMap(key => filters[key].map(value => ({
        id: `${key}:${value}`,
        text: `${FIELD_LABEL[key]}: ${labelFor(key, value)}`,
        remove: () => removeChip(key, value),
      })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, filiais, filialLocked]);

  const extraChips: { id: string; text: string; remove: () => void }[] = [];
  if (filters.tipoItem !== "all") {
    extraChips.push({
      id: "tipoItem",
      text: filters.tipoItem === "acessorio" ? "Somente acessórios" : "Somente armações",
      remove: () => onChange({ ...filters, tipoItem: "all" }),
    });
  }
  if (filters.priceMin) extraChips.push({ id: "priceMin", text: `Preço ≥ R$ ${filters.priceMin}`, remove: () => onChange({ ...filters, priceMin: "" }) });
  if (filters.priceMax) extraChips.push({ id: "priceMax", text: `Preço ≤ R$ ${filters.priceMax}`, remove: () => onChange({ ...filters, priceMax: "" }) });
  const allChips = [...extraChips, ...chips];

  return (
    <div className="flex flex-wrap gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          placeholder={quickSearch ? "Leia ou digite o código do produto..." : "Buscar por modelo, código, cor ou estilo..."}
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="pl-9 h-9"
        />
      </div>

      <label className="flex items-center gap-2 h-9 px-2 rounded-md border text-caption text-muted-foreground cursor-pointer select-none">
        <Switch checked={quickSearch} onCheckedChange={setQuickSearch} aria-label="Pesquisa rápida" />
        Pesquisa rápida
      </label>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setDraft({ ...filters }); setPriceError(""); } }}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-1.5">
            <Filter className="h-3.5 w-3.5" />
            Filtros
            {activeCount > 0 && (
              <Badge variant="default" className="h-5 w-5 p-0 flex items-center justify-center text-[10px] rounded-full">
                {activeCount}
              </Badge>
            )}
          </Button>
        </DialogTrigger>
        <DialogContent className="w-[30rem] max-w-[95vw] p-0">
          <DialogHeader className="p-4 pb-2 pr-12">
            <DialogTitle className="text-sm font-semibold">
              Filtros
              {draftActiveCount > 0 && (
                <span className="ml-2 text-caption font-normal text-muted-foreground">
                  {draftActiveCount} selecionado{draftActiveCount > 1 ? "s" : ""}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto">
            <div className="p-4 pt-2 space-y-3">
              <div className="space-y-1">
                <Label className="text-caption">Tipo de Item</Label>
                <Select value={draft.tipoItem} onValueChange={setTipoItem}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="normal">Produto Normal</SelectItem>
                    <SelectItem value="acessorio">Acessório</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {showFrameFilters && (
                <>
                  <MultiSelectFilter label="Classificação" allLabel="Todas" values={draft.classificacaoProduto}
                    onChange={setList("classificacaoProduto")} options={["Receituário", "Solar", "Clip-on"]} />

                  <Separator />
                  <p className="text-caption text-muted-foreground font-medium">Armação</p>
                  <div className="grid grid-cols-2 gap-3 items-start">
                    <MultiSelectFilter label="Categoria Idade" allLabel="Todas" values={draft.categoriaIdade}
                      onChange={setList("categoriaIdade")} options={CATEGORIAS_IDADE} />
                    <MultiSelectFilter label="Gênero" values={draft.genero}
                      onChange={setList("genero")} options={GENEROS} />
                  </div>
                  <MultiSelectFilter label="Estilo" values={draft.estilo}
                    onChange={setList("estilo")} options={available.estilos} />
                  <MultiSelectFilter label="Cor da Armação" allLabel="Todas" values={draft.corArmacao}
                    onChange={setList("corArmacao")} options={available.coresArmacao} />
                  <MultiSelectFilter label="Cor da Haste" allLabel="Todas" values={draft.corHaste}
                    onChange={setList("corHaste")} options={available.coresHaste} />
                  <div className="grid grid-cols-2 gap-3 items-start">
                    <MultiSelectFilter label="Material Aro" values={draft.materialAro}
                      onChange={setList("materialAro")} options={available.materiaisAro} />
                    <MultiSelectFilter label="Material Haste" values={draft.materialHaste}
                      onChange={setList("materialHaste")} options={available.materiaisHaste} />
                  </div>
                  <MultiSelectFilter label="Tipo de Lente" values={draft.tipoLente}
                    onChange={setList("tipoLente")} options={available.tiposLente} />
                  <div className="grid grid-cols-2 gap-3 items-start">
                    <MultiSelectFilter label="Polarizado" values={draft.polarizado}
                      onChange={setList("polarizado")} options={["Sim", "Não"]} />
                    <MultiSelectFilter label="Ponte" allLabel="Todas" values={draft.ponteArmacao}
                      onChange={setList("ponteArmacao")} options={available.pontes} />
                  </div>
                  <MultiSelectFilter label="Tipo de Haste" values={draft.tipoHaste}
                    onChange={setList("tipoHaste")} options={["Comum", ...TIPOS_HASTE]} />

                  {(available.sizes.length > 0 || available.lens.length > 0) && (
                    <>
                      <Separator />
                      <p className="text-caption text-muted-foreground font-medium">Medidas (mm)</p>
                      {available.sizes.length > 0 && (
                        <MultiSelectFilter label="Tamanho da Armação (completo)" values={draft.tamanhoArmacao}
                          onChange={setList("tamanhoArmacao")} options={available.sizes} />
                      )}
                      <div className="grid grid-cols-2 gap-3 items-start">
                        {available.lens.length > 0 && (
                          <MultiSelectFilter label="Largura da Lente" values={draft.filterLensSize}
                            onChange={setList("filterLensSize")} options={available.lens} />
                        )}
                        {available.altura.length > 0 && (
                          <MultiSelectFilter label="Altura da Lente" values={draft.filterAlturaLente}
                            onChange={setList("filterAlturaLente")} options={available.altura} />
                        )}
                        {available.bridge.length > 0 && (
                          <MultiSelectFilter label="Largura da Ponte" values={draft.filterBridgeSize}
                            onChange={setList("filterBridgeSize")} options={available.bridge} />
                        )}
                        {available.temple.length > 0 && (
                          <MultiSelectFilter label="Comprimento Haste" values={draft.filterTempleSize}
                            onChange={setList("filterTempleSize")} options={available.temple} />
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {showAccessoryFilters && (
                <>
                  <Separator />
                  <p className="text-caption text-muted-foreground font-medium">Acessório</p>
                  <MultiSelectFilter label="Categoria" allLabel="Todas" values={draft.catAcessorio}
                    onChange={setCategoriasAcessorio} options={available.categoriasAcessorio} />
                  {tiposAcessorio.length > 0 && (
                    <MultiSelectFilter label="Tipo" values={draft.tipoAcessorio}
                      onChange={setList("tipoAcessorio")} options={tiposAcessorio} />
                  )}
                  <MultiSelectFilter label="Cor do Acessório" allLabel="Todas" values={draft.corAcessorio}
                    onChange={setList("corAcessorio")} options={available.coresAcessorio} />
                </>
              )}

              <Separator />
              <p className="text-caption text-muted-foreground font-medium">Estoque</p>
              <div className="grid grid-cols-2 gap-3 items-start">
                {filialLocked ? (
                  <div className="space-y-1">
                    <Label className="text-caption flex items-center gap-1">
                      Filial <Lock className="h-3 w-3 text-muted-foreground" />
                    </Label>
                    <Input value={`Filial ${selectedFilial}`} disabled className="h-8 text-sm bg-muted" />
                    <p className="text-[10px] text-muted-foreground mt-0.5">Use "Todas" para filtrar por filial</p>
                  </div>
                ) : (
                  <MultiSelectFilter label="Filial" allLabel="Todas" values={draft.filial}
                    onChange={setList("filial")} options={filialOptions} />
                )}
                <MultiSelectFilter label="Status Estoque" values={draft.stockStatus}
                  onChange={setList("stockStatus")} options={stockStatusOptions} />
              </div>

              <Separator />
              <div className="space-y-1">
                <Label className="text-caption">Faixa de Preço (R$)</Label>
                <div className="flex gap-2">
                  <CurrencyInput placeholder="Mín" value={draft.priceMin ? Number(draft.priceMin) : 0}
                    onValueChange={(v) => { setDraft(d => ({ ...d, priceMin: v > 0 ? String(v) : "" })); setPriceError(""); }} className="h-8 text-sm" />
                  <CurrencyInput placeholder="Máx" value={draft.priceMax ? Number(draft.priceMax) : 0}
                    onValueChange={(v) => { setDraft(d => ({ ...d, priceMax: v > 0 ? String(v) : "" })); setPriceError(""); }} className="h-8 text-sm" />
                </div>
                {priceError && <p className="text-[11px] text-destructive">{priceError}</p>}
              </div>
            </div>
          </div>

          <div className="flex gap-2 p-4 pt-2 border-t">
            <Button
              variant="outline" size="sm" className="flex-1 h-8 gap-1"
              onClick={handleClear}
              disabled={draftActiveCount === 0 && activeCount === 0}
            >
              <X className="h-3 w-3" />
              Limpar Filtros
            </Button>
            <Button size="sm" className="flex-1 h-8" onClick={handleApply}>
              Aplicar Filtros{previewCount !== null && ` (${previewCount})`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {allChips.length > 0 && (
        <div className="flex basis-full flex-wrap items-center gap-1.5" aria-label="Filtros ativos">
          {allChips.map(chip => (
            <Badge key={chip.id} variant="secondary" className="gap-1 pr-1 text-caption font-normal">
              {chip.text}
              <button
                type="button"
                onClick={chip.remove}
                aria-label={`Remover filtro ${chip.text}`}
                className="rounded-full p-0.5 hover:bg-background/60"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button variant="ghost" size="sm" className="h-6 px-2 text-caption text-muted-foreground" onClick={handleClear}>
            Limpar tudo
          </Button>
        </div>
      )}
    </div>
  );
}
