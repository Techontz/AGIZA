/** Shapes returned by the AGIZA customer API (/api/app/). Money is always a decimal string computed by the server. */

export type Paginated<T> = { count: number; page: number; page_size: number; total_pages: number; results: T[] };

export type Seller = {
  slug: string;
  name: string;
  logo: string | null;
  verified: boolean;
  is_agiza: boolean;
  city: string | null;
};

export type Store = Seller & {
  banner: string | null;
  rating: string | null;
  rating_count?: number;
  joined: string | null;
  products_count: number | null;
  description?: string;
};

export type Customer = {
  reference: string;
  full_name: string;
  email: string;
  phone: string;
  company_name: string;
  created_at: string;
};

export type PaymentMethod = { code: "mobile_money" | "pay_later"; label: string; description: string };

export type AppConfig = {
  store_name: string;
  currency: string;
  payment_methods: PaymentMethod[];
  phone_verification: boolean;
};

export type Category = {
  id: number;
  name: string;
  slug: string;
  description: string;
  children: { id: number; name: string; slug: string }[];
};

export type ProductCard = {
  id: number;
  name: string;
  price: string;
  price_max: string;
  compare_at_price: string | null;
  image: string | null;
  brand: string | null;
  category: string;
  condition: string;
  featured: boolean;
  ofa_kali: boolean;
  in_stock: boolean;
  labels: { name: string; color: string }[];
  vendor: Seller;
  created_at: string;
  rating: string | null;
  rating_count: number;
};

export type Variant = {
  id: number;
  name: string;
  sku: string;
  is_default: boolean;
  price: string;
  compare_at_price: string | null;
  available: number;
  options: { option: string; value: string }[];
};

export type ProductDetail = ProductCard & {
  description: string;
  condition_display: string;
  condition_description: string;
  subcategory: string | null;
  images: string[];
  variants: Variant[];
  specifications: { name: string; value: string }[];
  shipping_methods: string[];
  ready_to_ship_days: number;
  allow_chat: boolean;
  rating_distribution?: Record<string, number>;
};

export type CartLine = {
  id: number | null;
  vendor: Seller;
  product_id: number;
  variant_id: number;
  name: string;
  variant_name: string;
  image: string | null;
  unit_price: string;
  quantity: number;
  line_total: string;
  available: number;
  issue: string;
};

export type CartGroup = { vendor: Seller; subtotal: string; variant_ids: number[] };

export type Cart = {
  items: CartLine[];
  groups: CartGroup[];
  item_count: number;
  subtotal: string;
  currency: string;
  has_issues: boolean;
  notes?: string[];
};

export type City = { id: number; name: string; region: string; country: string };

export type Address = {
  id: number;
  label: string;
  line1: string;
  area: string;
  city: number;
  city_name: string;
  region_name: string;
  latitude: string | null;
  longitude: string | null;
  is_default: boolean;
  one_line: string;
};

export type Shipment = { label: string; origin: string; cost: string | null };

export type ShippingOption = {
  method_id: number;
  code: string;
  name: string;
  category: string;
  description: string;
  available: boolean;
  cost: string | null;
  currency: string;
  estimated_delivery: string | null;
  carrier: string | null;
  message: string;
  shipments: Shipment[];
};

export type CheckoutQuote = {
  cart: Cart;
  shipping_options: ShippingOption[];
  selected_shipping_method: number | null;
  subtotal: string;
  shipping_fee: string | null;
  total: string | null;
  currency: string;
  payment_methods: PaymentMethod[];
  issues: string[];
  can_place_order: boolean;
};

export type TimelineStep = { key: string; label: string; at: string | null; state: "completed" | "current" | "pending" };

export type PaymentSummary = {
  total: string | null;
  paid: string;
  due: string | null;
  status: "unpaid" | "partial" | "fully_paid" | "installment";
};

export type OrderCard = {
  reference: string;
  type: "shop" | "international" | "express" | "equipment";
  type_display: string;
  status: string;
  status_display: string;
  group: "active" | "completed" | "cancelled";
  item_details: string;
  total: string | null;
  currency: string;
  payment_status: PaymentSummary["status"];
  image: string | null;
  created_at: string;
};

export type OrderSeller = {
  vendor: Seller;
  status: string;
  status_display: string;
  item_count: number;
  subtotal: string;
  shipping_fee: string;
};

export type OrderDetail = OrderCard & {
  notes: string;
  items: {
    name: string;
    variant_name: string;
    sku: string;
    quantity: number;
    unit_price: string;
    line_total: string;
    product_id: number;
    image: string | null;
    vendor?: Seller;
    item?: number;
    cancelled?: boolean;
  }[];
  payment: PaymentSummary;
  payments: { amount: string; method: string; paid_at: string; kind: string }[];
  timeline: { steps: TimelineStep[]; cancelled: boolean; cancelled_at: string | null; payment: PaymentSummary };
  delivery: {
    reference: string;
    status: string;
    status_display: string;
    scheduled_at: string | null;
    delivered_at: string | null;
  } | null;
  can_cancel: boolean;
  can_pay: boolean;
  shipping?: { address: string; city: string; area: string; method: string | null; estimated_delivery: string | null };
  amounts?: { subtotal: string; shipping_fee: string; total: string };
  payment_preference?: PaymentMethod["code"] | null;
  sellers?: OrderSeller[];
  can_return?: boolean;
  returns?: { reference: string; status_display: string; refund_status: RefundStatus }[];
  adjustments?: { amount: string; reason: string; at: string; kind?: "seller_part" | "return_refund" }[];
  international?: { service: string; source_country: string; tracking_number: string; estimated_delivery: string | null };
  cargo?: { key: string; label: string; status: "completed" | "pending"; at: string | null; expected: string | null }[];
};

export type PaymentStart = { status: string; message: string; checkout_url: string | null; reference?: string };

export type PlaceOrderResult = { order: OrderDetail; created: boolean; payment: PaymentStart | null };

export type QuoteRequest = {
  id: number;
  reference: string;
  service_type: string;
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
  responded_at: string | null;
  customer_replied_at: string | null;
  order: string | null;
  can_reply: boolean;
};

export type ChatMessage = { id: number; from: "me" | "agiza" | "system"; body: string; author: string | null; created_at: string };

// --------------------------------------------------------------------------- //
// Reviews, returns, notifications
// --------------------------------------------------------------------------- //
export type Review = {
  id: number;
  rating: number;
  title: string;
  body: string;
  author: string;
  verified_purchase: boolean;
  created_at: string;
  edited_at: string | null;
  vendor_reply: string | null;
  vendor_replied_at: string | null;
  status?: "published" | "pending" | "flagged" | "hidden";
  product_id?: number;
};

export type ReviewPage = Paginated<Review> & {
  rating: string | null;
  rating_count: number;
  distribution: Record<string, number>;
  mine: Review | null;
  can_review: boolean;
};

export type RefundStatus = "not_decided" | "pending" | "refunded" | "none";

export type ReturnSummary = {
  reference: string;
  order: string;
  status: string;
  status_display: string;
  refund_status: RefundStatus;
  reason: string;
  items: string;
  value: string;
  refund_amount: string | null;
  created_at: string;
  message: string | null;
};

export type ReturnDetail = ReturnSummary & {
  explanation: string;
  lines: { name: string; variant_name: string; quantity: number; amount: string; image: string | null }[];
  evidence: string[];
  history: { status: string; at: string }[];
  can_add_evidence: boolean;
};

export type Returnable = {
  can_return: boolean;
  window_open: boolean;
  window_days: number;
  items: { item: number; name: string; variant_name: string; quantity: number; returnable: number; unit_price: string }[];
  reasons: { code: string; label: string }[];
  returns: ReturnSummary[];
};

export type AppNotification = { id: number; title: string; body: string; data: Record<string, string>; read: boolean; created_at: string };
