import { api } from "./client";
import type {
  Address,
  AppConfig,
  Cart,
  Category,
  ChatMessage,
  CheckoutQuote,
  City,
  Customer,
  OrderCard,
  OrderDetail,
  Paginated,
  PaymentStart,
  PaymentSummary,
  PlaceOrderResult,
  ProductCard,
  QuoteRequest,
  SellerDashboard,
  SellerOrder,
  SellerProduct,
  SellerProductDetail,
  SellerStore,
} from "./types";

export type Session = {
  customer: Customer | null;
  store: { name: string; slug: string; approval_status: SellerStore["approval_status"]; can_sell: boolean } | null;
};

export const sessionApi = {
  get: () => api.auth<Session>("session", undefined, "GET"),
  login: (phone: string, password: string) => api.auth<{ customer: Customer }>("login", { phone, password }),
  register: (data: { phone: string; code: string; full_name: string; email?: string; password: string }) =>
    api.auth<{ customer: Customer }>("register", data),
  logout: () => api.auth<null>("logout"),
  requestCode: (phone: string, purpose: "register" | "reset_password") =>
    api.post<{ detail: string; sms_configured: boolean }>("auth/request-code/", { phone, purpose }),
  resetPassword: (data: { phone: string; code: string; password: string }) =>
    api.post<{ detail: string }>("auth/reset-password/", data),
  updateMe: (data: Partial<Pick<Customer, "full_name" | "email" | "company_name">>) => api.patch<Customer>("me/", data),
  changePassword: (current_password: string, new_password: string) =>
    api.post<{ detail: string }>("auth/change-password/", { current_password, new_password }),
};

export const shopApi = {
  config: () => api.get<AppConfig>("config/"),
  categories: () => api.get<Category[]>("categories/"),
  products: (query: Record<string, string | number | boolean | undefined>) => api.get<Paginated<ProductCard>>("products/", query),
  cities: () => api.get<City[]>("cities/"),
  sourcingCountries: () => api.get<{ iso2: string; name: string }[]>("sourcing-countries/"),
};

export type AddressInput = Pick<Address, "label" | "line1" | "area" | "city" | "is_default">;

export const addressApi = {
  list: () => api.get<Address[]>("addresses/"),
  create: (data: AddressInput) => api.post<Address>("addresses/", data),
  update: (id: number, data: Partial<AddressInput>) => api.patch<Address>(`addresses/${id}/`, data),
  remove: (id: number) => api.delete<null>(`addresses/${id}/`),
};

export type GuestLine = { variant: number; quantity: number };

export const cartApi = {
  get: () => api.get<Cart>("cart/"),
  add: (variant: number, quantity: number) => api.post<Cart>("cart/items/", { variant, quantity }),
  setQuantity: (item: number, quantity: number) => api.patch<Cart>(`cart/items/${item}/`, { quantity }),
  remove: (item: number) => api.delete<Cart>(`cart/items/${item}/`),
  guest: (items: GuestLine[]) => api.post<Cart>("cart/guest/", { items }),
  merge: (items: GuestLine[]) => api.post<Cart>("cart/merge/", { items }),
};

export const checkoutApi = {
  preview: (address: number, shipping_method?: number | null) =>
    api.post<CheckoutQuote>("checkout/preview/", { address, shipping_method: shipping_method ?? null }),
  placeOrder: (data: {
    address: number;
    shipping_method: number;
    payment_method: string;
    notes: string;
    idempotency_key: string;
    expected_total: string;
  }) => api.post<PlaceOrderResult>("checkout/place-order/", data),
};

export const orderApi = {
  list: (group?: string) => api.get<Paginated<OrderCard>>("orders/", { group, page_size: 50 }),
  get: (reference: string) => api.get<OrderDetail>(`orders/${reference}/`),
  cancel: (reference: string, reason: string) => api.post<OrderDetail>(`orders/${reference}/cancel/`, { reason }),
  pay: (reference: string) => api.post<PaymentStart>(`orders/${reference}/pay/`),
  checkPayment: (reference: string) =>
    api.post<{ payment: PaymentSummary; status_display: string }>(`orders/${reference}/check-payment/`),
};

export type RequestInput = {
  request_type: "buy_for_me" | "deliver_for_me";
  item_name: string;
  link?: string;
  quantity: number;
  origin_country: string;
  destination_city: number;
  weight_kg?: string | null;
  tracking_number?: string;
  details?: string;
};

export const requestApi = {
  list: () => api.get<Paginated<QuoteRequest>>("requests/", { page_size: 50 }),
  create: (data: RequestInput) => api.post<QuoteRequest>("requests/", data),
  accept: (id: number, note = "") => api.post<QuoteRequest>(`requests/${id}/accept/`, { note }),
  decline: (id: number, note = "") => api.post<QuoteRequest>(`requests/${id}/decline/`, { note }),
};

export const supportApi = {
  messages: () => api.get<{ messages: ChatMessage[] }>("support/messages/"),
  send: (body: string) => api.post<ChatMessage>("support/messages/", { body }),
};

export type ApplicationInput = Partial<
  Pick<
    SellerStore,
    | "name"
    | "description"
    | "business_address"
    | "contact_person"
    | "phone"
    | "email"
    | "business_type"
    | "legal_name"
    | "registration_number"
    | "tin"
    | "payout_method"
    | "payout_provider"
    | "payout_account_name"
    | "payout_account_number"
  >
> & { city?: number | null };

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
  status?: "draft" | "active" | "inactive";
  stock?: number;
  specifications?: { name: string; value: string }[];
  has_variations?: boolean;
  variants?: { id?: number; name: string; price?: string | null; stock?: number; status?: "active" | "inactive" }[];
};

export const sellerApi = {
  store: () => api.get<SellerStore>("seller/store/"),
  apply: (data: ApplicationInput) => api.post<SellerStore>("seller/store/", data),
  updateStore: (data: ApplicationInput) => api.patch<SellerStore>("seller/store/", data),
  uploadMedia: (kind: "logo" | "banner", file: File) => api.upload<SellerStore>(`seller/store/${kind}/`, file),
  dashboard: () => api.get<SellerDashboard>("seller/dashboard/"),
  products: (query: { search?: string; page?: number }) => api.get<Paginated<SellerProduct>>("seller/products/", query),
  product: (id: number) => api.get<SellerProductDetail>(`seller/products/${id}/`),
  createProduct: (data: SellerProductInput) => api.post<SellerProductDetail>("seller/products/", data),
  updateProduct: (id: number, data: SellerProductInput) => api.patch<SellerProductDetail>(`seller/products/${id}/`, data),
  deleteProduct: (id: number) => api.delete<{ result: "deleted" | "deactivated" }>(`seller/products/${id}/`),
  uploadImage: (id: number, file: File) => api.upload<SellerProductDetail>(`seller/products/${id}/images/`, file),
  makePrimary: (id: number, imageId: number) => api.post<SellerProductDetail>(`seller/products/${id}/images/${imageId}/`),
  removeImage: (id: number, imageId: number) => api.delete<SellerProductDetail>(`seller/products/${id}/images/${imageId}/`),
  setStock: (id: number, variant: number, quantity: number) =>
    api.post<SellerProductDetail>(`seller/products/${id}/stock/`, { variant, quantity }),
  orders: (status?: string) => api.get<Paginated<SellerOrder>>("seller/orders/", { status, page_size: 50 }),
  order: (id: number) => api.get<SellerOrder>(`seller/orders/${id}/`),
  orderAction: (id: number, action: "accept" | "ready") => api.post<SellerOrder>(`seller/orders/${id}/${action}/`),
  earnings: () => api.get<import("./types").SellerEarningsPage>("seller/earnings/"),
};

export const reviewApi = {
  list: (productId: number, page = 1) => api.get<import("./types").ReviewPage>(`products/${productId}/reviews/`, { page }),
  submit: (productId: number, data: { rating: number; title?: string; body?: string }) =>
    api.post<import("./types").Review>(`products/${productId}/reviews/`, data),
  mine: () =>
    api.get<{
      reviews: (import("./types").Review & { product_name: string })[];
      to_review: { product_id: number; name: string; order: string; image: string | null }[];
    }>("me/reviews/"),
  remove: (id: number) => api.delete<null>(`me/reviews/${id}/`),
};

export type WishlistBody = { product_ids: number[]; products: ProductCard[] };

export const wishlistApi = {
  get: () => api.get<WishlistBody>("wishlist/"),
  add: (product: number) => api.post<WishlistBody>("wishlist/", { product }),
  remove: (product: number) => api.delete<WishlistBody>(`wishlist/${product}/`),
  merge: (products: number[]) => api.post<WishlistBody>("wishlist/merge/", { products }),
};

export const notificationApi = {
  list: (page = 1) =>
    api.get<Paginated<import("./types").AppNotification> & { unread: number }>("notifications/", { page }),
  read: (ids?: number[]) => api.post<{ unread: number }>("notifications/read/", ids ? { ids } : {}),
};

export const returnApi = {
  returnable: (order: string) => api.get<import("./types").Returnable>(`orders/${order}/returns/`),
  create: (order: string, data: { lines: { item: number; quantity: number }[]; reason_code: string; explanation: string }) =>
    api.post<import("./types").ReturnDetail>(`orders/${order}/returns/`, data),
  list: () => api.get<Paginated<import("./types").ReturnSummary>>("returns/", { page_size: 50 }),
  get: (reference: string) => api.get<import("./types").ReturnDetail>(`returns/${reference}/`),
  addEvidence: (reference: string, file: File) => api.upload<import("./types").ReturnDetail>(`returns/${reference}/evidence/`, file),
};

export const sellerExtraApi = {
  reportIssue: (id: number, issue_type: string, note: string) =>
    api.post<SellerOrder>(`seller/orders/${id}/issue/`, { issue_type, note }),
  returns: () => api.get<Paginated<import("./types").SellerReturn>>("seller/returns/", { page_size: 50 }),
  return: (reference: string) => api.get<import("./types").SellerReturn>(`seller/returns/${reference}/`),
  respond: (reference: string, message: string) =>
    api.post<import("./types").SellerReturn>(`seller/returns/${reference}/`, { message }),
  reviews: () =>
    api.get<Paginated<import("./types").SellerReview> & { summary: { rating: string | null; rating_count: number } }>(
      "seller/reviews/",
      { page_size: 50 },
    ),
  reply: (id: number, text: string) => api.post<{ ok: boolean }>(`seller/reviews/${id}/reply/`, { text }),
  flag: (id: number, reason: string) => api.post<{ ok: boolean }>(`seller/reviews/${id}/flag/`, { reason }),
  documents: () => api.get<import("./types").SellerDocument[]>("seller/documents/"),
  uploadDocument: (kind: string, file: File) => {
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);
    return api.post<import("./types").SellerDocument[]>("seller/documents/", form);
  },
};
