"use client";

import type { PersonRole } from "@/lib/api/services/people";
import { formatDate } from "@/lib/format";

import type { PersonRow } from "./rows";
import { Rating, StaffLevelBadge, StatusPill, TagChips, serviceLabel } from "./shared";

const th = "px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap";
const td = "px-6 py-4";

type Column = "id" | "name" | "contact" | "level" | "services" | "countries" | "orders" | "rating" | "status" | "joined" | "actions";

/** Columns per tab, as in the design. */
export function columnsFor(role: PersonRole): Column[] {
  const cols: Column[] = ["id", "name", "contact"];
  if (role === "staff") cols.push("level");
  if (role === "shipper") cols.push("services", "countries");
  if (role === "customer" || role === "service_provider" || role === "driver" || role === "shop_vendor") cols.push("orders");
  if (role === "service_provider" || role === "shop_vendor" || role === "shipper") cols.push("rating");
  cols.push("status", "joined", "actions");
  return cols;
}

const HEADERS: Record<Column, string> = {
  id: "ID",
  name: "Name",
  contact: "Contact",
  level: "Staff Level",
  services: "Services",
  countries: "Countries",
  orders: "Total Orders",
  rating: "Rating",
  status: "Status",
  joined: "Joined Date",
  actions: "Actions",
};

export function PeopleTable({
  role,
  rows,
  loading,
  canEdit,
  onOpen,
}: {
  role: PersonRole;
  rows: PersonRow[];
  loading: boolean;
  /** Whether the "Edit" action is available on this tab (customers always show "View Details"). */
  canEdit: boolean;
  onOpen: (row: PersonRow) => void;
}) {
  const cols = columnsFor(role);
  const isCustomer = role === "customer";
  const actionable = isCustomer || canEdit;

  const cell = (c: Column, p: PersonRow) => {
    switch (c) {
      case "id":
        return <div className="font-semibold text-gray-900 whitespace-nowrap">{p.ref}</div>;
      case "name":
        return (
          <>
            <div className="font-medium text-gray-900">{p.name}</div>
            {isCustomer && <TagChips tags={p.tags} />}
          </>
        );
      case "contact":
        return (
          <>
            <div className="text-sm text-gray-900">{p.email || "—"}</div>
            <div className="text-sm text-gray-500 whitespace-nowrap">{p.phone}</div>
          </>
        );
      case "level":
        return p.staffLevel && <StaffLevelBadge level={p.staffLevel} />;
      case "services":
        return p.services.length ? (
          <div className="space-y-1">
            {p.services.map((s) => (
              <div key={s} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded inline-block mr-1 whitespace-nowrap">
                {serviceLabel(s)}
              </div>
            ))}
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        );
      case "countries":
        return <div className="text-sm text-gray-900">{p.countries.length ? p.countries.join(", ") : <span className="text-gray-400">—</span>}</div>;
      case "orders":
        return <div className="font-semibold text-gray-900">{p.totalOrders.toLocaleString()}</div>;
      case "rating":
        return <Rating value={p.rating} />;
      case "status":
        return <StatusPill status={p.status} />;
      case "joined":
        return <span className="text-sm text-gray-900 whitespace-nowrap">{formatDate(p.joined)}</span>;
      case "actions":
        return actionable ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(p);
            }}
            className="text-blue-600 hover:text-blue-800 font-medium text-sm whitespace-nowrap"
            aria-label={`${isCustomer ? "View details of" : "Edit"} ${p.name}`}
          >
            {isCustomer ? "View Details" : "Edit"}
          </button>
        ) : (
          <span className="text-gray-400 text-sm">—</span>
        );
    }
  };

  return (
    <div className="relative overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {cols.map((c) => (
              <th key={c} scope="col" className={th}>
                {HEADERS[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c} className={td}>
                      <div className="h-4 rounded bg-gray-200 animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((p) => (
                <tr
                  key={p.id}
                  className={actionable ? "hover:bg-gray-50 transition-colors cursor-pointer" : "hover:bg-gray-50 transition-colors"}
                  onClick={actionable ? () => onOpen(p) : undefined}
                >
                  {cols.map((c) => (
                    <td key={c} className={td}>
                      {cell(c, p)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
