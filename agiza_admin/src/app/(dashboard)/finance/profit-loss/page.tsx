import { redirect } from "next/navigation";

/** Profit & Loss moved to Reporting & Audit Logs; old links still work. */
export default function Page() {
  redirect("/audit-logs?tab=profit-loss");
}
