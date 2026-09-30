import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useEffect, useRef, useState, type ComponentPropsWithoutRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "../../lib/cn";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogPrimitive.Root>
  );
}

type DialogContentProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  dismiss?: "explicit" | "escape";
  plain?: boolean;
  draggable?: boolean;
  onClosed?: () => void;
};

export function DialogContent({
  className,
  children,
  dismiss = "escape",
  plain = false,
  draggable = false,
  onClosed,
  style,
  onPointerDown,
  ...props
}: DialogContentProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  const placed: CSSProperties = { ...style };
  if (offset.x !== 0) {
    placed.left = `calc(50% + ${offset.x}px)`;
  }
  if (offset.y !== 0) {
    placed.top = `calc(12vh + ${offset.y}px)`;
  }
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[color-mix(in_srgb,#000_20%,transparent)]" />
      <DialogPrimitive.Content
        {...props}
        style={placed}
        className={cn("luma-dialog fixed left-1/2 top-[12vh] z-50 -translate-x-1/2", plain && "luma-dialog-plain", className)}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          if (draggable) {
            startDialogDrag(event, offset, setOffset, cleanup);
          }
        }}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (dismiss === "explicit") {
            event.preventDefault();
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onClosed?.();
        }}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function startDialogDrag(
  event: ReactPointerEvent<HTMLDivElement>,
  offset: { x: number; y: number },
  setOffset: (next: { x: number; y: number }) => void,
  cleanup: { current: (() => void) | null },
) {
  if (event.button !== 0 || !dragHandle(event.target) || !event.currentTarget.contains(event.target as Node)) {
    return;
  }
  const rect = event.currentTarget.getBoundingClientRect();
  const originX = event.clientX;
  const originY = event.clientY;
  const startX = offset.x;
  const startY = offset.y;
  const release = holdGrabCursor();
  const move = (next: PointerEvent) => {
    const left = clampPosition(rect.left + next.clientX - originX, rect.width, window.innerWidth);
    const top = clampPosition(rect.top + next.clientY - originY, rect.height, window.innerHeight);
    setOffset({
      x: Math.round(startX + left - rect.left),
      y: Math.round(startY + top - rect.top),
    });
  };
  const end = () => {
    release();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    if (cleanup.current === end) {
      cleanup.current = null;
    }
  };
  cleanup.current?.();
  cleanup.current = end;
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function dragHandle(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const handle = target.closest("[data-dialog-drag]");
  if (!handle || target.closest("button, input, select, textarea, a, label")) {
    return null;
  }
  return handle;
}

function clampPosition(position: number, size: number, viewport: number): number {
  const margin = 8;
  const fits = size + margin * 2 <= viewport;
  const min = margin;
  const max = fits ? viewport - margin - size : viewport - margin - Math.min(size, 80);
  const high = Math.max(min, max);
  return Math.min(Math.max(position, Math.min(min, high)), high);
}

function holdGrabCursor(): () => void {
  const style = document.createElement("style");
  style.textContent = "* { cursor: grabbing !important; }";
  document.head.append(style);
  const frames = [...document.getElementsByTagName("iframe")];
  for (const frame of frames) {
    frame.classList.add("pointer-events-disabled");
  }
  return () => {
    style.remove();
    for (const frame of frames) {
      frame.classList.remove("pointer-events-disabled");
    }
  };
}

export function DialogTitle({ className, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("m-0 text-[15px] font-semibold leading-[1.35] text-luma-foreground", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("mt-2 text-luma-muted", className)} {...props} />;
}
