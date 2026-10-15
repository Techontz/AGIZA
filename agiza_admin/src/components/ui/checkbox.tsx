"use client";

import { useEffect, useRef } from "react";

/** Table row / "select all" checkbox (indeterminate when only some rows are selected). */
export function Checkbox({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" className="rounded size-4 cursor-pointer" checked={checked} onChange={onChange} aria-label={label} />;
}
