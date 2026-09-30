import { cn } from "@/lib/cn";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-tile text-text",
  brand: "bg-yellow text-ink",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[12px] leading-4 font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}

export function orderTone(group: string, status: string): Tone {
  if (status === "cancelled") return "danger";
  if (group === "completed") return "success";
  if (status === "pending" || status === "pending_payment" || status === "waiting_quote") return "warning";
  return "info";
}

export function paymentTone(status: string): Tone {
  return status === "fully_paid" ? "success" : status === "partial" || status === "installment" ? "info" : "warning";
}

export const PAYMENT_LABEL: Record<string, string> = {
  unpaid: "Unpaid",
  partial: "Partly paid",
  fully_paid: "Paid",
  installment: "Installments",
};
