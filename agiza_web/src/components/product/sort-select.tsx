"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function SortSelect({ value, options }: { value: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-[14px] text-muted">
      <span className="hidden sm:inline">Sort</span>
      <select
        value={value}
        aria-label="Sort products"
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set("sort", e.target.value);
          next.delete("page");
          router.push(`${pathname}?${next.toString()}`);
        }}
        className="h-10 min-w-40 rounded-sm border border-line-strong bg-surface px-3 text-[14px] text-ink focus:border-ink focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
