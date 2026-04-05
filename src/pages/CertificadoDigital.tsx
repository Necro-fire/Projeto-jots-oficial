import { ShieldCheck, Upload, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function CertificadoDigital() {
  return (
    <div className="p-4 space-y-4 max-w-2xl">
      <div>
        <h1 className="text-title font-semibold tracking-tighter">Certificado Digital</h1>
        <p className="text-ui text-muted-foreground">Configuração do certificado A1 para emissão de NF-e</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-ui flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Status do Certificado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-md bg-warning/10 border border-warning/20">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
            <div>
              <p className="text-ui font-medium text-warning">Nenhum certificado configurado</p>
              <p className="text-caption text-muted-foreground">Faça upload do certificado digital A1 (.pfx) para emitir notas fiscais</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-ui">Upload do Certificado A1</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-caption">Arquivo do certificado (.pfx)</Label>
            <div className="flex gap-2">
              <Input type="file" accept=".pfx,.p12" className="h-9 flex-1" />
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0">
                <Upload className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-caption">Senha do certificado</Label>
            <Input type="password" placeholder="Senha do arquivo .pfx" className="h-9" />
          </div>
          <Button className="w-full h-10" onClick={() => toast.success("Certificado salvo com sucesso")}>
            Salvar Certificado
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-ui">Informações</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-caption text-muted-foreground">
            <li>• O certificado A1 é obrigatório para emissão de NF-e</li>
            <li>• Formatos aceitos: .pfx e .p12</li>
            <li>• O certificado será armazenado de forma segura e criptografada</li>
            <li>• Validade típica: 1 ano — renove antes do vencimento</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
