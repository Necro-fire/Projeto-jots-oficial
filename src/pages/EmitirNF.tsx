import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FilePlus, Upload, FileText, AlertTriangle, Info, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { FilialSelector } from "@/components/FilialSelector";
import { useFilial } from "@/contexts/FilialContext";
import { useVendas, useClients } from "@/hooks/useSupabaseData";
import { useNotasFiscais } from "@/hooks/useNotasFiscais";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { maskCnpj, maskCpfCnpj, maskCurrency, parseCurrency, maskDate, parseDateToISO, unmask } from "@/lib/masks";

export default function EmitirNF() {
  const navigate = useNavigate();
  const { selectedFilial } = useFilial();
  const { data: allSales } = useVendas();
  const { data: clients } = useClients();
  const { create: createNF, data: notasExistentes } = useNotasFiscais();

  const [numero, setNumero] = useState("");
  const [chaveAcesso, setChaveAcesso] = useState("");
  const [dataEmissao, setDataEmissao] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [tipoOperacao, setTipoOperacao] = useState("saida");
  const [clientName, setClientName] = useState("");
  const [clientCnpj, setClientCnpj] = useState("");
  const [fornecedorNome, setFornecedorNome] = useState("");
  const [fornecedorCnpj, setFornecedorCnpj] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [selectedSaleId, setSelectedSaleId] = useState("");
  const [saleSearch, setSaleSearch] = useState("");
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const isAllFiliais = selectedFilial === "all";

  const vendasComNF = useMemo(() => {
    return new Set(
      notasExistentes
        .filter(nf => nf.status !== "cancelada" && nf.venda_id)
        .map(nf => nf.venda_id)
    );
  }, [notasExistentes]);

  const nfExistenteNumero = useMemo(() => {
    if (!numero) return false;
    return notasExistentes.some(
      nf => nf.numero === Number(numero) && nf.status !== "cancelada"
    );
  }, [notasExistentes, numero]);

  const availableSales = useMemo(() => {
    if (isAllFiliais) return [];
    let sales = allSales.filter(s =>
      s.status === "concluida" && s.filial_id === selectedFilial
    );
    if (saleSearch.trim()) {
      const q = saleSearch.trim().toLowerCase();
      sales = sales.filter(s =>
        (s.sale_code || '').toLowerCase().includes(q) ||
        String(s.number).includes(q) ||
        s.client_name.toLowerCase().includes(q)
      );
    }
    return sales;
  }, [allSales, selectedFilial, isAllFiliais, saleSearch]);

  const sale = allSales.find(s => s.id === selectedSaleId);
  const vendaJaTemNF = selectedSaleId ? vendasComNF.has(selectedSaleId) : false;

  const clientData = useMemo(() => {
    if (!sale?.client_id) return null;
    return clients.find(c => c.id === sale.client_id) || null;
  }, [sale, clients]);

  const handleSelectSale = (saleId: string) => {
    setSelectedSaleId(saleId);
    const s = allSales.find(v => v.id === saleId);
    if (s) {
      setClientName(s.client_name);
      // Format value as masked currency (cents)
      const cents = Math.round(Number(s.total) * 100);
      setValorTotal(maskCurrency(cents.toString()));
      const c = clients.find(cl => cl.id === s.client_id);
      const doc = c?.cnpj || c?.cpf || "";
      setClientCnpj(doc ? maskCpfCnpj(doc) : "");
    }
  };

  const uploadFile = async (file: File, folder: string): Promise<string> => {
    const { uploadToPrivateBucket } = await import('@/lib/storageUtils');
    return uploadToPrivateBucket(file, 'nfe-files', folder);
  };

  const handleSave = async () => {
    if (!numero.trim()) { toast.error("Informe o número da NF-e"); return; }
    if (!chaveAcesso.trim()) { toast.error("Informe a chave de acesso"); return; }
    if (unmask(chaveAcesso).length !== 44) { toast.error("Chave de acesso deve ter 44 dígitos"); return; }
    if (nfExistenteNumero) { toast.error("Já existe uma NF-e com esse número"); return; }
    if (!selectedSaleId) { toast.error("Vincule a NF-e a uma venda"); return; }
    if (vendaJaTemNF) { toast.error("Esta venda já possui uma NF-e vinculada"); return; }
    if (isAllFiliais) { toast.error("Selecione uma filial específica"); return; }

    // Validate date if provided
    if (dataEmissao) {
      const iso = parseDateToISO(dataEmissao);
      if (!iso) { toast.error("Data inválida. Use o formato DD/MM/AAAA"); return; }
    }

    // Validate CNPJ fields
    if (tipoOperacao === "entrada" && fornecedorCnpj && unmask(fornecedorCnpj).length !== 14) {
      toast.error("CNPJ do fornecedor incompleto"); return;
    }
    if (tipoOperacao === "saida" && clientCnpj) {
      const docLen = unmask(clientCnpj).length;
      if (docLen !== 11 && docLen !== 14) { toast.error("CPF/CNPJ do cliente incompleto"); return; }
    }

    setSaving(true);
    try {
      let xmlUrl = "";
      let pdfUrl = "";

      if (xmlFile) xmlUrl = await uploadFile(xmlFile, "xml");
      if (pdfFile) pdfUrl = await uploadFile(pdfFile, "pdf");

      const isoDate = dataEmissao ? parseDateToISO(dataEmissao) : "";

      await createNF({
        numero: Number(numero),
        filial_id: selectedFilial,
        venda_id: selectedSaleId,
        empresa_id: null,
        client_name: clientName,
        client_cnpj: unmask(clientCnpj),
        valor_total: parseCurrency(valorTotal) || 0,
        status: "autorizada",
        chave_acesso: unmask(chaveAcesso),
        data_emissao: isoDate ? new Date(isoDate).toISOString() : new Date().toISOString(),
        tipo_operacao: tipoOperacao,
        observacoes: observacoes.trim(),
        xml_url: xmlUrl,
        pdf_url: pdfUrl,
        fornecedor_nome: fornecedorNome.trim(),
        fornecedor_cnpj: unmask(fornecedorCnpj),
      });
      toast.success("NF-e cadastrada com sucesso!");
      navigate("/notas-fiscais");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err.message || "Erro desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <FilialSelector hideAll />
      <div className="p-4 space-y-4 max-w-3xl">
        <div>
          <h1 className="text-title font-semibold tracking-tighter">Adicionar NF-e</h1>
          <p className="text-ui text-muted-foreground">Cadastre manualmente uma nota fiscal gerada por outro sistema</p>
        </div>

        {isAllFiliais && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Selecione uma filial específica.</AlertDescription>
          </Alert>
        )}

        {!isAllFiliais && (
          <>
            {/* Vincular Venda */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-ui flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Vincular à Venda
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar venda por código ou cliente..."
                    value={saleSearch}
                    onChange={e => setSaleSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                <Select value={selectedSaleId} onValueChange={handleSelectSale}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecionar venda..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSales.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.sale_code || `#${s.number}`} — {s.client_name} — R$ {Number(s.total).toFixed(2)}
                        {vendasComNF.has(s.id) ? " ⚠️ Já possui NF-e" : ""}
                      </SelectItem>
                    ))}
                    {availableSales.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">Nenhuma venda encontrada</div>
                    )}
                  </SelectContent>
                </Select>
                {vendaJaTemNF && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>Esta venda já possui uma NF-e vinculada.</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Dados da NF-e */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-ui">Dados da NF-e</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Número da NF-e *</Label>
                    <Input
                      value={numero}
                      onChange={e => setNumero(e.target.value.replace(/\D/g, ""))}
                      placeholder="Nº da nota"
                      className="h-9"
                      inputMode="numeric"
                    />
                    {nfExistenteNumero && (
                      <p className="text-xs text-destructive">NF-e já cadastrada com esse número</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo de Operação</Label>
                    <Select value={tipoOperacao} onValueChange={setTipoOperacao}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entrada">Entrada</SelectItem>
                        <SelectItem value="saida">Saída</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Chave de Acesso *</Label>
                  <Input
                    value={chaveAcesso}
                    onChange={e => setChaveAcesso(e.target.value.replace(/\D/g, "").slice(0, 44))}
                    placeholder="44 dígitos da chave de acesso"
                    className="h-9 font-mono text-xs"
                    maxLength={44}
                    inputMode="numeric"
                  />
                  <p className="text-xs text-muted-foreground">{unmask(chaveAcesso).length}/44 dígitos</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Data da Nota</Label>
                    <Input
                      value={dataEmissao}
                      onChange={e => setDataEmissao(maskDate(e.target.value))}
                      placeholder="DD/MM/AAAA"
                      className="h-9"
                      maxLength={10}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Valor Total (R$)</Label>
                    <Input
                      value={valorTotal}
                      onChange={e => setValorTotal(maskCurrency(e.target.value))}
                      placeholder="0,00"
                      className="h-9"
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cliente / Fornecedor */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-ui">
                  {tipoOperacao === "entrada" ? "Fornecedor" : "Cliente / Destinatário"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {tipoOperacao === "entrada" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Nome do Fornecedor</Label>
                      <Input value={fornecedorNome} onChange={e => setFornecedorNome(e.target.value)} className="h-9" placeholder="Razão social" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">CNPJ do Fornecedor</Label>
                      <Input
                        value={fornecedorCnpj}
                        onChange={e => setFornecedorCnpj(maskCnpj(e.target.value))}
                        className="h-9"
                        placeholder="00.000.000/0000-00"
                        maxLength={18}
                        inputMode="numeric"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Nome do Cliente</Label>
                      <Input value={clientName} onChange={e => setClientName(e.target.value)} className="h-9" placeholder="Nome" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">CPF/CNPJ</Label>
                      <Input
                        value={clientCnpj}
                        onChange={e => setClientCnpj(maskCpfCnpj(e.target.value))}
                        className="h-9"
                        placeholder="CPF ou CNPJ"
                        maxLength={18}
                        inputMode="numeric"
                      />
                    </div>
                  </div>
                )}
                {sale && clientData && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-caption">
                      Dados preenchidos automaticamente da venda #{sale.number}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Upload de Arquivos */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-ui flex items-center gap-2">
                  <Upload className="h-4 w-4" /> Anexar Arquivos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">XML da NF-e</Label>
                    <Input
                      type="file"
                      accept=".xml"
                      onChange={e => setXmlFile(e.target.files?.[0] || null)}
                      className="h-9 text-xs"
                    />
                    {xmlFile && <p className="text-xs text-muted-foreground">{xmlFile.name}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">PDF / DANFE</Label>
                    <Input
                      type="file"
                      accept=".pdf"
                      onChange={e => setPdfFile(e.target.files?.[0] || null)}
                      className="h-9 text-xs"
                    />
                    {pdfFile && <p className="text-xs text-muted-foreground">{pdfFile.name}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Observações */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-ui">Observações</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={observacoes}
                  onChange={e => setObservacoes(e.target.value)}
                  placeholder="Informações adicionais sobre a nota fiscal..."
                  rows={3}
                />
              </CardContent>
            </Card>

            <Button className="w-full h-10" onClick={handleSave} disabled={saving}>
              <FilePlus className="h-4 w-4 mr-2" />
              {saving ? "Salvando..." : "Cadastrar NF-e"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
