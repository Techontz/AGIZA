import {
  peopleApi,
  type ActiveStatus,
  type Customer,
  type CustomerTagChip,
  type PersonRole,
  type ServiceProvider,
  type Shipper,
  type ShipperService,
  type ShopVendor,
  type StaffMember,
} from "@/lib/api/services/people";
import type { Paginated, StaffLevel } from "@/lib/api/types";

import { shipperRef } from "./shipper-edit-modal";

/** The raw record behind a table row, for the edit modals. */
export type PersonSource =
  | { kind: "customer"; data: Customer }
  | { kind: "staff"; data: StaffMember }
  | { kind: "driver"; data: StaffMember }
  | { kind: "shipper"; data: Shipper }
  | { kind: "shop_vendor"; data: ShopVendor }
  | { kind: "service_provider"; data: ServiceProvider };

/** One table row, whatever the tab. */
export interface PersonRow {
  id: number;
  ref: string;
  name: string;
  email: string;
  phone: string;
  tags: CustomerTagChip[];
  staffLevel: StaffLevel | null;
  services: ShipperService[];
  countries: string[];
  totalOrders: number;
  rating: string | null;
  status: ActiveStatus;
  joined: string | null;
  source: PersonSource;
}

function toRow(source: PersonSource): PersonRow {
  const base: Pick<PersonRow, "tags" | "staffLevel" | "services" | "countries" | "rating"> = {
    tags: [],
    staffLevel: null,
    services: [],
    countries: [],
    rating: null,
  };
  switch (source.kind) {
    case "customer": {
      const c = source.data;
      return { ...base, id: c.id, ref: c.reference, name: c.full_name, email: c.email, phone: c.phone, tags: c.tags, totalOrders: c.total_orders ?? 0, status: c.status, joined: c.created_at, source };
    }
    case "staff":
    case "driver": {
      const s = source.data;
      return { ...base, id: s.id, ref: s.employee_id, name: s.full_name, email: s.email, phone: s.phone, staffLevel: s.staff_level, totalOrders: s.total_orders ?? 0, status: s.is_active ? "active" : "inactive", joined: s.date_joined, source };
    }
    case "shipper": {
      const s = source.data;
      return { ...base, id: s.id, ref: shipperRef(s.id), name: s.name, email: s.contact_email, phone: s.contact_phone, services: s.services, countries: s.origin_names, totalOrders: s.total_orders, rating: s.rating, status: s.status, joined: s.created_at, source };
    }
    case "shop_vendor": {
      const v = source.data;
      return { ...base, id: v.id, ref: v.reference, name: v.name, email: v.email, phone: v.phone, totalOrders: v.orders_count, rating: v.rating, status: v.status, joined: v.joined_date ?? v.created_at, source };
    }
    case "service_provider": {
      const p = source.data;
      return { ...base, id: p.id, ref: p.reference, name: p.name, email: p.email, phone: p.phone, totalOrders: p.total_orders, rating: p.rating, status: p.status, joined: p.created_at, source };
    }
  }
}

function mapPage<T>(page: Paginated<T>, wrap: (t: T) => PersonSource): Paginated<PersonRow> {
  return { ...page, results: page.results.map((t) => toRow(wrap(t))) };
}

export interface PeopleQuery {
  search: string;
  status: string;
  tag: string;
  page: number;
  page_size: number;
}

/** Fetch one page of the active tab from its real endpoint. */
export function fetchPeople(role: PersonRole, q: PeopleQuery, signal?: AbortSignal): Promise<Paginated<PersonRow>> {
  const common = { search: q.search, page: q.page, page_size: q.page_size };
  const status = q.status === "active" || q.status === "inactive" ? q.status : undefined;
  switch (role) {
    case "customer":
      return peopleApi.customers.list({ ...common, status, tag: q.tag }, signal).then((p) => mapPage(p, (data) => ({ kind: "customer", data })));
    case "staff":
    case "driver":
      return peopleApi.staff
        .list({ ...common, role, is_active: status === undefined ? undefined : status === "active" }, signal)
        .then((p) => mapPage(p, (data) => (role === "driver" ? { kind: "driver", data } : { kind: "staff", data })));
    case "shipper":
      return peopleApi.shippers.list({ ...common, status }, signal).then((p) => mapPage(p, (data) => ({ kind: "shipper", data })));
    case "shop_vendor":
      return peopleApi.vendors.list({ ...common, status }, signal).then((p) => mapPage(p, (data) => ({ kind: "shop_vendor", data })));
    case "service_provider":
      return peopleApi.serviceProviders.list({ ...common, status }, signal).then((p) => mapPage(p, (data) => ({ kind: "service_provider", data })));
  }
}
