import { useFilial, type FilialId } from "@/contexts/FilialContext";
import { cn } from "@/lib/utils";

interface FilialSelectorProps {
  onBeforeChange?: (newFilial: FilialId) => boolean;
  hideAll?: boolean;
}

export function FilialSelector({ onBeforeChange, hideAll }: FilialSelectorProps = {}) {
  const { selectedFilial, setSelectedFilial, filiais, isFilialRestricted } = useFilial();

  // If restricted to a single filial, show only that one (no "Todas" option)
  const options: { id: FilialId; label: string }[] = isFilialRestricted
    ? filiais.map(f => ({ id: f.id, label: f.name }))
    : [
        ...filiais.map(f => ({ id: f.id, label: f.name })),
        ...(hideAll ? [] : [{ id: "all" as FilialId, label: "Todas" }]),
      ];

  const handleClick = (id: FilialId) => {
    if (isFilialRestricted) return; // Cannot change
    if (id === selectedFilial) return;
    if (onBeforeChange && !onBeforeChange(id)) return;
    setSelectedFilial(id);
  };

  if (filiais.length === 0) return null;

  return (
    <div className="px-4 pt-4 pb-0">
      <div className={cn(
        "grid bg-secondary/50 rounded-lg p-0.5 w-full",
      )} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map(opt => (
          <button
            key={opt.id}
            onClick={() => handleClick(opt.id)}
            disabled={isFilialRestricted}
            className={cn(
              "py-2 rounded-md text-caption font-medium transition-all text-center truncate px-2",
              selectedFilial === opt.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary",
              isFilialRestricted && "cursor-default"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
