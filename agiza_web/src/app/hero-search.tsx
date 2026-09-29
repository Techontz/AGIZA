"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function HeroSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className="mt-6 flex max-w-xl gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        router.push(term ? `/shop?q=${encodeURIComponent(term)}` : "/shop");
      }}
    >
      <label className="relative flex-1">
        <span className="sr-only">Search products</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="What are you looking for?"
          enterKeyHint="search"
          className="h-[52px] w-full rounded-md border border-line-strong bg-surface pr-3 pl-12 text-[16px] text-ink placeholder:text-subtle focus:border-brand focus:ring-3 focus:ring-primary-soft focus:outline-none"
        />
      </label>
      <button type="submit" className="h-[52px] rounded-md bg-primary px-5 text-[16px] font-semibold text-white hover:bg-primary-pressed sm:px-7">
        Search
      </button>
    </form>
  );
}
