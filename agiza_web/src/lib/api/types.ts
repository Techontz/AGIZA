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
// Seller (vendor) area
// --------------------------------------------------------------------------- //
export type ApprovalStatus = "pending" | "under_review" | "changes_requested" | "approved" | "rejected" | "suspended";

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
  business_type: "individual" | "company" | "";
  legal_name: string;
  registration_number: string;
  tin: string;
  payout_method: "mobile_money" | "bank" | "";
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

export type ListingState = "draft" | "pending_review" | "published" | "rejected" | "inactive" | "disabled";

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
  status: "draft" | "active" | "inactive" | "hidden" | "out_of_stock";
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

export type SellerOrder = {
  id: number;
  reference: string;
  order_reference: string;
  status: "pending" | "accepted" | "ready" | "shipped" | "delivered" | "cancelled";
  status_display: string;
  order_status: string;
  item_count: number;
  subtotal: string;
  commission: string;
  vendor_net: string;
  settlement_status: "pending" | "payable" | "settled" | "void";
  settlement_display: string;
  customer: string;
  delivery_city: string | null;
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  can_accept: boolean;
  can_mark_ready: boolean;
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
};

export type SellerDashboard = {
  store: SellerStore;
  products: Record<ListingState, number>;
  earnings: SellerEarnings;
  orders_to_prepare: number;
  low_stock: number;
};
