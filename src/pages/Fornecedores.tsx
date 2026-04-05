import { Truck, Construction } from "lucide-react";
import { FilialSelector } from "@/components/FilialSelector";

export default function Fornecedores() {
  return (
    <div>
      <FilialSelector />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-title font-semibold tracking-tighter">Fornecedores</h1>
            <p className="text-ui text-muted-foreground">Gestão de fornecedores e compras</p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Construction className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-ui font-medium">Recurso em desenvolvimento</p>
          <p className="text-caption mt-1">Este módulo ainda não está disponível. Em breve será liberado.</p>
        </div>
      </div>
    </div>
  );
}
