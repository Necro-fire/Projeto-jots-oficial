import { useState } from "react";
import { Bell, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useStockAlerts, type AlertaEstoque } from "@/hooks/useStockAlerts";
import { useFilial } from "@/contexts/FilialContext";
import { ESTILOS } from "@/data/productConstants";
import {
  ACESSORIOS_CATEGORIAS, getTiposByCategoria, getVariacoesByTipo,
  getCoresByVariacao, hasMaterial, getMateriaisByCategoria,
} from "@/data/accessoryConstants";
import { toast } from "sonner";

export function StockAlertConfigDialog() {
  const { data: alerts, upsert, remove } = useStockAlerts();
  const { selectedFilial } = useFilial();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"list" | "tipo" | "form">("list");
  const [formTipo, setFormTipo] = useState<"produto" | "acessorio">("produto");
  // Product alert
  const [formCategoria, setFormCategoria] = useState("");
  // Accessory alert - hierarchical
  const [formCatAcessorio, setFormCatAcessorio] = useState("");
  const [formTipoAcessorio, setFormTipoAcessorio] = useState("");
  const [formVariacao, setFormVariacao] = useState("");
  const [formCor, setFormCor] = useState("");
  const [formMaterial, setFormMaterial] = useState("");
  const [formMin, setFormMin] = useState("");

  const resetForm = () => {
    setStep("list");
    setFormCategoria("");
    setFormCatAcessorio("");
    setFormTipoAcessorio("");
    setFormVariacao("");
    setFormCor("");
    setFormMaterial("");
    setFormMin("");
  };

  const handleSave = async () => {
    const min = parseInt(formMin, 10);

    if (formTipo === "produto") {
      if (!formCategoria || isNaN(min) || min < 0) {
        toast.error("Preencha todos os campos corretamente");
        return;
      }
      try {
        const filialId = selectedFilial === "all" ? "1" : selectedFilial;
        await upsert({
          tipo: "produto",
          categoria: formCategoria,
          cor: null,
          tipo_acessorio: "",
          variacao_acessorio: "",
          material_acessorio: "",
          quantidade_minima: min,
          filial_id: filialId,
        });
        toast.success("Alerta configurado com sucesso");
        resetForm();
      } catch (e: any) {
        toast.error("Erro ao salvar: " + e.message);
      }
    } else {
      if (!formCatAcessorio || isNaN(min) || min < 0) {
        toast.error("Preencha todos os campos corretamente");
        return;
      }
      try {
        const filialId = selectedFilial === "all" ? "1" : selectedFilial;
        await upsert({
          tipo: "acessorio",
          categoria: formCatAcessorio,
          cor: formCor || null,
          tipo_acessorio: formTipoAcessorio || "",
          variacao_acessorio: formVariacao || "",
          material_acessorio: formMaterial || "",
          quantidade_minima: min,
          filial_id: filialId,
        });
        toast.success("Alerta configurado com sucesso");
        resetForm();
      } catch (e: any) {
        toast.error("Erro ao salvar: " + e.message);
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove(id);
      toast.success("Alerta removido");
    } catch (e: any) {
      toast.error("Erro ao remover: " + e.message);
    }
  };

  const productAlerts = alerts.filter(a => a.tipo === "produto");
  const accessoryAlerts = alerts.filter(a => a.tipo === "acessorio");

  const formatAlertLabel = (a: AlertaEstoque) => {
    const parts = [a.categoria];
    if (a.tipo_acessorio) parts.push(a.tipo_acessorio);
    if (a.variacao_acessorio) parts.push(a.variacao_acessorio);
    if (a.material_acessorio) parts.push(a.material_acessorio);
    if (a.cor && a.cor !== "Nenhuma") parts.push(a.cor);
    return parts.join(" › ");
  };

  // Cascading data
  const tiposAc = getTiposByCategoria(formCatAcessorio);
  const variacoesAc = getVariacoesByTipo(formCatAcessorio, formTipoAcessorio);
  const coresAc = getCoresByVariacao(formCatAcessorio, formTipoAcessorio, formVariacao);
  const materiaisAc = getMateriaisByCategoria(formCatAcessorio);
  const showMat = hasMaterial(formCatAcessorio);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <Bell className="h-3.5 w-3.5" />
          Configurações de Alerta
          {alerts.length > 0 && (
            <Badge variant="default" className="h-5 w-5 p-0 flex items-center justify-center text-[10px] rounded-full">
              {alerts.length}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[480px] max-w-[95vw] p-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="text-sm font-semibold">Configurações de Alerta de Estoque</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[500px]">
          <div className="p-4 pt-2 space-y-4">
            {step === "list" && (
              <>
                {alerts.length > 0 ? (
                  <>
                    {productAlerts.length > 0 && (
                      <>
                        <p className="text-caption text-muted-foreground font-medium">Produtos (Armação)</p>
                        <div className="space-y-1">
                          {productAlerts.map(a => (
                            <div key={a.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-secondary/30">
                              <div>
                                <p className="text-ui font-medium">{a.categoria}</p>
                                <p className="text-caption text-muted-foreground">mín: {a.quantidade_minima} un.</p>
                              </div>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(a.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    {accessoryAlerts.length > 0 && (
                      <>
                        <p className="text-caption text-muted-foreground font-medium">Acessórios</p>
                        <div className="space-y-1">
                          {accessoryAlerts.map(a => (
                            <div key={a.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-secondary/30">
                              <div>
                                <p className="text-ui font-medium">{formatAlertLabel(a)}</p>
                                <p className="text-caption text-muted-foreground">mín: {a.quantidade_minima} un.</p>
                              </div>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(a.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    <Separator />
                  </>
                ) : (
                  <p className="text-ui text-muted-foreground text-center py-4">Nenhum alerta configurado</p>
                )}

                <Button variant="outline" className="w-full gap-2" onClick={() => setStep("tipo")}>
                  <Plus className="h-4 w-4" />
                  Novo Alerta
                </Button>
              </>
            )}

            {step === "tipo" && (
              <div className="space-y-3">
                <p className="text-ui font-medium">Tipo de alerta:</p>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="h-20 flex flex-col gap-1"
                    onClick={() => { setFormTipo("produto"); setStep("form"); }}
                  >
                    <span className="text-ui font-semibold">Produto</span>
                    <span className="text-caption text-muted-foreground">Óculos / Armação</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-20 flex flex-col gap-1"
                    onClick={() => { setFormTipo("acessorio"); setStep("form"); }}
                  >
                    <span className="text-ui font-semibold">Acessório</span>
                    <span className="text-caption text-muted-foreground">Estojos, Cordões, etc.</span>
                  </Button>
                </div>
                <Button variant="ghost" size="sm" onClick={resetForm}>← Voltar</Button>
              </div>
            )}

            {step === "form" && formTipo === "produto" && (
              <div className="space-y-3">
                <p className="text-ui font-medium">Alerta de Produto (Armação)</p>
                <div className="space-y-1">
                  <Label className="text-caption">Estilo</Label>
                  <Select value={formCategoria} onValueChange={setFormCategoria}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Selecione o estilo" />
                    </SelectTrigger>
                    <SelectContent>
                      {[...ESTILOS].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-caption">Quantidade mínima para alerta</Label>
                  <Input type="number" min="0" placeholder="Ex: 40" value={formMin} onChange={(e) => setFormMin(e.target.value)} className="h-9" />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={() => setStep("tipo")}>← Voltar</Button>
                  <Button size="sm" className="flex-1" onClick={handleSave}>Salvar Alerta</Button>
                </div>
              </div>
            )}

            {step === "form" && formTipo === "acessorio" && (
              <div className="space-y-3">
                <p className="text-ui font-medium">Alerta de Acessório</p>

                {/* Categoria */}
                <div className="space-y-1">
                  <Label className="text-caption">Categoria *</Label>
                  <Select value={formCatAcessorio} onValueChange={(v) => {
                    setFormCatAcessorio(v);
                    setFormTipoAcessorio("");
                    setFormVariacao("");
                    setFormCor("");
                    setFormMaterial("");
                  }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {[...ACESSORIOS_CATEGORIAS].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(c => <SelectItem key={c.nome} value={c.nome}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Tipo */}
                {formCatAcessorio && tiposAc.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-caption">Tipo (opcional)</Label>
                    <Select value={formTipoAcessorio || "__all__"} onValueChange={(v) => {
                      setFormTipoAcessorio(v === "__all__" ? "" : v);
                      setFormVariacao("");
                      setFormCor("");
                    }}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos os tipos" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todos os tipos</SelectItem>
                        {[...tiposAc].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(t => <SelectItem key={t.nome} value={t.nome}>{t.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Variação */}
                {formTipoAcessorio && variacoesAc.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-caption">Variação (opcional)</Label>
                    <Select value={formVariacao || "__all__"} onValueChange={(v) => {
                      setFormVariacao(v === "__all__" ? "" : v);
                      setFormCor("");
                    }}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todas as variações" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todas as variações</SelectItem>
                        {[...variacoesAc].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(v => <SelectItem key={v.nome} value={v.nome}>{v.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Material (Estojos) */}
                {showMat && materiaisAc.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-caption">Material (opcional)</Label>
                    <Select value={formMaterial || "__all__"} onValueChange={(v) => setFormMaterial(v === "__all__" ? "" : v)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos os materiais" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todos os materiais</SelectItem>
                        {[...materiaisAc].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Cor */}
                {formVariacao && coresAc.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-caption">Cor (opcional)</Label>
                    <Select value={formCor || "__all__"} onValueChange={(v) => setFormCor(v === "__all__" ? "" : v)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todas as cores" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todas as cores</SelectItem>
                        {[...coresAc].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-caption">Quantidade mínima para alerta</Label>
                  <Input type="number" min="0" placeholder="Ex: 40" value={formMin} onChange={(e) => setFormMin(e.target.value)} className="h-9" />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={() => setStep("tipo")}>← Voltar</Button>
                  <Button size="sm" className="flex-1" onClick={handleSave}>Salvar Alerta</Button>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
