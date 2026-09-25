import { AlertCircle, Lock, RefreshCw, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

import { Card } from "./card";

/** Empty state from the Figma tables ("No deliveries found" ...). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  bare,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Render without the card (inside an existing card). */
  bare?: boolean;
}) {
  const body = (
    <div className="p-12 text-center">
      <Icon className="size-12 text-gray-400 mx-auto mb-4" />
      <p className="text-gray-600 text-lg">{title}</p>
      {description && <p className="text-gray-500 text-sm mt-2">{description}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
  return bare ? body : <Card>{body}</Card>;
}

export function ErrorState({
  message,
  onRetry,
  bare,
}: {
  message?: string;
  onRetry?: () => void;
  bare?: boolean;
}) {
  const body = (
    <div className="p-12 text-center" role="alert">
      <AlertCircle className="size-12 text-red-400 mx-auto mb-4" />
      <p className="text-gray-900 text-lg font-medium">Something went wrong</p>
      <p className="text-gray-500 text-sm mt-2">{message ?? "We couldn't load this data."}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          <RefreshCw className="size-4" /> Try again
        </button>
      )}
    </div>
  );
  return bare ? body : <Card>{body}</Card>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-gray-200", className)} />;
}

export function NoAccess() {
  return (
    <div className="p-6">
      <div className="max-w-[1600px] mx-auto">
        <Card className="p-16 text-center">
          <div className="bg-gray-100 size-24 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock className="size-12 text-gray-400" />
          </div>
          <h3 className="text-2xl font-semibold text-gray-900 mb-3">No access</h3>
          <p className="text-gray-600 max-w-lg mx-auto">
            Your role doesn&apos;t include this module. Ask a Top Admin if you need access.
          </p>
        </Card>
      </div>
    </div>
  );
}
