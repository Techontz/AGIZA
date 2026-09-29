import { api } from './client';
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
  ProductDetail,
  QuoteRequest,
  Session,
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

export const shopApi = {
  config: () => api.get<AppConfig>('config/'),
  categories: () => api.get<Category[]>('categories/'),
  products: (query: { search?: string; category?: number; featured?: boolean; deals?: boolean; ordering?: string; page?: number }) =>
    api.get<Paginated<ProductCard>>('products/', query),
  product: (id: number) => api.get<ProductDetail>(`products/${id}/`),
  cities: () => api.get<City[]>('cities/'),
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
  preview: (address: number, shipping_method?: number | null) =>
    api.post<CheckoutQuote>('checkout/preview/', { address, shipping_method: shipping_method ?? null }),
  placeOrder: (data: {
    address: number;
    shipping_method: number;
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
  request_type: 'buy_for_me' | 'deliver_for_me';
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
  list: () => api.get<Paginated<QuoteRequest>>('requests/', { page_size: 50 }),
  get: (id: number) => api.get<QuoteRequest>(`requests/${id}/`),
  create: (data: RequestInput) => api.post<QuoteRequest>('requests/', data),
  accept: (id: number, note = '') => api.post<QuoteRequest>(`requests/${id}/accept/`, { note }),
  decline: (id: number, note = '') => api.post<QuoteRequest>(`requests/${id}/decline/`, { note }),
};

export const supportApi = {
  messages: () => api.get<{ messages: ChatMessage[] }>('support/messages/'),
  send: (body: string) => api.post<ChatMessage>('support/messages/', { body }),
};
