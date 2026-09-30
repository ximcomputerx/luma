import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

const buttonVariants = cva(
  "luma-btn inline-flex h-7 items-center justify-center whitespace-nowrap rounded-luma-control px-3",
  {
    variants: {
      variant: {
        primary:
          "bg-luma-accent text-[var(--luma-accent-foreground)] hover:bg-[color-mix(in_srgb,var(--luma-accent)_92%,black)]",
        secondary:
          "border border-luma-border bg-transparent text-luma-foreground hover:bg-[color-mix(in_srgb,var(--luma-text-primary)_6%,transparent)]",
        ghost:
          "bg-transparent text-luma-muted hover:bg-[color-mix(in_srgb,var(--luma-text-primary)_6%,transparent)] hover:text-luma-foreground",
        danger: "bg-transparent text-luma-danger hover:bg-[color-mix(in_srgb,var(--luma-danger)_8%,transparent)]",
      },
    },
    defaultVariants: { variant: "ghost" },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({ className, variant, asChild = false, type = "button", ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-variant={variant ?? "ghost"}
      className={cn(buttonVariants({ variant }), className)}
      {...(asChild ? props : { ...props, type })}
    />
  );
}
