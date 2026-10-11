import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary";
  size?: "default" | "sm";
};

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border-0 font-medium transition-opacity hover:opacity-85",
        variant === "default" &&
          "bg-[var(--color-primary)] text-[var(--color-on-primary)]",
        variant === "secondary" &&
          "bg-[var(--color-bubble)] text-[var(--color-text)]",
        size === "default" && "h-10 px-4 text-sm",
        size === "sm" && "h-8 px-3 text-sm",
        className
      )}
      {...props}
    />
  );
}
