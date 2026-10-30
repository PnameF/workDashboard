"use client";
import { useSyncExternalStore } from "react";
const key = "workly-sidebar-collapsed",
  eventName = "workly-sidebar-change";
let fallback: boolean | undefined;
function snapshot() {
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null) return saved === "true";
  } catch {
    /* Keep the control usable when browser storage is unavailable. */
  }
  return fallback ?? window.matchMedia("(max-width:760px)").matches;
}
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(eventName, callback);
  window.addEventListener("resize", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(eventName, callback);
    window.removeEventListener("resize", callback);
  };
}
export function useSidebar() {
  const collapsed = useSyncExternalStore(subscribe, snapshot, () => false);
  function setCollapsed(next: boolean) {
    fallback = next;
    try {
      localStorage.setItem(key, String(next));
    } catch {
      /* Session-only fallback. */
    }
    window.dispatchEvent(new Event(eventName));
  }
  return { collapsed, setCollapsed };
}
