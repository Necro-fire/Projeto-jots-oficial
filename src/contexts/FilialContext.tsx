import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";

export type FilialId = "1" | "2" | "3" | "all";

export interface Filial {
  id: FilialId;
  name: string;
}

const allFiliais: Filial[] = [
  { id: "1", name: "Filial 1" },
  { id: "2", name: "Filial 2" },
  { id: "3", name: "Filial 3" },
];

interface FilialContextType {
  selectedFilial: FilialId;
  setSelectedFilial: (id: FilialId) => void;
  filterByFilial: <T extends { filialId: string }>(items: T[]) => T[];
  filialLabel: string;
  filiais: Filial[];
  isFilialRestricted: boolean;
}

const FilialContext = createContext<FilialContextType | null>(null);

export function FilialProvider({ children }: { children: ReactNode }) {
  const { isAdmin, employeeFilialId, loading } = useAuth();

  // Non-admin employees are locked to their filial
  const isFilialRestricted = !isAdmin && !!employeeFilialId;
  const forcedFilial = isFilialRestricted ? (employeeFilialId as FilialId) : null;

  const [selectedFilial, setSelectedFilialRaw] = useState<FilialId>("all");

  // When auth loads and user is restricted, lock to their filial
  useEffect(() => {
    if (!loading && forcedFilial) {
      setSelectedFilialRaw(forcedFilial);
    }
  }, [loading, forcedFilial]);

  const setSelectedFilial = (id: FilialId) => {
    // Non-admin users cannot change filial
    if (isFilialRestricted) return;
    setSelectedFilialRaw(id);
  };

  // Filiais available to the user
  const filiais = isFilialRestricted
    ? allFiliais.filter(f => f.id === forcedFilial)
    : allFiliais;

  const filterByFilial = <T extends { filialId: string }>(items: T[]): T[] => {
    const active = isFilialRestricted ? forcedFilial! : selectedFilial;
    if (active === "all") return items;
    return items.filter(item => item.filialId === active);
  };

  const activeFilial = isFilialRestricted ? forcedFilial! : selectedFilial;
  const filialLabel = activeFilial === "all"
    ? "Todas as Filiais"
    : allFiliais.find(f => f.id === activeFilial)?.name || `Filial ${activeFilial}`;

  return (
    <FilialContext.Provider value={{
      selectedFilial: isFilialRestricted ? forcedFilial! : selectedFilial,
      setSelectedFilial,
      filterByFilial,
      filialLabel,
      filiais,
      isFilialRestricted,
    }}>
      {children}
    </FilialContext.Provider>
  );
}

export function useFilial() {
  const ctx = useContext(FilialContext);
  if (!ctx) throw new Error("useFilial must be used within FilialProvider");
  return ctx;
}
