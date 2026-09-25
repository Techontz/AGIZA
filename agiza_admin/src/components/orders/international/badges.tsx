import { cn } from "@/lib/cn";

const pill = "px-3 py-1 rounded-full text-xs font-medium inline-block w-fit whitespace-nowrap";

export const ORIGIN: Record<string, [string, string]> = {
  CN: ["bg-red-100 text-red-800", "China"],
  GB: ["bg-blue-100 text-blue-800", "United Kingdom"],
  US: ["bg-indigo-100 text-indigo-800", "United States"],
  AE: ["bg-amber-100 text-amber-800", "Dubai, UAE"],
  IN: ["bg-orange-100 text-orange-800", "India"],
};
export const STATUS: Record<string, string> = {
  pending_payment: "bg-yellow-100 text-yellow-800",
  issue_pending_payment: "bg-red-100 text-red-800",
  supplier_confirmed: "bg-blue-100 text-blue-800",
  paid_supplier: "bg-green-100 text-green-800",
  in_production: "bg-purple-100 text-purple-800",
  sent_to_consolidation: "bg-indigo-100 text-indigo-800",
  shipping_to_destination: "bg-cyan-100 text-cyan-800",
  clearance: "bg-orange-100 text-orange-800",
  ready_for_collection: "bg-emerald-100 text-emerald-800",
  completed: "bg-gray-100 text-gray-800",
  cancelled: "bg-gray-100 text-gray-500",
};
const ORDER_TYPE: Record<string, string> = {
  simple: "bg-gray-100 text-gray-800",
  bulk: "bg-blue-100 text-blue-800",
  machinery: "bg-purple-100 text-purple-800",
  fragile: "bg-red-100 text-red-800",
};
const PAYMENT: Record<string, [string, string]> = {
  fully_paid: ["bg-green-100 text-green-800", "Fully Paid"],
  partial: ["bg-yellow-100 text-yellow-800", "Partial"],
  unpaid: ["bg-red-100 text-red-800", "Unpaid"],
  installment: ["bg-blue-100 text-blue-800", "Installment"],
};
const SERVICE: Record<string, [string, string]> = {
  full_service: ["bg-blue-100 text-blue-800", "Full Service (Agiza sourcing)"],
  deliver_for_me: ["bg-green-100 text-green-800", "Deliver for Me"],
  local_purchase: ["bg-purple-100 text-purple-800", "Local Purchase"],
  marketplace: ["bg-orange-100 text-orange-800", "Marketplace"],
};
const DEPARTMENT: Record<string, [string, string]> = {
  unassigned: ["bg-gray-100 text-gray-800", "Unassigned"],
  procurement: ["bg-blue-100 text-blue-800", "Procurement"],
  shipping: ["bg-purple-100 text-purple-800", "Shipping"],
  delivery: ["bg-green-100 text-green-800", "Delivery"],
};

export const OriginBadge = ({ iso2 }: { iso2: string }) => {
  const [c, l] = ORIGIN[iso2] ?? ["bg-gray-100 text-gray-800", iso2];
  return <span className={cn(pill, c)}>{l}</span>;
};
export const StatusBadge = ({ status, label }: { status: string; label: string }) => (
  <span className={cn(pill, STATUS[status] ?? "bg-gray-100 text-gray-800")}>{label}</span>
);
export const OrderTypeBadge = ({ type }: { type: string }) => (
  <span className={cn("px-2 py-1 rounded text-xs font-medium", ORDER_TYPE[type])}>{type.toUpperCase()}</span>
);
export const PaymentBadge = ({ status }: { status: string }) => {
  const [c, l] = PAYMENT[status];
  return <span className={cn(pill, c)}>{l}</span>;
};
export const ServiceBadge = ({ type }: { type: string }) => {
  const [c, l] = SERVICE[type];
  return <span className={cn(pill, c)}>{l}</span>;
};
export const DepartmentBadge = ({ dept }: { dept: string }) => {
  const [c, l] = DEPARTMENT[dept] ?? ["bg-gray-100 text-gray-800", dept];
  return <span className={cn(pill, c)}>{l}</span>;
};
