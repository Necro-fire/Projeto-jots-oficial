import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Banknote, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Max 90 days total
const MAX_INSTALLMENTS = {
  "15": 6,  // 6×15 = 90d
  "30": 3,  // 3×30 = 90d
} as const;

// Interest rate per period AFTER 30 days
const RATE_PER_PERIOD = {
  "15": 3,  // 3% per 15-day period after 30d
  "30": 6,  // 6% per 30-day period after 30d
} as const;

type BoletoInterval = "15" | "30";

function getInstallmentValues(n: number, interval: BoletoInterval, total: number) {
  const intervalDays = parseInt(interval);
  const JUROS_RATE = intervalDays <= 15 ? 0.03 : 0.06; // 3% for 15d, 6% for 30d
  const valorBase = total / n;

  // 15d: interest from 3rd installment; 30d: interest from 2nd installment
  const firstInterestInstallment = intervalDays <= 15 ? 3 : 2;

  const parcelas: number[] = [];
  let finalTotal = 0;
  let installmentsWithInterest = 0;
  for (let i = 1; i <= n; i++) {
    if (i >= firstInterestInstallment) {
      const val = Math.round(valorBase * (1 + JUROS_RATE) * 100) / 100;
      parcelas.push(val);
      finalTotal += val;
      installmentsWithInterest++;
    } else {
      parcelas.push(Math.round(valorBase * 100) / 100);
      finalTotal += Math.round(valorBase * 100) / 100;
    }
  }

  const ratePercent = installmentsWithInterest > 0 ? (intervalDays <= 15 ? 3 : 6) : 0;
  return { finalTotal, parcelas, ratePercent, installmentsWithInterest };
}

interface BoletoConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  onConfirm: (interval: string, installments: number, finalTotal: number) => void;
}

export function BoletoConfigDialog({ open, onOpenChange, total, onConfirm }: BoletoConfigDialogProps) {
  const [interval, setInterval] = useState<BoletoInterval>("30");
  const [installments, setInstallments] = useState(1);

  const maxInstallments = MAX_INSTALLMENTS[interval];

  const handleIntervalChange = (val: BoletoInterval) => {
    setInterval(val);
    if (installments > MAX_INSTALLMENTS[val]) {
      setInstallments(MAX_INSTALLMENTS[val]);
    }
  };

  const { finalTotal, parcelas, ratePercent } = getInstallmentValues(installments, interval, total);
  const jurosTotal = finalTotal - total;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            Configurar Boleto
          </DialogTitle>
        </DialogHeader>

        <div className="text-sm text-muted-foreground mb-1">
          Valor original: <span className="font-semibold text-foreground">R$ {total.toFixed(2)}</span>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-sm">Intervalo entre parcelas</Label>
            <Select value={interval} onValueChange={(v) => handleIntervalChange(v as BoletoInterval)}>
              <SelectTrigger className="h-9 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">A cada 15 dias (até 6x)</SelectItem>
                <SelectItem value="30">A cada 30 dias (até 3x)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm">Número de parcelas</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => {
                const data = getInstallmentValues(n, interval, total);
                const isSelected = installments === n;
                const lastDay = n * parseInt(interval);
                return (
                  <button
                    key={n}
                    onClick={() => setInstallments(n)}
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
                      R$ {(data.finalTotal / n).toFixed(2)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{lastDay}d{data.ratePercent > 0 ? ` (+${data.ratePercent}%)` : ""}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-secondary p-3 space-y-1">
          {parcelas.map((val, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-muted-foreground">Parcela {i + 1}</span>
              <span className="font-medium tabular-nums">R$ {val.toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Prazo total</span>
            <span className="font-medium">{installments * parseInt(interval)} dias</span>
          </div>
          {jurosTotal > 0.01 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Juros ({ratePercent}%)</span>
              <span className="font-medium text-destructive">+ R$ {jurosTotal.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold pt-1 border-t border-border/50">
            <span>Total final</span>
            <span className="text-primary tabular-nums">R$ {finalTotal.toFixed(2)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => { onConfirm(interval, installments, finalTotal); onOpenChange(false); }}>
            Confirmar Boleto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
