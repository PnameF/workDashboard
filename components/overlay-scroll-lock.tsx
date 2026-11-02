"use client";
import { useEffect } from "react";
import { installOverlayScrollLock } from "@/lib/overlay-scroll";
export default function OverlayScrollLock() {
  useEffect(() => installOverlayScrollLock(document, window), []);
  return null;
}
