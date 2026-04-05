import { useState } from "react";
import { Plus, Trash2, Split, CreditCard, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export interface PaymentEntry {
  id: string;
  method: string;
  amount: number;
  installments?: number;
  finalTotal?: number;
  boletoInterval?: string;
  boletoInstallments?: number;
}

const PAYMENT_METHODS = [
  { value: "pix", label: "Pix" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cartao", label: "Cartão de Crédito" },
  { value: "debito", label: "Cartão de Débito" },
  { value: "boleto", label: "Boleto" },
  { value: "consignado", label: "Consignado" },
];

let entryCounter = 0;
function nextEntryId() {
  return `pay-${++entryCounter}-${Date.now()}`;
}

interface SplitPaymentPanelProps {
  total: number;
  isSplit: boolean;
  onSplitChange: (split: boolean) => void;
  singleMethod: string;
  onSingleMethodChange: (method: string) => void;
  entries: PaymentEntry[];
  onEntriesChange: (entries: PaymentEntry[]) => void;
  onOpenInstallments?: (entryId: string, entryAmount: number) => void;
  onOpenBoleto?: (entryId: string, entryAmount: number) => void;
}

export function SplitPaymentPanel({
  total,
  isSplit,
  onSplitChange,
  singleMethod,
  onSingleMethodChange,
  entries,
  onEntriesChange,
  onOpenInstallments,
  onOpenBoleto,
}: SplitPaymentPanelProps) {
  const addEntry = () => {
    const usedMethods = entries.map(e => e.method);
    const available = PAYMENT_METHODS.find(m => !usedMethods.includes(m.value));
    const remaining = total - entries.reduce((s, e) => s + e.amount, 0);
    onEntriesChange([
      ...entries,
      { id: nextEntryId(), method: available?.value || "pix", amount: Math.max(0, remaining) },
    ]);
  };

  const removeEntry = (id: string) => {
    onEntriesChange(entries.filter(e => e.id !== id));
  };

  const updateEntry = (id: string, field: "method" | "amount", value: string | number) => {
    onEntriesChange(
      entries.map(e => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  const totalPaid = entries.reduce((s, e) => s + e.amount, 0);
  const diff = totalPaid - total;

  if (!isSplit) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Select value={singleMethod} onValueChange={onSingleMethodChange}>
            <SelectTrigger className="h-9 flex-1">
              <SelectValue placeholder="Forma de pagamento..." />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="split-toggle"
            checked={isSplit}
            onCheckedChange={(checked) => {
              onSplitChange(checked);
              if (checked && entries.length === 0) {
                onEntriesChange([
                  { id: nextEntryId(), method: singleMethod || "pix", amount: total },
                ]);
              }
            }}
          />
          <Label htmlFor="split-toggle" className="text-caption text-muted-foreground cursor-pointer">
            <Split className="inline h-3 w-3 mr-1" />
            Dividir pagamento
          </Label>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            id="split-toggle"
            checked={isSplit}
            onCheckedChange={(checked) => {
              onSplitChange(checked);
              if (!checked) {
                onEntriesChange([]);
              }
            }}
          />
          <Label htmlFor="split-toggle" className="text-caption text-muted-foreground cursor-pointer">
            <Split className="inline h-3 w-3 mr-1" />
            Dividir pagamento
          </Label>
        </div>
        {entries.length < PAYMENT_METHODS.length && (
          <Button variant="ghost" size="sm" className="h-7 text-caption" onClick={addEntry}>
            <Plus className="h-3 w-3 mr-1" /> Adicionar
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        {entries.map((entry) => (
          <div key={entry.id} className="space-y-1">
            <div className="flex items-center gap-2">
              <Select value={entry.method} onValueChange={(v) => {
                updateEntry(entry.id, "method", v);
                // Clear installment/boleto info when method changes
                if (v !== "cartao" && v !== "boleto") {
                  onEntriesChange(
                    entries.map(e => e.id === entry.id ? { ...e, method: v, installments: undefined, finalTotal: undefined, boletoInterval: undefined, boletoInstallments: undefined } : e)
                  );
                } else if (v === "cartao") {
                  onEntriesChange(
                    entries.map(e => e.id === entry.id ? { ...e, method: v, boletoInterval: undefined, boletoInstallments: undefined } : e)
                  );
                } else if (v === "boleto") {
                  onEntriesChange(
                    entries.map(e => e.id === entry.id ? { ...e, method: v, installments: undefined, finalTotal: undefined } : e)
                  );
                }
              }}>
                <SelectTrigger className="h-8 flex-1 text-caption">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <CurrencyInput
                value={entry.amount}
                onValueChange={(v) => updateEntry(entry.id, "amount", v)}
                className="h-8 w-28 text-caption tabular-nums"
              />
              {entry.method === "cartao" && onOpenInstallments && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-primary"
                  title="Parcelamento"
                  onClick={() => onOpenInstallments(entry.id, entry.amount)}
                >
                  <CreditCard className="h-3 w-3" />
                </Button>
              )}
              {entry.method === "boleto" && onOpenBoleto && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-primary"
                  title="Configurar Boleto"
                  onClick={() => onOpenBoleto(entry.id, entry.amount)}
                >
                  <Banknote className="h-3 w-3" />
                </Button>
              )}
              {entries.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeEntry(entry.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
            {entry.method === "cartao" && entry.installments && entry.finalTotal && (
              <div className="flex items-center justify-between text-caption bg-secondary rounded px-2 py-1 ml-1">
                <span className="text-muted-foreground">
                  {entry.installments}x de R$ {(entry.finalTotal / entry.installments).toFixed(2)} (total R$ {entry.finalTotal.toFixed(2)})
                </span>
                <button
                  className="text-primary text-xs underline"
                  onClick={() => onOpenInstallments?.(entry.id, entry.amount)}
                >
                  Alterar
                </button>
              </div>
            )}
            {entry.method === "boleto" && entry.boletoInterval && entry.boletoInstallments && entry.finalTotal && (
              <div className="flex items-center justify-between text-caption bg-secondary rounded px-2 py-1 ml-1">
                <span className="text-muted-foreground">
                  {entry.boletoInstallments}x a cada {entry.boletoInterval} dias (total R$ {entry.finalTotal.toFixed(2)})
                </span>
                <button
                  className="text-primary text-xs underline"
                  onClick={() => onOpenBoleto?.(entry.id, entry.amount)}
                >
                  Alterar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-caption">
        <span className="text-muted-foreground">Total pago:</span>
        <span className={`font-medium tabular-nums ${Math.abs(diff) < 0.01 ? "text-success" : "text-destructive"}`}>
          R$ {totalPaid.toFixed(2)}
        </span>
      </div>
      {diff < -0.01 && (
        <Badge variant="destructive" className="text-caption w-full justify-center">
          Faltam R$ {Math.abs(diff).toFixed(2)}
        </Badge>
      )}
      {diff > 0.01 && (
        <Badge variant="destructive" className="text-caption w-full justify-center">
          Excede R$ {diff.toFixed(2)}
        </Badge>
      )}
    </div>
  );
}
