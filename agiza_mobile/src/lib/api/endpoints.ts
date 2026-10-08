import { type PickedPhoto, shrinkPhoto } from '../shrink-photo';
import { api } from './client';
import type {
  ChatRoom,
  HomeSlider,
  WarehouseAddress,
  Address,
  AppConfig,
  Cart,
  Category,
  ChatMessage,
  CheckoutQuote,
  City,
  DeliveryEstimate,
  Customer,
  MyReview,
  MyReviews,
  NotificationPage,
  OrderReturnOptions,
  OrderCard,
  OrderDetail,
  Paginated,
  PaymentStart,
  PaymentSummary,
  PlaceOrderResult,
  ProductCard,
  ProductDetail,
  ProductReviews,
  QuoteRequest,
  ReturnDetail,
  ReturnSummary,
  Session,
  Store,
  Wishlist,
} from './types';

export const accountApi = {
  requestCode: (phone: string, purpose: 'register' | 'reset_password') =>
    api.public<{ detail: string; sms_configured: boolean }>('auth/request-code/', { phone, purpose }),
  register: (data: { phone: string; code: string; full_name: string; email?: string; password: string }) =>
    api.public<Session>('auth/register/', data),
  login: (phone: string, password: string) => api.public<Session>('auth/login/', { phone, password }),
  resetPassword: (data: { phone: string; code: string; password: string }) =>
    api.public<{ detail: string }>('auth/reset-password/', data),
  logout: (refresh: string | null, deviceToken?: string | null) =>
    api.post<null>('auth/logout/', { refresh, device_token: deviceToken ?? '' }),
  me: () => api.get<Customer>('me/'),
  updateMe: (data: Partial<Pick<Customer, 'full_name' | 'email' | 'company_name'>>) => api.patch<Customer>('me/', data),
  changePassword: (current_password: string, new_password: string) =>
    api.post<{ access: string; refresh: string }>('auth/change-password/', { current_password, new_password }),
  deleteAccount: (password: string) => api.post<null>('auth/delete-account/', { password }),
  registerDevice: (token: string, platform: string) => api.post<null>('devices/', { token, platform }),
};

/** Catalogue filters. `store` is a store slug ("agiza" = sold by AGIZA). */
export type ProductQuery = {
  search?: string;
  category?: number;
  store?: string;
  featured?: boolean;
  deals?: boolean;
  ordering?: string;
  /** Only products that can be bought now. */
  in_stock?: boolean;
  /** Signed in: products from the categories AGIZA staff chose for this customer. */
  for_you?: boolean;
};

export const shopApi = {
  config: () => api.get<AppConfig>('config/'),
  categories: () => api.get<Category[]>('categories/'),
  sliders: () => api.get<HomeSlider[]>('sliders/'),
  warehouses: () => api.get<{ count: number; results: WarehouseAddress[] }>('warehouse-addresses/'),
  products: (query: ProductQuery & { page?: number }) => api.get<Paginated<ProductCard>>('products/', query),
  product: (id: number) => api.get<ProductDetail>(`products/${id}/`),
  stores: (query: { search?: string; page?: number }) => api.get<Paginated<Store>>('stores/', query),
  store: (slug: string) => api.get<Store>(`stores/${encodeURIComponent(slug)}/`),
  cities: () => api.get<City[]>('cities/'),
  deliveryEstimate: (variant: number, city: number, quantity = 1) =>
    api.get<DeliveryEstimate>('delivery-estimate/', { variant, city, quantity }),
  sourcingCountries: () => api.get<{ iso2: string; name: string }[]>('sourcing-countries/'),
};

export type AddressInput = Pick<Address, 'label' | 'line1' | 'area' | 'city' | 'is_default'> & {
  latitude?: string | null;
  longitude?: string | null;
};

export const addressApi = {
  list: () => api.get<Address[]>('addresses/'),
  get: (id: number) => api.get<Address>(`addresses/${id}/`),
  create: (data: AddressInput) => api.post<Address>('addresses/', data),
  update: (id: number, data: Partial<AddressInput>) => api.patch<Address>(`addresses/${id}/`, data),
  remove: (id: number) => api.delete<null>(`addresses/${id}/`),
};

export const cartApi = {
  get: () => api.get<Cart>('cart/'),
  add: (variant: number, quantity: number) => api.post<Cart>('cart/items/', { variant, quantity }),
  setQuantity: (item: number, quantity: number) => api.patch<Cart>(`cart/items/${item}/`, { quantity }),
  remove: (item: number) => api.delete<Cart>(`cart/items/${item}/`),
};

export const checkoutApi = {
  preview: (address: number, shipping_method?: number | null, import_method?: number | null) =>
    api.post<CheckoutQuote>('checkout/preview/', { address, shipping_method: shipping_method ?? null, import_method: import_method ?? null }),
  placeOrder: (data: {
    address: number;
    shipping_method: number;
    import_method: number | null;
    payment_method: string;
    notes: string;
    idempotency_key: string;
    expected_total: string;
  }) => api.post<PlaceOrderResult>('checkout/place-order/', data),
};

export const orderApi = {
  list: (group?: string) => api.get<Paginated<OrderCard>>('orders/', { group, page_size: 50 }),
  get: (reference: string) => api.get<OrderDetail>(`orders/${reference}/`),
  cancel: (reference: string, reason: string) => api.post<OrderDetail>(`orders/${reference}/cancel/`, { reason }),
  pay: (reference: string) => api.post<PaymentStart>(`orders/${reference}/pay/`),
  checkPayment: (reference: string) =>
    api.post<{ payment: PaymentSummary; gateway: { reference: string; status: string; amount: string }[] }>(
      `orders/${reference}/check-payment/`,
    ),
};

export type RequestInput = {
  request_type: 'buy_for_me' | 'deliver_for_me' | 'local_delivery';
  item_name: string;
  link?: string;
  quantity: number;
  origin_country?: string;
  destination_city?: number | null;
  weight_kg?: string | null;
  tracking_number?: string;
  shipping_method?: 'air' | 'sea' | '';
  details?: string;
  /** Local delivery (inside Tanzania): pickup side, the sender, and the receiver (`contact_*`). */
  pickup_city?: number | null;
  pickup_address?: string;
  dropoff_address?: string;
  sender_name?: string;
  sender_phone?: string;
  contact_name?: string;
  contact_phone?: string;
  package_size?: 'small' | 'medium' | 'large';
  /** A shop product the customer wants that is out of stock. */
  product?: number;
};

export const requestApi = {
  list: () => api.get<Paginated<QuoteRequest>>('requests/', { page_size: 50 }),
  get: (id: number) => api.get<QuoteRequest>(`requests/${id}/`),
  create: (data: RequestInput) => api.post<QuoteRequest>('requests/', data),
  addPhoto: async (id: number, photo: PickedPhoto) => {
    const small = await shrinkPhoto(photo); // a few hundred KB instead of several MB
    const form = new FormData();
    // React Native's FormData takes a {uri, name, type} file descriptor.
    form.append('file', { uri: small.uri, name: small.fileName, type: small.mimeType } as unknown as Blob);
    return api.upload<QuoteRequest>(`requests/${id}/photos/`, form);
  },
  accept: (id: number, note = '') => api.post<QuoteRequest>(`requests/${id}/accept/`, { note }),
  decline: (id: number, note = '') => api.post<QuoteRequest>(`requests/${id}/decline/`, { note }),
};

export const supportApi = {
  /** `room`: '' = general AGIZA Support, or `order:<ref>`, `quote:<id>`, `return:<ref>`. */
  messages: (room = '') => api.get<{ messages: ChatMessage[] }>('support/messages/', { room: room || undefined }),
  send: (body: string, room = '') => api.post<ChatMessage>('support/messages/', { body, room }),
  rooms: () => api.get<{ rooms: ChatRoom[] }>('support/rooms/'),
};

export type ReviewInput = { rating: number; title: string; body: string };

export const reviewApi = {
  /** Public; with a token the server also says whether I can review and returns my review. */
  forProduct: (productId: number, page = 1) => api.get<ProductReviews>(`products/${productId}/reviews/`, { page }),
  submit: (productId: number, data: ReviewInput) => api.post<MyReview>(`products/${productId}/reviews/`, data),
  mine: () => api.get<MyReviews>('me/reviews/'),
  remove: (id: number) => api.delete<null>(`me/reviews/${id}/`),
};

export const wishlistApi = {
  get: () => api.get<Wishlist>('wishlist/'),
  add: (product: number) => api.post<Wishlist>('wishlist/', { product }),
  remove: (product: number) => api.delete<Wishlist>(`wishlist/${product}/`),
};

export const notificationApi = {
  list: (page = 1, page_size?: number) => api.get<NotificationPage>('notifications/', { page, page_size }),
  /** No ids = mark everything read. */
  markRead: (ids?: number[]) => api.post<{ unread: number }>('notifications/read/', ids ? { ids } : {}),
};

export type ReturnInput = { lines: { item: number; quantity: number }[]; reason_code: string; explanation: string };

export const returnApi = {
  options: (order: string) => api.get<OrderReturnOptions>(`orders/${order}/returns/`),
  create: (order: string, data: ReturnInput) => api.post<ReturnDetail>(`orders/${order}/returns/`, data),
  list: (page = 1) => api.get<Paginated<ReturnSummary>>('returns/', { page }),
  get: (reference: string) => api.get<ReturnDetail>(`returns/${reference}/`),
};
