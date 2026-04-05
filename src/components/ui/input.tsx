import * as React from "react";

import { cn } from "@/lib/utils";

const SKIP_UPPERCASE_TYPES = new Set(["password", "email", "date", "datetime-local", "time", "number", "range", "color", "file", "hidden"]);

type InputProps = React.ComponentProps<"input"> & {
  preserveCase?: boolean;
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onChange, preserveCase = false, style, ...props }, ref) => {
    const shouldUppercase = !preserveCase && !SKIP_UPPERCASE_TYPES.has(type || "text");

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (shouldUppercase) {
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        e.target.value = e.target.value.toUpperCase();
        e.target.setSelectionRange(start, end);
      }
      onChange?.(e);
    };

    const resolvedStyle = preserveCase ? { ...style, textTransform: "none" as const } : style;

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        onChange={handleChange}
        style={resolvedStyle}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
