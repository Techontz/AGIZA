import { FileDown } from "lucide-react";

import { fileSrc } from "@/lib/api/files";
import { cn } from "@/lib/cn";

/** Invoice / receipt PDFs of an order (opened in a new tab through the authenticated proxy). */
export function OrderDocumentLinks({ orderType, orderId, className }: { orderType: string; orderId: number; className?: string }) {
  const href = (kind: "invoice" | "receipt") => fileSrc(`orders/${orderType}/${orderId}/document?kind=${kind}`);
  const link = "inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50";
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <a href={href("invoice")} target="_blank" rel="noopener noreferrer" className={link}>
        <FileDown className="size-4" /> Invoice PDF
      </a>
      <a href={href("receipt")} target="_blank" rel="noopener noreferrer" className={link}>
        <FileDown className="size-4" /> Receipt PDF
      </a>
    </div>
  );
}
