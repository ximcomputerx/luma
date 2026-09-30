import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useState } from "react";
import { glyphs } from "./glyphs";
import { Icon } from "../ui/icon";
import { cn } from "../../lib/cn";

export type FontOption = {
  value: string;
  label: string;
};

export type FontGroup = {
  label?: string;
  options: readonly FontOption[];
};

type Props = {
  label: string;
  value: string;
  groups: readonly FontGroup[];
  className?: string;
  onChange: (value: string) => void;
};

export function FontPicker({ label, value, groups, className, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const current = groups.flatMap((group) => group.options).find((option) => option.value === value);
  useEffect(() => {
    if (!open) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const selected = document.querySelector<HTMLElement>(".font-picker-menu [data-selected='true']");
      selected?.focus();
      selected?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);
  return (
    <DropdownMenu.Root modal open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger className={cn("font-picker", className)} aria-label={label}>
        <span>{current?.label ?? value}</span>
        <Icon icon={glyphs.chevronDown} size={14} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="luma-menu font-picker-menu"
          align="end"
          sideOffset={4}
          collisionPadding={8}
          aria-label={label}
        >
          {groups.map((group) =>
            group.options.length === 0 ? null : (
              <DropdownMenu.Group key={group.label ?? "fonts"}>
                {group.label ? <DropdownMenu.Label className="font-picker-label">{group.label}</DropdownMenu.Label> : null}
                {group.options.map((option) => (
                  <DropdownMenu.Item
                    key={`${group.label ?? "fonts"}:${option.value}`}
                    className="luma-menu-item font-picker-option"
                    data-selected={option.value === value ? "true" : undefined}
                    onSelect={() => onChange(option.value)}
                  >
                    {option.label}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Group>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
