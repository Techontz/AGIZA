import { api } from "../client";
import type { Paginated } from "../types";

/* ------------------------------------------------------------------ types */

export type ClientValue = "curious" | "customer" | "repeating" | "high_value";
export type OrderKind = "international" | "shop" | "express" | "equipment";
export type TagType = "manual" | "system";
export type InterestSource = "computed" | "manual";
export type CampaignChannel = "sms" | "email" | "whatsapp";
export type CampaignActivity = "all" | "active" | "inactive";
export type CampaignStatus = "draft" | "sent" | "partial" | "not_sent" | "cancelled";

export interface ProfileOrder {
  id: number;
  reference: string;
  order_type: OrderKind;
  type: string;
  date: string;
  product: string;
  category: string;
  subcategory: string;
  amount: string | null;
  paid: string | null;
  status: string;
  status_display: string;
  origin: string;
}

export interface ProfileReturn {
  id: number;
  reference: string;
  order: string;
  date: string;
  product: string;
  amount: string | null;
  reason: string;
  status: string;
  status_display: string;
  outcome: string;
}

export interface ProfileQuotation {
  id: number;
  reference: string;
  date: string;
  product: string;
  service_type: string;
  status: string;
  status_display: string;
  message: string;
  unanswered: boolean;
  quoted_amount: string | null;
}

export interface CustomerTagLink {
  /** The customer↔tag link id (used to remove it). */
  id: number;
  name: string;
  type: TagType;
  /** Name of the tag rule that assigned a system tag. */
  rule: string | null;
  created_at: string;
}

export interface CustomerInterest {
  id: number;
  label: string;
  confidence: number;
  source: InterestSource;
  updated_at?: string;
}

export interface ProfileActivity {
  at: string;
  action: string;
  object: string;
  by: string;
  changes: Record<string, unknown> | null;
}

export interface CustomerProfile {
  customer: {
    id: number;
    reference: string;
    full_name: string;
    email: string;
    phone: string;
    company_name: string;
    status: string;
    created_at: string;
  };
  client_value: ClientValue;
  kpis: {
    total_orders: number;
    total_spent: string | null;
    returns: number;
    unanswered_quotes: number;
    last_activity_at: string | null;
  };
  orders: ProfileOrder[];
  returns: ProfileReturn[];
  quotations: ProfileQuotation[];
  tags: CustomerTagLink[];
  interests: CustomerInterest[];
  category_spend: { category: string; amount: string | null }[];
  activity: ProfileActivity[];
}

export interface CrmTag {
  id: number;
  name: string;
  customers: number;
}

export interface CampaignCriteria {
  tags: string[];
  interests: string[];
  activity: CampaignActivity;
  min_orders: number;
}

export interface CampaignEstimate {
  total: number;
  sms: number;
  whatsapp: number;
  email: number;
}

export interface CampaignOptions {
  tags: string[];
  interests: string[];
  /** Channel name → provider connected. */
  channels: Record<string, boolean>;
}

export interface CampaignInput extends CampaignCriteria {
  name: string;
  channel: CampaignChannel;
  subject: string;
  message: string;
}

export interface Campaign extends CampaignInput {
  id: number;
  reference: string;
  channel_display: string;
  status: CampaignStatus;
  status_display: string;
  audience_count: number;
  sent_count: number;
  failed_count: number;
  sent_at: string | null;
  status_note: string;
  created_by: { id: number; full_name: string } | null;
  created_at: string;
}

interface ConversationRef {
  id: number;
  customer: { id: number } | null;
}

/* -------------------------------------------------------------------- api */

export const crmApi = {
  profile: (customerId: number) => api.get<CustomerProfile>(`customers/${customerId}/profile/`),

  addTag: (customerId: number, name: string) => api.post<CustomerTagLink[]>(`customers/${customerId}/tags/`, { name }),
  removeTag: (customerId: number, linkId: number) =>
    api.delete<CustomerTagLink[]>(`customers/${customerId}/tags/?link=${linkId}`),

  interests: (customerId: number) => api.get<CustomerInterest[]>(`customers/${customerId}/interests/`),
  addInterest: (customerId: number, data: { label: string; confidence: number }) =>
    api.post<CustomerInterest[]>(`customers/${customerId}/interests/`, data),
  removeInterest: (customerId: number, id: number) =>
    api.delete<CustomerInterest[]>(`customers/${customerId}/interests/?id=${id}`),
  recomputeInterests: (customerId: number) => api.put<CustomerInterest[]>(`customers/${customerId}/interests/`),

  tags: () => api.get<CrmTag[]>("crm/tags/"),

  campaignOptions: () => api.get<CampaignOptions>("crm/campaigns/options/"),
  estimate: (criteria: CampaignCriteria) => api.post<CampaignEstimate>("crm/campaigns/estimate/", criteria),
  createCampaign: (data: CampaignInput) => api.post<Campaign>("crm/campaigns/", data),
  sendCampaign: (id: number) => api.post<Campaign>(`crm/campaigns/${id}/send/`),

  /**
   * Open the customer's open WhatsApp conversation, or start one.
   * The conversations list has no `customer` filter, so it searches by name and
   * matches on the customer id.
   */
  openConversation: async (customer: { id: number; full_name: string }): Promise<number> => {
    const existing = await api.get<Paginated<ConversationRef>>("chat/conversations/", {
      search: customer.full_name,
      status: "open",
      channel: "whatsapp",
    });
    const match = existing.results.find((c) => c.customer?.id === customer.id);
    if (match) return match.id;
    const created = await api.post<ConversationRef>("chat/conversations/start/", {
      customer: customer.id,
      channel: "whatsapp",
    });
    return created.id;
  },
};

export const crmKeys = {
  all: ["crm"] as const,
  profile: (customerId: number) => ["crm", "customer", customerId, "profile"] as const,
  interests: (customerId: number) => ["crm", "customer", customerId, "interests"] as const,
  tags: ["crm", "tags"] as const,
  campaigns: ["crm", "campaigns"] as const,
  campaignOptions: ["crm", "campaigns", "options"] as const,
  estimate: (criteria: CampaignCriteria) => ["crm", "campaigns", "estimate", criteria] as const,
};
