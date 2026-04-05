import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NumericStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "default";
  className?: string;
  disabled?: boolean;
}

export function NumericStepper({
  value,
  onChange,
  min = 0,
  max = Infinity,
  size = "default",
  className,
  disabled = false,
}: NumericStepperProps) {
  const isSmall = size === "sm";
  const btnSize = isSmall ? "h-7 w-7" : "h-9 w-9";
  const iconSize = isSmall ? "h-3 w-3" : "h-4 w-4";
  const textSize = isSmall ? "text-ui w-8" : "text-subhead w-10";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn(btnSize, "rounded-full shrink-0")}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
      >
        <Minus className={iconSize} />
      </Button>
      <span className={cn("font-semibold tabular-nums text-center select-none", textSize)}>
        {value}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn(btnSize, "rounded-full shrink-0")}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
      >
        <Plus className={iconSize} />
      </Button>
    </div>
  );
}
