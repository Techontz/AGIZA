import { cn } from "@/lib/cn";

/** Page width: 16px gutters on phones, comfortable margins on desktop, never wider than 1280px. */
export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}
