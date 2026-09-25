import { cn } from "@/lib/cn";

/** Page wrapper used by every Figma screen: `p-6` > `max-w-[1600px] mx-auto`. */
export function PageContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="p-4 sm:p-6">
      <div className={cn("max-w-[1600px] mx-auto", className)}>{children}</div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
        {description && <p className="text-gray-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
