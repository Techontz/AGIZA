"use client";

import { useEffect, useRef } from "react";

/** Escape closes the modal unless a nested dialog (e.g. a confirmation) is on top of it. */
export function useDialogChrome(ref: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] === ref.current) close.current();
    };
    document.addEventListener("keydown", handler);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = overflow;
    };
  }, [ref]);
}
