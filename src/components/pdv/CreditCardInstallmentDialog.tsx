import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { INTEREST_RATES } from "@/lib/paymentUtils";

interface CreditCardInstallmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  onConfirm: (installments: number, finalTotal: number) => void;
}

export function CreditCardInstallmentDialog({
  open,
  onOpenChange,
  total,
  onConfirm,
}: CreditCardInstallmentDialogProps) {
  const [selected, setSelected] = useState<number>(1);

  const getInstallmentData = (n: number) => {
    const rate = INTEREST_RATES[n];
    const finalTotal = total * (1 + rate / 100);
    const installmentValue = finalTotal / n;
    return { rate, finalTotal, installmentValue };
  };

  const { rate, finalTotal, installmentValue } = getInstallmentData(selected);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Parcelamento no Cartão de Crédito
          </DialogTitle>
        </DialogHeader>

        <div className="text-sm text-muted-foreground mb-1">
          Valor original: <span className="font-semibold text-foreground">R$ {total.toFixed(2)}</span>
        </div>

        <div className="grid grid-cols-3 gap-2 max-h-[320px] overflow-y-auto">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => {
            const data = getInstallmentData(n);
            const isSelected = selected === n;
            return (
              <button
                key={n}
                onClick={() => setSelected(n)}
                className={cn(
                  "rounded-lg border p-2.5 text-left transition-all hover:border-primary/50",
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{n}x</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                </div>
                <p className="text-xs font-medium tabular-nums mt-1">
                  R$ {data.installmentValue.toFixed(2)}
                </p>
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  {data.rate}% juros
                </p>
              </button>
            );
          })}
        </div>

        <div className="rounded-lg bg-secondary p-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Parcelas</span>
            <span className="font-medium">{selected}x de R$ {installmentValue.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Juros</span>
            <span className="font-medium text-destructive">+{rate}% (R$ {(finalTotal - total).toFixed(2)})</span>
          </div>
          <div className="flex justify-between text-base font-semibold pt-1 border-t border-border/50">
            <span>Total final</span>
            <span className="text-primary tabular-nums">R$ {finalTotal.toFixed(2)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => { onConfirm(selected, finalTotal); onOpenChange(false); }}>
            Confirmar {selected}x
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
