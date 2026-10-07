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
  /** Imported product: the country it ships from (bought abroad after payment). Null when held in Tanzania. */
  ships_from: string | null;
  /** Out of stock and AGIZA takes requests for it ("Pata Bei"): show "Request this product". */
  can_request?: boolean;
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
  imported: boolean;
  origin: string | null;
};

export type CartGroup = { vendor: Seller; subtotal: string; variant_ids: number[] };

export type Cart = {
  items: CartLine[];
  groups: CartGroup[];
  item_count: number;
  subtotal: string;
  currency: string;
  has_issues: boolean;
  has_imported?: boolean;
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
  eta_min_days: number | null;
  eta_max_days: number | null;
  shipments: Shipment[];
  /** Nothing can be priced for the address: orderable, and AGIZA confirms the delivery cost afterwards (cost null). */
  manual_quote?: boolean;
};

/**
 * shipping_fee = import_fee (imported items: abroad → Tanzania) + delivery_fee (to the address).
 * Orders with imported items are paid when placed (prepayment_required: mobile money only).
 */
export type CheckoutQuote = {
  cart: Cart;
  shipping_options: ShippingOption[];
  selected_shipping_method: number | null;
  import_options: ShippingOption[];
  selected_import_method: number | null;
  subtotal: string;
  import_fee: string;
  delivery_fee: string | null;
  shipping_fee: string | null;
  total: string | null;
  currency: string;
  estimated_delivery: string | null;
  /** Customs charged in the total (Shipping Engine import-charge rules). */
  customs_fee: string;
  /** Null when nothing is imported. */
  customs: Customs | null;
  /** Orders with imported items must be paid within this many hours or they are cancelled. */
  payment_window_hours: number | null;
  payment_methods: PaymentMethod[];
  prepayment_required: boolean;
  issues: string[];
  can_place_order: boolean;
  /** The chosen delivery's cost is set by AGIZA after ordering: delivery_fee/shipping_fee null, total excludes it. */
  delivery_fee_pending?: boolean;
};

export type CustomsLine = {
  kind: string;
  kind_display: string;
  name: string;
  treatment: "included" | "estimate";
  amount: string;
};

/**
 * Customs / import charges, computed by the server. status: included (all in the total),
 * estimated (some shown as estimates, paid separately), not_included (no rule: payable separately).
 */
export type Customs = {
  lines: CustomsLine[];
  included: string;
  estimate: string;
  status: "included" | "estimated" | "not_included";
  note: string;
  uncovered: string[];
};

export type DeliveryEstimate = {
  imported: boolean;
  ships_from: string | null;
  hub: string | null;
  import_options: ShippingOption[];
  shipping_options: ShippingOption[];
  /** Customs for this item (same calculation as checkout); null when not imported. */
  customs: Customs | null;
  currency: string;
  prepayment_required: boolean;
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
  /** Waiting for AGIZA to set the delivery cost (manual quote): the order can't be paid until then. */
  delivery_fee_pending?: boolean;
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
    sourced_abroad?: boolean;
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
    /** The driver bringing the order (once assigned). */
    driver?: { name: string; phone: string } | null;
    received_by?: string | null;
    /** Proof-of-delivery photos (signed-in owner only; loaded through the proxy). */
    photos?: { id: number; url: string }[];
  } | null;
  can_cancel: boolean;
  can_pay: boolean;
  shipping?: {
    address: string;
    city: string;
    area: string;
    method: string | null;
    estimated_delivery: string | null;
    import_method?: string | null;
    import_fee?: string;
  };
  prepayment_required?: boolean;
  /** Prepaid orders: cancelled if not fully paid by then. */
  payment_due_at?: string | null;
  customs?: Customs | null;
  amounts?: { subtotal: string; shipping_fee: string; import_fee?: string; customs_fee?: string; total: string };
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

export type GuestPlaceOrderResult = PlaceOrderResult & { token: string };

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
