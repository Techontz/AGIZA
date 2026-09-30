/** Shapes returned by the AGIZA API (/api/app/) for the seller app. Money is always a decimal string. */

export type Paginated<T> = { count: number; page: number; page_size: number; total_pages: number; results: T[] };

export type Customer = {
  reference: string;
  full_name: string;
  email: string;
  phone: string;
  company_name: string;
  created_at: string;
};

export type Session = { access: string; refresh: string; customer: Customer };

export type Category = { id: number; name: string; slug: string; description: string; children: { id: number; name: string; slug: string }[] };

export type City = { id: number; name: string; region: string; country: string };

export type ApprovalStatus = 'pending' | 'under_review' | 'changes_requested' | 'approved' | 'rejected' | 'suspended';

export type SellerStore = {
  id: number;
  reference: string;
  slug: string;
  name: string;
  description: string;
  city: number | null;
  city_name: string | null;
  business_address: string;
  contact_person: string;
  phone: string;
  email: string;
  business_type: 'individual' | 'company' | '';
  legal_name: string;
  registration_number: string;
  tin: string;
  payout_method: 'mobile_money' | 'bank' | '';
  payout_provider: string;
  payout_account_name: string;
  payout_account_number: string;
  approval_status: ApprovalStatus;
  approval_status_display: string;
  review_note: string;
  verified: boolean;
  is_public: boolean;
  can_sell: boolean;
  can_edit_application: boolean;
  logo: string | null;
  banner: string | null;
  joined_date: string | null;
  submitted_at: string | null;
  commission: string;
  payout_schedule: string;
  history: { status: ApprovalStatus; status_display: string; note: string; at: string }[];
};

export type ListingState = 'draft' | 'pending_review' | 'published' | 'rejected' | 'inactive' | 'disabled';

export type SellerVariant = {
  id: number;
  name: string;
  sku: string;
  is_default: boolean;
  status: string;
  price: string;
  compare_at_price: string | null;
  weight_kg: string | null;
  quantity: number;
  reserved: number;
  available: number;
};

export type SellerProduct = {
  id: number;
  reference: string;
  name: string;
  sku: string;
  category: number;
  category_name: string;
  subcategory: number | null;
  brand: number | null;
  price: string;
  compare_at_price: string | null;
  status: 'draft' | 'active' | 'inactive' | 'hidden' | 'out_of_stock';
  review_status: string;
  review_note: string;
  listing_state: ListingState;
  has_variations: boolean;
  stock: number;
  available: number;
  image: string | null;
  updated_at: string;
  created_at: string;
};

export type SellerProductDetail = SellerProduct & {
  condition: string;
  condition_description: string;
  description: string;
  keywords: string;
  weight_kg: string | null;
  length_cm: string | null;
  width_cm: string | null;
  height_cm: string | null;
  ready_to_ship_days: number;
  specifications: { name: string; value: string }[];
  variants: SellerVariant[];
  images: { id: number; url: string; is_primary: boolean }[];
};

export type SellerProductInput = {
  name?: string;
  category?: number;
  subcategory?: number | null;
  condition?: string;
  description?: string;
  price?: string;
  compare_at_price?: string | null;
  weight_kg?: string;
  keywords?: string;
  status?: 'draft' | 'active' | 'inactive';
  stock?: number;
  specifications?: { name: string; value: string }[];
  has_variations?: boolean;
  variants?: { id?: number; name: string; price?: string | null; stock?: number; status?: 'active' | 'inactive' }[];
};

export type OrderIssue = {
  type: string;
  type_display: string;
  note: string;
  reported_at: string;
  resolved_at: string | null;
  resolution: string;
};

export type SellerOrder = {
  id: number;
  reference: string;
  order_reference: string;
  status: 'pending' | 'accepted' | 'ready' | 'shipped' | 'delivered' | 'cancelled';
  status_display: string;
  order_status: string;
  item_count: number;
  subtotal: string;
  commission: string;
  vendor_net: string;
  settlement_status: 'pending' | 'payable' | 'settled' | 'void';
  settlement_display: string;
  customer: string;
  delivery_city: string | null;
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  can_accept: boolean;
  can_mark_ready: boolean;
  can_report_issue?: boolean;
  issue?: OrderIssue | null;
  items?: { name: string; variant_name: string; sku: string; quantity: number; unit_price: string; line_total: string; commission: string | null }[];
  events?: { status: string; status_display: string; note: string; at: string; by_you: boolean }[];
  payout?: string | null;
};

export type SellerEarnings = {
  gross_sales: string;
  commission: string;
  net_earnings: string;
  pending: string;
  payable: string;
  paid_out: string;
  orders: number;
  in_payout?: string;
  refunds?: string;
  adjustments?: string;
};

export type SellerDashboard = {
  store: SellerStore;
  products: Record<ListingState, number>;
  earnings: SellerEarnings;
  orders_to_prepare: number;
  low_stock: number;
};

export type RefundStatus = 'not_decided' | 'pending' | 'refunded' | 'none';

export type SellerReturn = {
  reference: string;
  order_reference: string;
  status: string;
  status_display: string;
  refund_status: RefundStatus;
  reason: string;
  created_at: string;
  items: { name: string; variant_name: string; quantity: number; amount: string }[];
  explanation?: string;
  evidence?: string[];
  responses?: { message: string; at: string }[];
  can_respond?: boolean;
};

export type SellerReview = {
  id: number;
  product_id: number;
  product_name: string;
  rating: number;
  title: string;
  body: string;
  author: string;
  status: string;
  created_at: string;
  vendor_reply: string | null;
  flag_reason: string | null;
};

export type SellerReviewPage = Paginated<SellerReview> & { summary: { rating: string | null; rating_count: number } };

export type SellerPayout = {
  reference: string;
  amount: string;
  method: string;
  status: 'processing' | 'paid' | 'failed' | 'reversed';
  status_display: string;
  gross_sales: string;
  commission: string;
  refund_deductions: string;
  adjustments: string;
  transaction_reference: string;
  paid_at: string | null;
  created_at: string;
  orders: number;
};

export type LedgerLine = {
  kind: 'earning' | 'refund' | 'adjustment' | 'payout' | 'payout_reversal';
  kind_display: string;
  amount: string;
  reference: string;
  note: string;
  at: string;
};

export type SellerEarningsPage = {
  summary: SellerEarnings;
  payout_schedule: string;
  payout_account: { method: string | null; provider: string; account_name: string; account_number: string };
  payouts: SellerPayout[];
  ledger: LedgerLine[];
};

export type SellerDocument = { id: number; kind: string; kind_display: string; uploaded_at: string };

/**
 * A seller inbox message. `data` may name what to open: `order_id` / `fulfillment` (a seller order id),
 * `return` / `reference` (a return reference), `review`.
 */
export type SellerNotification = {
  id: number;
  title: string;
  body: string;
  data: { type?: string; screen?: string; order_id?: number | string; fulfillment?: number | string; return?: string; reference?: string; review?: number; [key: string]: unknown } | null;
  read: boolean;
  created_at: string;
};

export type SellerNotificationPage = Paginated<SellerNotification> & { unread: number };

/** A local file chosen with the camera, photo library or document picker, ready for a multipart upload. */
export type UploadFile = { uri: string; name: string; type: string };
