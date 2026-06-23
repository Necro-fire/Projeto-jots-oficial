import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { maskCpf, maskCnpj } from "@/lib/masks";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type SearchType = "nome" | "doc";

interface Client {
  id: string;
  store_name: string;
  responsible_name: string;
  cnpj: string;
  cpf?: string;
  nome_fantasia?: string;
}

interface ClientSearchPanelProps {
  clients: Client[];
  selectedClient: string;
  onSelectClient: (id: string) => void;
}

export function ClientSearchPanel({ clients, selectedClient, onSelectClient }: ClientSearchPanelProps) {
  const [searchType, setSearchType] = useState<SearchType>("nome");
  const [value, setValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Client[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const selectedClientObj = clients.find(c => c.id === selectedClient);

  const search = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    let matches: Client[] = [];
    if (searchType === "nome") {
      const q = trimmed.toLowerCase();
      matches = clients.filter(c => {
        const fantasia = (c.nome_fantasia || "").toLowerCase();
        const store = (c.store_name || "").toLowerCase();
        const resp = (c.responsible_name || "").toLowerCase();
        return fantasia.includes(q) || store.includes(q) || resp.includes(q);
      });
    } else {
      const digits = trimmed.replace(/\D/g, "");
      if (digits.length < 2) return;
      matches = clients.filter(c => {
        const cnpjD = (c.cnpj || "").replace(/\D/g, "");
        const cpfD = (c.cpf || "").replace(/\D/g, "");
        return (cnpjD && cnpjD.includes(digits)) || (cpfD && cpfD.includes(digits));
      });
    }
    setSuggestions(matches.slice(0, 20));
    setShowSuggestions(matches.length > 0);
  }, [clients, searchType]);

  const handleChange = (raw: string) => {
    let next = raw;
    if (searchType === "doc") {
      const digits = raw.replace(/\D/g, "").slice(0, 14);
      next = digits.length <= 11 ? maskCpf(digits) : maskCnpj(digits);
    }
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(next), 200);
  };

  const handleSelect = (client: Client) => {
    onSelectClient(client.id);
    setValue(searchType === "nome"
      ? (client.nome_fantasia || client.store_name || client.responsible_name || "")
      : (client.cnpj || client.cpf || ""));
    setShowSuggestions(false);
  };

  const handleClear = () => {
    onSelectClient("");
    setValue("");
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleTypeChange = (v: SearchType) => {
    setSearchType(v);
    setValue("");
    setSuggestions([]);
    setShowSuggestions(false);
  };

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

  const placeholder = searchType === "nome"
    ? "Digite o nome fantasia..."
    : "CPF ou CNPJ";

  return (
    <div ref={panelRef} className="space-y-2">
      {selectedClientObj ? (
        <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 h-9">
          <span className="flex-1 text-ui truncate">
            {selectedClientObj.nome_fantasia || selectedClientObj.store_name || selectedClientObj.responsible_name}
            {(selectedClientObj.cnpj || selectedClientObj.cpf) && (
              <span className="ml-2 text-muted-foreground text-caption">· {selectedClientObj.cnpj || selectedClientObj.cpf}</span>
            )}
          </span>
          <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={handleClear}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Select value={searchType} onValueChange={(v: SearchType) => handleTypeChange(v)}>
            <SelectTrigger className="h-9 w-[150px] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nome">Nome Fantasia</SelectItem>
              <SelectItem value="doc">CPF/CNPJ</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              placeholder={placeholder}
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              className="h-9"
              maxLength={searchType === "doc" ? 18 : undefined}
              preserveCase={searchType === "doc"}
            />
            {showSuggestions && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border bg-popover shadow-md max-h-56 overflow-auto">
                {suggestions.map(c => (
                  <button
                    key={c.id}
                    className="w-full text-left px-3 py-2 text-ui hover:bg-accent transition-colors"
                    onClick={() => handleSelect(c)}
                  >
                    <span className="font-medium">{c.nome_fantasia || c.store_name || c.responsible_name}</span>
                    {(c.cnpj || c.cpf) && <span className="ml-2 text-muted-foreground text-caption">· {c.cnpj || c.cpf}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
