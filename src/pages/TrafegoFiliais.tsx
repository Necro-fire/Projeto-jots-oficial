import { Construction } from "lucide-react";

export default function TrafegoFiliais() {
  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-title font-semibold tracking-tighter">Tráfego entre Filiais</h1>
        <p className="text-ui text-muted-foreground">Gerencie transferências de produtos entre filiais</p>
      </div>
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Construction className="h-12 w-12 mb-3 opacity-30" />
        <p className="text-ui font-medium">Em construção</p>
        <p className="text-caption mt-1">Este módulo estará disponível em breve</p>
      </div>
    </div>
  );
}
