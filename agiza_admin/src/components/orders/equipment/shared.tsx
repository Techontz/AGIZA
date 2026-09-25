import { HardHat, Monitor, Settings, ShieldCheck, Tv, Users, Wrench } from "lucide-react";

export const SERVICE_STYLE: Record<string, { box: string; boxStrong: string; icon: typeof Wrench }> = {
  installation: { box: "bg-blue-50 text-blue-600", boxStrong: "bg-blue-100 text-blue-600", icon: HardHat },
  product_setup: { box: "bg-purple-50 text-purple-600", boxStrong: "bg-purple-100 text-purple-600", icon: Tv },
  maintenance: { box: "bg-orange-50 text-orange-600", boxStrong: "bg-orange-100 text-orange-600", icon: Wrench },
  electronic_repair: { box: "bg-indigo-50 text-indigo-600", boxStrong: "bg-indigo-100 text-indigo-600", icon: Monitor },
};

export const CLASS_ICON: Record<string, typeof Wrench> = { machinery: Settings, fragile: ShieldCheck, bulk: Users, simple: Wrench };

export const STATUS_COLOR: Record<string, string> = {
  completed: "bg-green-100 text-green-700 border-green-200",
  in_progress: "bg-blue-100 text-blue-700 border-blue-200",
  on_site: "bg-blue-100 text-blue-700 border-blue-200",
  testing: "bg-blue-100 text-blue-700 border-blue-200",
  pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
  maintenance_required: "bg-red-100 text-red-700 border-red-200",
  approved: "bg-purple-100 text-purple-700 border-purple-200",
  assigned: "bg-indigo-100 text-indigo-700 border-indigo-200",
  cancelled: "bg-gray-100 text-gray-700 border-gray-200",
};

export const PAYMENT_TEXT: Record<string, [string, string]> = {
  fully_paid: ["text-green-600 font-medium", "Paid"],
  unpaid: ["text-red-600 font-medium", "Unpaid"],
  partial: ["text-orange-600 font-medium", "Partial"],
  installment: ["text-blue-600 font-medium", "Installment"],
};

export const titleCaseClass = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

/** "Feb 21, 14:00" (design: date-fns 'MMM dd, HH:mm'). */
export function shortDateTime(iso: string | null): string {
  if (!iso) return "Not scheduled";
  const d = new Date(iso);
  return `${d.toLocaleString("en-US", { month: "short" })} ${String(d.getDate()).padStart(2, "0")}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
