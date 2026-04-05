import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import type { DescontoAtacado } from "@/hooks/useDescontosAtacado";

interface DiscountRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: DescontoAtacado[];
  hasConflict: boolean;
  onConfirm: (selectedRules: DescontoAtacado[]) => void;
}

function getRuleLabel(rule: DescontoAtacado): string {
  const typeLabels: Record<string, string> = {
    todos: "Todos os produtos",
    todas_armacoes: "Todas as armações",
    todos_acessorios: "Todos os acessórios",
    armacao_especifica: `Armação: ${rule.categoria}`,
    acessorio_especifico: `Acessório: ${rule.categoria}`,
    produto: "Produto específico",
  };
  const type = typeLabels[rule.tipo_desconto] || rule.tipo_desconto;
  const discount = rule.tipo_valor === "percentual"
    ? `-${rule.valor_desconto}%`
    : `-R$ ${rule.valor_desconto.toFixed(2)}`;
  return `${type} (mín. ${rule.quantidade_minima} un.) → ${discount}`;
}

export function DiscountRuleDialog({ open, onOpenChange, rules, hasConflict, onConfirm }: DiscountRuleDialogProps) {
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    if (open) {
      setSelectedId(rules.length === 1 ? rules[0].id : "");
    }
  }, [open, rules]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Descontos disponíveis</DialogTitle>
          <DialogDescription>
            Foram identificadas {rules.length} regras de desconto aplicáveis. Selecione qual deseja aplicar:
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={selectedId} onValueChange={setSelectedId} className="space-y-3">
          {rules.map(rule => (
            <label
              key={rule.id}
              className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-secondary/50 transition-colors"
            >
              <RadioGroupItem value={rule.id} id={rule.id} />
              <div className="flex-1">
                <Label htmlFor={rule.id} className="text-sm cursor-pointer">{getRuleLabel(rule)}</Label>
                <div className="mt-1">
                  <Badge variant="secondary" className="text-[10px]">
                    {rule.quantidade_minima} produtos
                  </Badge>
                </div>
              </div>
            </label>
          ))}
        </RadioGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Sem desconto
          </Button>
          <Button
            onClick={() => {
              const selected = rules.find(r => r.id === selectedId);
              onConfirm(selected ? [selected] : []);
              onOpenChange(false);
            }}
            disabled={!selectedId}
          >
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
