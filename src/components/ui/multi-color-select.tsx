import { useRef } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface MultiColorSelectProps {
  /** Cores selecionadas (compatível com produtos antigos de cor única). */
  values: string[];
  onChange: (values: string[]) => void;
  options: readonly string[] | string[];
  placeholder?: string;
  /** Máximo de cores por componente (independente dos demais campos). */
  max?: number;
  disabled?: boolean;
}

/**
 * Seletor de múltiplas cores: mantém a primeira linha sempre visível
 * e permite adicionar até `max` cores, cada uma removível individualmente.
 * Evita duplicidade ocultando as cores já escolhidas nas demais linhas.
 */
export function MultiColorSelect({
  values,
  onChange,
  options,
  placeholder = "Selecione a cor",
  max = 5,
  disabled,
}: MultiColorSelectProps) {
  const rows = values.length > 0 ? values : [""];
  const sorted = [...options].sort((a, b) => a.localeCompare(b, "pt-BR"));

  // Chaves estáveis por linha: evita remontagem (que faz o foco voltar ao início do formulário).
  const idsRef = useRef<number[]>([]);
  const seqRef = useRef(0);
  while (idsRef.current.length < rows.length) idsRef.current.push(seqRef.current++);
  if (idsRef.current.length > rows.length) idsRef.current = idsRef.current.slice(0, rows.length);

  const triggersRef = useRef<Array<HTMLButtonElement | null>>([]);

  const setAt = (index: number, value: string) => {
    const next = [...rows];
    next[index] = value;
    onChange(next);
  };

  const removeAt = (index: number) => {
    idsRef.current = idsRef.current.filter((_, i) => i !== index);
    triggersRef.current = triggersRef.current.filter((_, i) => i !== index);
    onChange(rows.filter((_, i) => i !== index));
    // devolve o foco para uma posição lógica próxima
    requestAnimationFrame(() => {
      const target = triggersRef.current[Math.max(0, index - 1)];
      target?.focus();
    });
  };

  const addRow = () => {
    const nextIndex = rows.length;
    onChange([...rows, ""]);
    requestAnimationFrame(() => triggersRef.current[nextIndex]?.focus());
  };

  const canAdd = rows.length < max && rows.every(Boolean);

  return (
    <div className="space-y-2">
      {rows.map((value, index) => {
        const available = sorted.filter(c => c === value || !rows.includes(c));
        return (
          <div key={idsRef.current[index]} className="flex items-center gap-1.5">
            <Select value={value} onValueChange={(v) => setAt(index, v)} disabled={disabled}>
              <SelectTrigger
                ref={(el) => { triggersRef.current[index] = el; }}
                className="flex-1"
              >
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent>
                {available.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            {rows.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                title="Remover cor"
                onClick={() => removeAt(index)}
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      })}
      {canAdd && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-1 text-xs text-primary"
          onClick={addRow}
          disabled={disabled}
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar outra cor
        </Button>
      )}
    </div>
  );
}

/** Converte o valor do banco (texto único ou lista separada por vírgula) em array. */
export function parseCores(value?: string | null): string[] {
  return (value || "").split(",").map(s => s.trim()).filter(Boolean);
}

/** Serializa a lista de cores para persistência (compatível com cor única). */
export function joinCores(values: string[]): string {
  return values.filter(Boolean).join(", ");
}
