import { useState } from "react";
import { format, startOfDay, endOfDay, subDays, startOfMonth, startOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type DatePreset = "today" | "7days" | "month" | "year" | "custom";

export interface DateRange {
  from: Date;
  to: Date;
}

const presetLabels: Record<DatePreset, string> = {
  today: "Hoje",
  "7days": "Últimos 7 dias",
  month: "Mês",
  year: "Ano",
  custom: "Personalizado",
};

function getPresetRange(preset: Exclude<DatePreset, "custom">): DateRange {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "7days":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "month":
      return { from: startOfMonth(now), to: endOfDay(now) };
    case "year":
      return { from: startOfYear(now), to: endOfDay(now) };
  }
}

interface DateRangeFilterProps {
  preset: DatePreset;
  range: DateRange;
  onChange: (preset: DatePreset, range: DateRange) => void;
}

export function useDateRangeFilter() {
  const [preset, setPreset] = useState<DatePreset>("month");
  const [range, setRange] = useState<DateRange>(getPresetRange("month"));

  const onChange = (p: DatePreset, r: DateRange) => {
    setPreset(p);
    setRange(r);
  };

  return { preset, range, onChange };
}

export function filterByDateRange<T extends { created_at: string }>(
  items: T[],
  range: DateRange
): T[] {
  const from = range.from.getTime();
  const to = range.to.getTime();
  return items.filter((item) => {
    const t = new Date(item.created_at).getTime();
    return t >= from && t <= to;
  });
}

export function DateRangeFilter({ preset, range, onChange }: DateRangeFilterProps) {
  const [customFrom, setCustomFrom] = useState<Date | undefined>(range.from);
  const [customTo, setCustomTo] = useState<Date | undefined>(range.to);
  const [customOpen, setCustomOpen] = useState(false);
  const [error, setError] = useState("");

  const handlePreset = (p: Exclude<DatePreset, "custom">) => {
    onChange(p, getPresetRange(p));
  };

  const handleApplyCustom = () => {
    if (!customFrom || !customTo) return;
    if (customFrom > customTo) {
      setError("A data inicial não pode ser maior que a data final.");
      return;
    }
    setError("");
    onChange("custom", { from: startOfDay(customFrom), to: endOfDay(customTo) });
    setCustomOpen(false);
  };

  const presets: Exclude<DatePreset, "custom">[] = ["today", "7days", "month", "year"];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {presets.map((p) => (
        <Button
          key={p}
          variant={preset === p ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs"
          onClick={() => handlePreset(p)}
        >
          {presetLabels[p]}
        </Button>
      ))}

      <Popover open={customOpen} onOpenChange={(o) => { setCustomOpen(o); if (o) { setCustomFrom(range.from); setCustomTo(range.to); setError(""); } }}>
        <PopoverTrigger asChild>
          <Button
            variant={preset === "custom" ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs gap-1.5"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {preset === "custom"
              ? `${format(range.from, "dd/MM", { locale: ptBR })} - ${format(range.to, "dd/MM", { locale: ptBR })}`
              : "Personalizado"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4 space-y-3" align="end">
          <h4 className="text-sm font-semibold">Período personalizado</h4>

          <div className="flex gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Data inicial</p>
              <Calendar
                mode="single"
                selected={customFrom}
                onSelect={setCustomFrom}
                locale={ptBR}
                className="p-2 pointer-events-auto"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Data final</p>
              <Calendar
                mode="single"
                selected={customTo}
                onSelect={setCustomTo}
                locale={ptBR}
                className="p-2 pointer-events-auto"
              />
            </div>
          </div>

          {error && <p className="text-[11px] text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" className="h-8" onClick={() => setCustomOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" className="h-8" onClick={handleApplyCustom} disabled={!customFrom || !customTo}>
              Aplicar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
