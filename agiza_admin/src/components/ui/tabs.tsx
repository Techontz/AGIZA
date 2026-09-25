import { cn } from "@/lib/cn";

export interface TabOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Active colour, e.g. "bg-orange-600". Defaults to the design's blue-600. */
  activeClass?: string;
}

/** Pill tab row from the Figma filter cards. */
export function PillTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap" role="tablist">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2",
            value === opt.value
              ? cn(opt.activeClass ?? "bg-blue-600", "text-white")
              : "bg-gray-100 text-gray-700 hover:bg-gray-200",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Underlined tabs (detail panels, Shipping Engine, Warehouse). */
export function UnderlineTabs<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-2 border-b border-gray-200 overflow-x-auto no-scrollbar", className)} role="tablist">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-4 py-2 font-medium transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap",
            value === opt.value
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-600 hover:text-gray-900",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
