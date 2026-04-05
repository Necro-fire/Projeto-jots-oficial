import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { maskCpf, maskCnpj } from "@/lib/masks";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type DocType = "" | "cpf" | "cnpj";

interface Client {
  id: string;
  store_name: string;
  responsible_name: string;
  cnpj: string;
}

interface ClientSearchPanelProps {
  clients: Client[];
  selectedClient: string;
  onSelectClient: (id: string) => void;
}

export function ClientSearchPanel({ clients, selectedClient, onSelectClient }: ClientSearchPanelProps) {
  const [docType, setDocType] = useState<DocType>("");
  const [docValue, setDocValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Client[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const selectedClientObj = clients.find(c => c.id === selectedClient);

  const search = useCallback((digits: string) => {
    if (digits.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const matches = clients.filter(c => c.cnpj.replace(/\D/g, "").includes(digits));
    setSuggestions(matches);
    setShowSuggestions(matches.length > 0);
  }, [clients]);

  const handleDocChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    const masked = docType === "cpf" ? maskCpf(digits) : maskCnpj(digits);
    setDocValue(masked);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(digits), 250);
  };

  const handleSelect = (client: Client) => {
    onSelectClient(client.id);
    setDocValue(client.cnpj);
    setShowSuggestions(false);
  };

  const handleClear = () => {
    onSelectClient("");
    setDocValue("");
    setDocType("");
    setSuggestions([]);
    setShowSuggestions(false);
  };

  // Close suggestions on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  return (
    <div ref={panelRef} className="space-y-2">
      {selectedClientObj ? (
        <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 h-9">
          <span className="flex-1 text-ui truncate">
            {selectedClientObj.responsible_name || selectedClientObj.store_name}
            {selectedClientObj.cnpj && (
              <span className="ml-2 text-muted-foreground text-caption">· {selectedClientObj.cnpj}</span>
            )}
          </span>
          <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={handleClear}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <Select value={docType} onValueChange={(v: DocType) => { setDocType(v); setDocValue(""); setSuggestions([]); }}>
              <SelectTrigger className="h-9 w-[110px] shrink-0">
                <SelectValue placeholder="Tipo..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cpf">CPF</SelectItem>
                <SelectItem value="cnpj">CNPJ</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Input
                ref={inputRef}
                placeholder={!docType ? "Selecione o tipo →" : docType === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
                value={docValue}
                onChange={(e) => handleDocChange(e.target.value)}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                disabled={!docType}
                className="h-9"
                maxLength={docType === "cpf" ? 14 : 18}
              />
              {showSuggestions && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border bg-popover shadow-md max-h-48 overflow-auto">
                  {suggestions.map(c => (
                    <button
                      key={c.id}
                      className="w-full text-left px-3 py-2 text-ui hover:bg-accent transition-colors"
                      onClick={() => handleSelect(c)}
                    >
                      <span className="font-medium">{c.responsible_name || c.store_name}</span>
                      {c.cnpj && <span className="ml-2 text-muted-foreground text-caption">· {c.cnpj}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
