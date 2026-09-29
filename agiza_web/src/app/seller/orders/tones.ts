import type { Tone } from "@/components/ui/badge";

export function fulfilmentTone(status: string): Tone {
  return status === "pending" ? "warning" : status === "cancelled" ? "danger" : status === "delivered" ? "success" : status === "ready" ? "brand" : "info";
}

export function settlementTone(status: string): Tone {
  return status === "payable" ? "brand" : status === "settled" ? "success" : status === "void" ? "danger" : "neutral";
}
