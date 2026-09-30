import type { Tone } from "@/components/ui/badge";
import type { ReturnSummary } from "@/lib/api/types";

export function refundTone(r: Pick<ReturnSummary, "status" | "refund_status">): Tone {
  if (r.refund_status === "refunded") return "success";
  if (r.status === "rejected") return "danger";
  if (r.refund_status === "pending") return "brand";
  return "info";
}
