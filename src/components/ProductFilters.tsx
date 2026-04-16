import { useState, useMemo } from "react";
import { matchesProductSearch } from "@/lib/productSearch";
import { Filter, X, Search, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useFilial } from "@/contexts/FilialContext";
import {
  CATEGORIAS_IDADE, GENEROS, ESTILOS, TODAS_CORES,
  MATERIAIS_ARO, MATERIAIS_HASTE, TIPOS_LENTE,
  TIPOS_HASTE, PONTES_ARMACAO,
  CATEGORIAS_IDADE_LABEL, GENEROS_LABEL,
} from "@/data/productConstants";
import { ACESSORIOS_CATEGORIAS, getTiposByCategoria } from "@/data/accessoryConstants";

export type StockLevel = "normal" | "low" | "critical" | "out_of_stock";

export interface ProductFilterValues {
  search: string;
  tipoItem: string;
  classificacaoProduto: string;
  categoriaIdade: string;
  genero: string;
  estilo: string;
  corArmacao: string;
  materialAro: string;
  materialHaste: string;
  tipoLente: string;
  polarizado: string;
  tipoHaste: string;
  ponteArmacao: string;
  tamanhoArmacao: string;
  filterLensSize: string;
  filterAlturaLente: string;
  filterBridgeSize: string;
  filterTempleSize: string;
  // Accessory hierarchical filters
  catAcessorio: string;
  tipoAcessorio: string;
  corAcessorio: string;
  priceMin: string;
  priceMax: string;
  filial: string;
  stockStatus: string;
}

const emptyFilters: ProductFilterValues = {
  search: "",
  tipoItem: "all",
  classificacaoProduto: "all",
  categoriaIdade: "all",
  genero: "all",
  estilo: "all",
  corArmacao: "all",
  materialAro: "all",
  materialHaste: "all",
  tipoLente: "all",
  polarizado: "all",
  tipoHaste: "all",
  ponteArmacao: "all",
  tamanhoArmacao: "all",
  filterLensSize: "all",
  filterAlturaLente: "all",
  filterBridgeSize: "all",
  filterTempleSize: "all",
  catAcessorio: "all",
  tipoAcessorio: "all",
  corAcessorio: "all",
  priceMin: "",
  priceMax: "",
  filial: "all",
  stockStatus: "all",
};

export function useProductFilters() {
  const [filters, setFilters] = useState<ProductFilterValues>({ ...emptyFilters });
  return { filters, setFilters };
}


/**
 * Stock level: out_of_stock if 0, normal otherwise.
 */
export function getStockLevel(stock: number, categoryMin: number): StockLevel {
  if (stock === 0) return "out_of_stock";
  return "normal";
}

/** Legacy compat */
export function getStockStatus(stock: number, minStock?: number): "in_stock" | "low_stock" | "out_of_stock" {
  const level = getStockLevel(stock, minStock ?? 0);
  if (level === "out_of_stock") return "out_of_stock";
  if (level === "critical" || level === "low") return "low_stock";
  return "in_stock";
}

export function applyProductFilters<T extends {
  model: string; code: string; color: string; stock: number; min_stock: number;
  retail_price: number; filial_id: string; status: string; is_acessorio: boolean;
  categoria_idade: string; genero: string; estilo: string; cor_armacao: string;
  material: string; material_aro: string; material_haste: string; tipo_lente: string;
}>(
  products: T[],
  filters: ProductFilterValues,
): T[] {
  return products.filter(p => {
    if (p.status === "inativo") return false;

    if (filters.search) {
      if (!matchesProductSearch(p as any, filters.search)) return false;
    }

    if (filters.tipoItem === "normal" && p.is_acessorio) return false;
    if (filters.tipoItem === "acessorio" && !p.is_acessorio) return false;
    if (filters.classificacaoProduto !== "all") {
      const pCat = (p as any).category || "";
      if (pCat !== filters.classificacaoProduto) return false;
    }

    if (filters.categoriaIdade !== "all" && p.categoria_idade !== filters.categoriaIdade) return false;
    if (filters.genero !== "all") {
      if (filters.genero === "Unissex") {
        if (p.genero !== "Unissex") return false;
      } else {
        if (p.genero !== filters.genero && p.genero !== "Unissex") return false;
      }
    }
    if (filters.estilo !== "all" && p.estilo !== filters.estilo) return false;
    if (filters.corArmacao !== "all" && p.cor_armacao !== filters.corArmacao) return false;
    
    if (filters.materialAro !== "all" && p.material_aro !== filters.materialAro) return false;
    if (filters.materialHaste !== "all" && p.material_haste !== filters.materialHaste) return false;
    if (filters.tipoLente !== "all" && p.tipo_lente !== filters.tipoLente) return false;
    if (filters.polarizado !== "all" && (p as any).polarizado !== filters.polarizado) return false;
    if (filters.tipoHaste !== "all" && (p as any).tipo_haste !== filters.tipoHaste) return false;
    if (filters.ponteArmacao !== "all" && (p as any).ponte_armacao !== filters.ponteArmacao) return false;
    if (filters.tamanhoArmacao !== "all" && !p.is_acessorio) {
      const size = `${(p as any).lens_size || 0}-${(p as any).bridge_size || 0}-${(p as any).temple_size || 0}`;
      if (size !== filters.tamanhoArmacao) return false;
    }
    if (filters.filterLensSize !== "all" && !p.is_acessorio) {
      if (String((p as any).lens_size || 0) !== filters.filterLensSize) return false;
    }
    if (filters.filterAlturaLente !== "all" && !p.is_acessorio) {
      if (String((p as any).altura_lente || 0) !== filters.filterAlturaLente) return false;
    }
    if (filters.filterBridgeSize !== "all" && !p.is_acessorio) {
      if (String((p as any).bridge_size || 0) !== filters.filterBridgeSize) return false;
    }
    if (filters.filterTempleSize !== "all" && !p.is_acessorio) {
      if (String((p as any).temple_size || 0) !== filters.filterTempleSize) return false;
    }

    // Accessory hierarchical filters
    if (filters.catAcessorio !== "all") {
      const pCat = (p as any).categoria_acessorio || "";
      if (pCat !== filters.catAcessorio) return false;
    }
    if (filters.tipoAcessorio !== "all") {
      const pTipo = (p as any).tipo_acessorio || "";
      if (pTipo !== filters.tipoAcessorio) return false;
    }
    if (filters.corAcessorio !== "all") {
      const pCor = (p as any).cor_acessorio || "";
      if (filters.corAcessorio === "Nenhuma") {
        if (pCor && pCor !== "" && pCor !== "Nenhuma") return false;
      } else {
        if (pCor !== filters.corAcessorio) return false;
      }
    }

    if (filters.filial !== "all" && p.filial_id !== filters.filial) return false;

    if (filters.stockStatus !== "all") {
      const level = getStockLevel(p.stock, p.min_stock || 0);
      if (filters.stockStatus === "normal" && level !== "normal") return false;
      if (filters.stockStatus === "low" && level !== "low") return false;
      if (filters.stockStatus === "critical" && level !== "critical") return false;
      if (filters.stockStatus === "out_of_stock" && level !== "out_of_stock") return false;
    }

    if (filters.priceMin && Number(p.retail_price) < Number(filters.priceMin)) return false;
    if (filters.priceMax && Number(p.retail_price) > Number(filters.priceMax)) return false;
    return true;
  });
}

function FilterSelect({ label, value, onValueChange, options, allLabel = "Todos" }: {
  label: string; value: string; onValueChange: (v: string) => void;
  options: readonly string[] | string[]; allLabel?: string;
}) {
  const sorted = [...options].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return (
    <div className="space-y-1">
      <Label className="text-caption">{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {sorted.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ProductFilters({ filters, onChange, products = [] }: ProductFiltersProps) {
  const { selectedFilial, filiais } = useFilial();
  const filialLocked = selectedFilial !== "all";
  const [draft, setDraft] = useState<ProductFilterValues>({ ...filters });
  const [open, setOpen] = useState(false);
  const [priceError, setPriceError] = useState("");

  const countActive = (f: ProductFilterValues) => {
    const keys: (keyof ProductFilterValues)[] = [
      "tipoItem", "classificacaoProduto", "categoriaIdade", "genero", "estilo", "corArmacao",
      "materialAro", "materialHaste", "tipoLente", "polarizado", "tipoHaste", "ponteArmacao",
      "tamanhoArmacao", "filterLensSize", "filterAlturaLente", "filterBridgeSize", "filterTempleSize",
      "catAcessorio", "tipoAcessorio", "corAcessorio",
      "filial", "stockStatus",
    ];
    let count = keys.filter(k => f[k] !== "all").length;
    if (f.priceMin) count++;
    if (f.priceMax) count++;
    return count;
  };

  const activeCount = countActive(filters);
  const showAccessoryFilters = draft.tipoItem === "acessorio" || draft.tipoItem === "all";
  const showFrameFilters = draft.tipoItem === "normal" || draft.tipoItem === "all";

  // Cascading types for accessory filter
  const tiposAcFiltro = draft.catAcessorio !== "all" ? getTiposByCategoria(draft.catAcessorio) : [];

  // Available frame sizes from products (only non-accessories with valid sizes)
  const availableSizes = useMemo(() => {
    const sizeSet = new Set<string>();
    products.filter(p => !p.is_acessorio && p.status !== "inativo").forEach(p => {
      if (p.lens_size > 0 || p.bridge_size > 0 || p.temple_size > 0) {
        sizeSet.add(`${p.lens_size}-${p.bridge_size}-${p.temple_size}`);
      }
    });
    return Array.from(sizeSet).sort((a, b) => {
      const [la] = a.split("-").map(Number);
      const [lb] = b.split("-").map(Number);
      return la - lb;
    });
  }, [products]);

  // Individual dimension values from products
  const availableDimensions = useMemo(() => {
    const active = products.filter(p => !p.is_acessorio && p.status !== "inativo");
    const lens = new Set<number>();
    const altura = new Set<number>();
    const bridge = new Set<number>();
    const temple = new Set<number>();
    active.forEach(p => {
      if ((p as any).lens_size > 0) lens.add((p as any).lens_size);
      if ((p as any).altura_lente > 0) altura.add((p as any).altura_lente);
      if ((p as any).bridge_size > 0) bridge.add((p as any).bridge_size);
      if ((p as any).temple_size > 0) temple.add((p as any).temple_size);
    });
    const toSorted = (s: Set<number>) => Array.from(s).sort((a, b) => a - b).map(String);
    return {
      lens: toSorted(lens),
      altura: toSorted(altura),
      bridge: toSorted(bridge),
      temple: toSorted(temple),
    };
  }, [products]);

  const validatePrice = (d: ProductFilterValues): boolean => {
    if (d.priceMin && d.priceMax && Number(d.priceMin) > Number(d.priceMax)) {
      setPriceError("Valor mínimo não pode ser maior que o máximo");
      return false;
    }
    setPriceError("");
    return true;
  };

  const handleApply = () => {
    if (!validatePrice(draft)) return;
    onChange({ ...draft, search: filters.search });
    setOpen(false);
  };

  const handleClear = () => {
    const cleared = { ...emptyFilters, search: filters.search };
    setDraft(cleared);
    setPriceError("");
    onChange(cleared);
    setOpen(false);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por modelo, código ou cor..."
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="pl-9 h-9"
        />
      </div>

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
        <DialogContent className="w-96 max-w-[95vw] p-0">
          <DialogHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-sm font-semibold">Filtros</DialogTitle>
              {activeCount > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-caption text-muted-foreground gap-1" onClick={handleClear}>
                  <X className="h-3 w-3" />
                  Limpar
                </Button>
              )}
            </div>
          </DialogHeader>

          <ScrollArea className="max-h-[460px]">
            <div className="p-4 pt-2 space-y-3">
              <div className="space-y-1">
                <Label className="text-caption">Tipo de Item</Label>
                <Select value={draft.tipoItem} onValueChange={(v) => setDraft({ ...draft, tipoItem: v, classificacaoProduto: "all" })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="normal">Produto Normal</SelectItem>
                    <SelectItem value="acessorio">Acessório</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(draft.tipoItem === "normal" || draft.tipoItem === "all") && (
                <div className="space-y-1">
                  <Label className="text-caption">Classificação</Label>
                  <Select value={draft.classificacaoProduto} onValueChange={(v) => setDraft({ ...draft, classificacaoProduto: v })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="Receituário">Receituário</SelectItem>
                      <SelectItem value="Solar">Solar</SelectItem>
                      <SelectItem value="Clip-on">Clip-on</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {showFrameFilters && (
                <>
                  <Separator />
                  <p className="text-caption text-muted-foreground font-medium">Armação</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FilterSelect label="Categoria Idade" value={draft.categoriaIdade}
                      onValueChange={(v) => setDraft({ ...draft, categoriaIdade: v })} options={CATEGORIAS_IDADE} allLabel="Todas" />
                    <FilterSelect label="Gênero" value={draft.genero}
                      onValueChange={(v) => setDraft({ ...draft, genero: v })} options={GENEROS} />
                  </div>
                  <FilterSelect label="Estilo" value={draft.estilo}
                    onValueChange={(v) => setDraft({ ...draft, estilo: v })} options={ESTILOS} />
                  <FilterSelect label="Cor da Armação" value={draft.corArmacao}
                    onValueChange={(v) => setDraft({ ...draft, corArmacao: v })} options={TODAS_CORES} allLabel="Todas" />
                  <div className="grid grid-cols-2 gap-3">
                    <FilterSelect label="Material Aro" value={draft.materialAro}
                      onValueChange={(v) => setDraft({ ...draft, materialAro: v })} options={MATERIAIS_ARO} />
                    <FilterSelect label="Material Haste" value={draft.materialHaste}
                      onValueChange={(v) => setDraft({ ...draft, materialHaste: v })} options={MATERIAIS_HASTE} />
                  </div>
                  <FilterSelect label="Tipo de Lente" value={draft.tipoLente}
                    onValueChange={(v) => setDraft({ ...draft, tipoLente: v })} options={TIPOS_LENTE} />
                  <div className="grid grid-cols-2 gap-3">
                    <FilterSelect label="Polarizado" value={draft.polarizado}
                      onValueChange={(v) => setDraft({ ...draft, polarizado: v })} options={["Não", "Sim"]} />
                    <FilterSelect label="Ponte" value={draft.ponteArmacao}
                      onValueChange={(v) => setDraft({ ...draft, ponteArmacao: v })} options={[...PONTES_ARMACAO].sort((a, b) => a.localeCompare(b, 'pt-BR'))} allLabel="Todas" />
                  </div>
                  <FilterSelect label="Tipo de Haste" value={draft.tipoHaste}
                    onValueChange={(v) => setDraft({ ...draft, tipoHaste: v })} options={["Comum", ...TIPOS_HASTE]} />
                  <Separator />
                  <p className="text-caption text-muted-foreground font-medium">Medidas (mm)</p>
                  {availableSizes.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-caption">Tamanho da Armação (completo)</Label>
                      <Select value={draft.tamanhoArmacao} onValueChange={(v) => setDraft({ ...draft, tamanhoArmacao: v })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          {availableSizes.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {availableDimensions.lens.length > 0 && (
                      <FilterSelect label="Largura da Lente" value={draft.filterLensSize}
                        onValueChange={(v) => setDraft({ ...draft, filterLensSize: v })} options={availableDimensions.lens} />
                    )}
                    {availableDimensions.altura.length > 0 && (
                      <FilterSelect label="Altura da Lente" value={draft.filterAlturaLente}
                        onValueChange={(v) => setDraft({ ...draft, filterAlturaLente: v })} options={availableDimensions.altura} />
                    )}
                    {availableDimensions.bridge.length > 0 && (
                      <FilterSelect label="Largura da Ponte" value={draft.filterBridgeSize}
                        onValueChange={(v) => setDraft({ ...draft, filterBridgeSize: v })} options={availableDimensions.bridge} />
                    )}
                    {availableDimensions.temple.length > 0 && (
                      <FilterSelect label="Comprimento Haste" value={draft.filterTempleSize}
                        onValueChange={(v) => setDraft({ ...draft, filterTempleSize: v })} options={availableDimensions.temple} />
                    )}
                  </div>
                </>
              )}

              {showAccessoryFilters && (
                <>
                  <Separator />
                  <p className="text-caption text-muted-foreground font-medium">Acessório</p>
                  <FilterSelect
                    label="Categoria"
                    value={draft.catAcessorio}
                    onValueChange={(v) => setDraft({ ...draft, catAcessorio: v, tipoAcessorio: "all", corAcessorio: "all" })}
                    options={[...ACESSORIOS_CATEGORIAS].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(c => c.nome)}
                    allLabel="Todas"
                  />
                  {tiposAcFiltro.length > 0 && (
                    <FilterSelect
                      label="Tipo"
                      value={draft.tipoAcessorio}
                      onValueChange={(v) => setDraft({ ...draft, tipoAcessorio: v })}
                      options={tiposAcFiltro.map(t => t.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'))}
                    />
                  )}
                  <div className="space-y-1">
                    <Label className="text-caption">Cor do Acessório</Label>
                    <Select value={draft.corAcessorio} onValueChange={(v) => setDraft({ ...draft, corAcessorio: v })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Todas" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="Nenhuma">Nenhuma</SelectItem>
                        {TODAS_CORES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <Separator />
              <p className="text-caption text-muted-foreground font-medium">Estoque</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-caption flex items-center gap-1">
                    Filial
                    {filialLocked && <Lock className="h-3 w-3 text-muted-foreground" />}
                  </Label>
                  {filialLocked ? (
                    <div>
                      <Input value={`Filial ${selectedFilial}`} disabled className="h-8 text-sm bg-muted" />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Use "Todas" para filtrar por filial</p>
                    </div>
                  ) : (
                    <Select value={draft.filial} onValueChange={(v) => setDraft({ ...draft, filial: v })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Todas" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {filiais.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-caption">Status Estoque</Label>
                  <Select value={draft.stockStatus} onValueChange={(v) => setDraft({ ...draft, stockStatus: v })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="normal">Normal ✓</SelectItem>
                      <SelectItem value="low">Baixo ⚠</SelectItem>
                      <SelectItem value="critical">Crítico 🟠</SelectItem>
                      <SelectItem value="out_of_stock">Esgotado 🔴</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />
              <div className="space-y-1">
                <Label className="text-caption">Faixa de Preço (R$)</Label>
                <div className="flex gap-2">
                  <CurrencyInput placeholder="Mín" value={draft.priceMin ? Number(draft.priceMin) : 0}
                    onValueChange={(v) => { setDraft({ ...draft, priceMin: v > 0 ? String(v) : "" }); setPriceError(""); }} className="h-8 text-sm" />
                  <CurrencyInput placeholder="Máx" value={draft.priceMax ? Number(draft.priceMax) : 0}
                    onValueChange={(v) => { setDraft({ ...draft, priceMax: v > 0 ? String(v) : "" }); setPriceError(""); }} className="h-8 text-sm" />
                </div>
                {priceError && <p className="text-[11px] text-destructive">{priceError}</p>}
              </div>
            </div>
          </ScrollArea>

          <div className="flex gap-2 p-4 pt-2 border-t">
            <Button variant="outline" size="sm" className="flex-1 h-8" onClick={handleClear}>Limpar Filtros</Button>
            <Button size="sm" className="flex-1 h-8" onClick={handleApply}>Aplicar Filtros</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ProductFiltersProps {
  filters: ProductFilterValues;
  onChange: (filters: ProductFilterValues) => void;
  products?: { lens_size: number; bridge_size: number; temple_size: number; altura_lente?: number; is_acessorio: boolean; status: string }[];
}
