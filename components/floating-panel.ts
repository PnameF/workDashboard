"use client";
import { useEffect, useRef, useState, type ToggleEvent } from "react";
export function useFloatingPanel(width: number) {
  const popup = useRef<HTMLDivElement>(null),
    [open, setOpen] = useState(false),
    [position, setPosition] = useState<{
      left: number;
      top: number;
      width: number;
    }>({ left: 0, top: 0, width });
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.target instanceof Node && popup.current?.contains(event.target))
        return;
      popup.current?.hidePopover();
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);
  function place(trigger: HTMLElement, height: number, matchWidth = false) {
    const r = trigger.getBoundingClientRect(),
      w = Math.min(
        innerWidth - 16,
        matchWidth ? Math.max(180, Math.min(420, r.width)) : width,
      );
    setPosition({
      width: w,
      left: Math.max(8, Math.min(r.left, innerWidth - w - 8)),
      top:
        r.bottom + height + 8 > innerHeight
          ? Math.max(8, r.top - height - 6)
          : r.bottom + 6,
    });
  }
  const onToggle = (event: ToggleEvent<HTMLDivElement>) =>
    setOpen(event.newState === "open");
  return { popup, open, position, place, onToggle };
}
