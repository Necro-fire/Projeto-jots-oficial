import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

const fiscalFields = [
  { label: "NCM padrão", placeholder: "9004.10.00", key: "ncm" },
  { label: "CFOP padrão", placeholder: "5102", key: "cfop" },
  { label: "CST / CSOSN", placeholder: "102", key: "cst" },
  { label: "Origem do produto", placeholder: "0 - Nacional", key: "origem" },
  { label: "Unidade comercial", placeholder: "UN", key: "unidade" },
  { label: "Alíquota ICMS (%)", placeholder: "0.00", key: "icms" },
  { label: "Alíquota PIS (%)", placeholder: "0.00", key: "pis" },
  { label: "Alíquota COFINS (%)", placeholder: "0.00", key: "cofins" },
];

export default function ConfiguracaoFiscal() {
  return (
    <div className="p-4 space-y-4 max-w-2xl">
      <div>
        <h1 className="text-title font-semibold tracking-tighter">Configuração Fiscal</h1>
        <p className="text-ui text-muted-foreground">Dados fiscais padrão dos produtos para NF-e</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-ui">Campos Fiscais Padrão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-caption text-muted-foreground">
            Esses valores serão aplicados como padrão nos produtos que não possuem configuração fiscal individual.
          </p>
          <Separator />
          <div className="grid grid-cols-2 gap-4">
            {fiscalFields.map(f => (
              <div key={f.key} className="space-y-1">
                <Label className="text-caption">{f.label}</Label>
                <Input placeholder={f.placeholder} className="h-9" />
              </div>
            ))}
          </div>
          <Button className="w-full h-10" onClick={() => toast.success("Configuração fiscal salva")}>
            Salvar Configuração
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
