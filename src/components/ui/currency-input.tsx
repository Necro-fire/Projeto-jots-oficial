import * as React from "react";
import { cn } from "@/lib/utils";
import { maskCurrency, parseCurrency, formatCentsToDisplay } from "@/lib/masks";

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  /** Numeric value (float, e.g. 123.45) */
  value: number | string;
  /** Called with the new numeric value (float) */
  onValueChange: (value: number) => void;
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, value, onValueChange, ...props }, ref) => {
    // Convert numeric value to display string
    const numericValue = typeof value === "string" ? parseFloat(value) || 0 : (value || 0);
    const cents = Math.round(numericValue * 100);
    const displayValue = formatCentsToDisplay(cents);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const masked = maskCurrency(e.target.value);
      const parsed = parseCurrency(masked);
      onValueChange(parsed);
    };

    return (
      <input
        type="text"
        inputMode="numeric"
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        value={displayValue}
        onChange={handleChange}
        {...props}
      />
    );
  },
);
CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput };
