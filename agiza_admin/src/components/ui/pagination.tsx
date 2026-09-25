import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/cn";

/** Footer bar for paginated tables. */
export function Pagination({
  page,
  pageSize,
  count,
  totalPages,
  onPageChange,
  disabled,
}: {
  page: number;
  pageSize: number;
  count: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  if (count === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, count);
  const btn =
    "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="flex flex-col gap-3 border-t border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-gray-600">
        Showing <span className="font-medium text-gray-900">{from.toLocaleString()}</span>–
        <span className="font-medium text-gray-900">{to.toLocaleString()}</span> of{" "}
        <span className="font-medium text-gray-900">{count.toLocaleString()}</span>
      </p>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="size-4" /> Previous
        </button>
        <span className={cn("text-sm text-gray-600 px-1")}>
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          className={btn}
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
