import { cn } from "@/lib/cn";

/** Page width as on agizastore.com: fluid with 15px gutters on phones and 30px on desktop, up to 1680px (1620px of content, as on agizastore.com). */
export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1680px] px-[15px] lg:px-[30px]", className)}>{children}</div>;
}
