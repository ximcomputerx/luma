import * as SeparatorPrimitive from "@radix-ui/react-separator";
import { type ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/cn";

export function Separator({
  className,
  orientation = "vertical",
  decorative = true,
  ...props
}: ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      orientation={orientation}
      decorative={decorative}
      className={cn(orientation === "vertical" ? "tool-sep" : "h-px bg-luma-border", className)}
      {...props}
    />
  );
}
