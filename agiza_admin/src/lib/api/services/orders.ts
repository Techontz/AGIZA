import { api, type QueryParams } from "../client";
import type { Paginated } from "../types";

/* ------------------------------------------------------------------ types */

export interface CustomerRef {
  id: number;
  reference: string;
  full_name: string;
  phone: string;
  email: string;
}

export interface PersonRef {
  id: number;
  full_name: string;
}

export interface PaymentSummary {
  total: string | null;
  paid: string;
  due: string | null;
  status: "unpaid" | "partial" | "fully_paid" | "installment";
}

export interface Transition {
  value: string;
  label: string;
}

export interface OrderBase {
  id: number;
  reference: string;
  order_type: "express" | "international" | "equipment";
  status: string;
  status_display: string;
  customer: CustomerRef;
  item_details: string;
  department: string;
  department_display: string;
  handler: PersonRef | null;
  currency: string;
  total_amount: string | null;
  payment: PaymentSummary;
  installment_plan: boolean;
  installment_allowed: boolean;
  notes: string;
  allowed_transitions: Transition[];
  attachments_count: number;
  source_quote_reference: string | null;
  created_at: string;
  updated_at: string;
}

export type ExpressStage = "waiting_quote" | "quoted" | "in_progress" | "cancelled";

export interface ExpressOrder extends OrderBase {
  stage: ExpressStage;
  details: {
    pickup_address: string;
    pickup_city: { id: number; name: string } | null;
    delivery_address: string;
    delivery_city: { id: number; name: string } | null;
    priority: "standard" | "express" | "urgent";
    weight_kg: string | null;
    package_size: "" | "small" | "medium" | "large";
    customer_package_size: "" | "small" | "medium" | "large";
    estimated_delivery_at: string | null;
    advance_required: boolean;
    advance_amount: string | null;
    quoted_at: string | null;
    quoted_by: PersonRef | null;
    driver: PersonRef | null;
  };
}

export interface InternationalOrder extends OrderBase {
  needs_attention: boolean;
  details: {
    source_country: { id: number; iso2: string; name: string };
    order_class: "simple" | "bulk" | "machinery" | "fragile";
    service_type: "full_service" | "deliver_for_me" | "local_purchase" | "marketplace";
    service_type_display: string;
    supplier_name: string;
    tracking_number: string;
    item_cost: string | null;
    shipping_cost: string | null;
    estimated_delivery: string | null;
  };
}

export interface EquipmentOrder extends OrderBase {
  needs_attention: boolean;
  details: {
    service_type: "installation" | "product_setup" | "maintenance" | "electronic_repair";
    service_type_display: string;
    equipment: string;
    classification: "simple" | "bulk" | "machinery" | "fragile";
    city: { id: number; name: string } | null;
    site_address: string;
    technician: PersonRef | null;
    technician_assigned_at: string | null;
    expected_date: string | null;
    priority: "high" | "medium" | "low";
  };
  service_timeline: { key: string; label: string; done: boolean; at: string | null }[];
}

export interface HistoryEntry {
  id: number;
  from_status: string;
  from_status_display: string | null;
  to_status: string;
  to_status_display: string;
  changed_by: PersonRef | null;
  note: string;
  created_at: string;
}

export interface Payment {
  id: number;
  amount: string;
  currency: string;
  method: string;
  method_display: string;
  kind: string;
  kind_display: string;
  reference: string;
  paid_at: string;
  notes: string;
  recorded_by: PersonRef | null;
}

export interface Attachment {
  id: number;
  caption: string;
  content_type: string;
  url: string;
  created_at: string;
}

export interface Assignee {
  id: number;
  full_name: string;
  staff_level: string;
}

export interface Quote {
  id: number;
  reference: string;
  customer: CustomerRef;
  service_type: "express" | "international" | "equipment";
  service_type_display: string;
  description: string;
  origin: string;
  destination: string;
  status: "new" | "waiting_reply" | "answered" | "declined" | "approved" | "cancelled";
  status_display: string;
  requested_at: string;
  quoted_amount: string | null;
  currency: string;
  estimated_delivery: string | null;
  response_notes: string;
  responded_by: PersonRef | null;
  responded_at: string | null;
  customer_replied_at: string | null;
  approved_at: string | null;
  /** The (first) order the quotation became; see `created_orders` for multi-item quotations. */
  created_order: QuoteOrderRef | null;
  /** Every order created on approval: one per item for a multi-item quotation. */
  created_orders?: QuoteOrderRef[];
  /** Photos the customer added in the app (served through the authenticated proxy). */
  /** `from_agiza`: attached by staff to the quotation (the customer sees it); otherwise the customer's own. */
  /** `item`: the item line the photo belongs to (multi-item quotations). */
  photos: QuotePhoto[];
  /** "Several items, one quotation" lines; empty for a single-description quotation. */
  items?: QuoteItem[];
}

export interface QuoteOrderRef {
  id: number;
  reference: string;
  order_type: string;
}

export interface QuotePhoto {
  id: number;
  url: string;
  from_agiza?: boolean;
  item?: number | null;
}

export interface QuoteItem {
  id: number;
  position: number;
  name: string;
  quantity: number;
  link: string;
  category: string;
  notes: string;
  service: "" | "full_service" | "deliver_for_me";
  service_display: string;
  tracking_number: string;
  origin_country: number | null;
  origin_country_name: string | null;
  unit_price: string | null;
  amount: string | null;
  price_notes: string;
  photos: QuotePhoto[];
  created_order: QuoteOrderRef | null;
}

export interface Customer extends CustomerRef {
  company_name: string;
  status: "active" | "inactive";
}

/* ---------------------------------------------------------------- service */

type Kind = "express" | "international" | "equipment";

function orderResource<T extends OrderBase>(kind: Kind) {
  const base = `orders/${kind}`;
  return {
    list: (query: QueryParams, signal?: AbortSignal) => api.get<Paginated<T>>(base, query, signal),
    get: (id: number) => api.get<T>(`${base}/${id}`),
    create: (data: Record<string, unknown>) => api.post<T>(base, data),
    update: (id: number, data: Record<string, unknown>) => api.patch<T>(`${base}/${id}`, data),
    stats: () => api.get<Record<string, number>>(`${base}/stats`),
    transition: (id: number, status: string, note = "") => api.post<T>(`${base}/${id}/transition`, { status, note }),
    history: (id: number) => api.get<HistoryEntry[]>(`${base}/${id}/history`),
    payments: (id: number) => api.get<Payment[]>(`${base}/${id}/payments`),
    recordPayment: (id: number, data: Record<string, unknown>) => api.post<Payment[]>(`${base}/${id}/payments`, data),
    attachments: (id: number) => api.get<Attachment[]>(`${base}/${id}/attachments`),
    upload: (id: number, file: File, caption = "") => {
      const form = new FormData();
      form.append("file", file);
      form.append("caption", caption);
      return api.post<Attachment[]>(`${base}/${id}/attachments`, form);
    },
    assignees: (role: "driver" | "handler") => api.get<Assignee[]>(`${base}/assignees`, { role }),
  };
}

export const ordersApi = {
  express: {
    ...orderResource<ExpressOrder>("express"),
    quote: (id: number, data: Record<string, unknown>) => api.post<ExpressOrder>(`orders/express/${id}/quote`, data),
    quoteStatus: (id: number, status: "accepted" | "rejected", note = "") =>
      api.post<ExpressOrder>(`orders/express/${id}/quote-status`, { status, note }),
    assignDriver: (id: number, user: number) => api.post<ExpressOrder>(`orders/express/${id}/assign-driver`, { user }),
    packageSize: (id: number, package_size: string) =>
      api.post<ExpressOrder>(`orders/express/${id}/package-size`, { package_size }),
    suggestPrice: (id: number, method: number) =>
      api.post<{ status: string; message: string; total: string | null; total_display: string | null; rule: string | null;
        route: string | null; weight_kg: string; weight_source: string; estimated_delivery: string | null }>(
        `orders/express/${id}/suggest-price`, { method }),
  },
  international: {
    ...orderResource<InternationalOrder>("international"),
    installmentApproval: (id: number, allowed: boolean) =>
      api.post<InternationalOrder>(`orders/international/${id}/installment-approval`, { allowed }),
  },
  equipment: {
    ...orderResource<EquipmentOrder>("equipment"),
    assignTechnician: (id: number, user: number) => api.post<EquipmentOrder>(`orders/equipment/${id}/assign-technician`, { user }),
    expectedDate: (id: number, expected_date: string) =>
      api.post<EquipmentOrder>(`orders/equipment/${id}/expected-date`, { expected_date }),
  },
};

export const quotesApi = {
  list: (query: QueryParams, signal?: AbortSignal) => api.get<Paginated<Quote>>("quotes", query, signal),
  stats: () => api.get<Record<string, number>>("quotes/stats"),
  create: (data: Record<string, unknown>) => api.post<Quote>("quotes", data),
  respond: (id: number, data: Record<string, unknown>) => api.post<Quote>(`quotes/${id}/respond`, data),
  reply: (id: number, accepted: boolean, note = "") => api.post<Quote>(`quotes/${id}/reply`, { accepted, note }),
  approve: (id: number, data: Record<string, unknown>) => api.post<Quote>(`quotes/${id}/approve`, data),
  approvalDefaults: (id: number) =>
    api.get<{
      item_details: string;
      pickup_address: string;
      delivery_address: string;
      source_country: number | null;
      service_type: string | null;
      package_size: "" | "small" | "medium" | "large";
      item_count?: number;
    }>(
      `quotes/${id}/approval-defaults`,
    ),
  cancel: (id: number, note = "") => api.post<Quote>(`quotes/${id}/cancel`, { note }),
  /**
   * Attach a photo (multipart `file`, images only). By default it's part of AGIZA's answer (max 5).
   * `customerPhoto`: a photo of the customer's item that staff add at intake (max 5 per item / quotation);
   * `item`: the item line it belongs to (implies a customer photo).
   */
  addPhoto: (id: number, file: File, opts: { customerPhoto?: boolean; item?: number } = {}) => {
    const form = new FormData();
    form.append("file", file);
    if (opts.customerPhoto) form.append("customer_photo", "true");
    if (opts.item) form.append("item", String(opts.item));
    return api.post<Quote>(`quotes/${id}/photos`, form);
  },
  removePhoto: (id: number, photoId: number) => api.delete<Quote>(`quotes/${id}/photos/${photoId}`),
};

export const customersApi = {
  search: (search: string) => api.get<Paginated<Customer>>("customers", { search, page_size: 8, status: "active" }),
  create: (data: { full_name: string; phone?: string; email?: string }) => api.post<Customer>("customers", data),
};

/** Proxy URL for an attachment (served by Django through the session). */
export const attachmentSrc = (a: Attachment) => `/api/proxy/${a.url}`;

export const orderKeys = {
  all: ["orders"] as const,
  list: (kind: string, query: object) => ["orders", kind, "list", query] as const,
  stats: (kind: string) => ["orders", kind, "stats"] as const,
  one: (kind: string, id: number) => ["orders", kind, "one", id] as const,
  sub: (kind: string, id: number, what: string) => ["orders", kind, "one", id, what] as const,
  quotes: ["quotes"] as const,
};
