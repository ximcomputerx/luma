import { type LucideIcon, type LucideProps } from "lucide-react";
import { cn } from "../../lib/cn";

type IconProps = LucideProps & {
  icon: LucideIcon;
};

export function Icon({ icon: Glyph, size = 16, strokeWidth = 1.75, className, ...props }: IconProps) {
  return <Glyph aria-hidden="true" {...props} className={cn("icon", className)} size={size} strokeWidth={strokeWidth} />;
}
