import { api } from './client';
import type {
  Category,
  City,
  Customer,
  Paginated,
  SellerDashboard,
  SellerDocument,
  SellerEarningsPage,
  SellerNotificationPage,
  SellerOrder,
  SellerProduct,
  SellerProductDetail,
  SellerProductInput,
  SellerReturn,
  SellerReviewPage,
  SellerStore,
  Session,
  UploadFile,
} from './types';

export const accountApi = {
  requestCode: (phone: string, purpose: 'register' | 'reset_password') =>
    api.public<{ detail: string; sms_configured: boolean }>('auth/request-code/', { phone, purpose }),
  register: (data: { phone: string; code: string; full_name: string; email?: string; password: string }) =>
    api.public<Session>('auth/register/', data),
  login: (phone: string, password: string) => api.public<Session>('auth/login/', { phone, password }),
  resetPassword: (data: { phone: string; code: string; password: string }) =>
    api.public<{ detail: string }>('auth/reset-password/', data),
  logout: (refresh: string | null, deviceToken: string | null) =>
    api.post<null>('auth/logout/', { refresh, device_token: deviceToken ?? '' }),
  me: () => api.get<Customer>('me/'),
  updateMe: (data: Partial<Pick<Customer, 'full_name' | 'email'>>) => api.patch<Customer>('me/', data),
  changePassword: (current_password: string, new_password: string) =>
    api.post<{ access: string; refresh: string }>('auth/change-password/', { current_password, new_password }),
  /** `app: "seller"` routes seller pushes (new orders, returns, reviews, payouts) to this app. */
  registerDevice: (token: string, platform: string) => api.post<null>('devices/', { token, platform, app: 'seller' }),
};

export const shopApi = {
  categories: () => api.get<Category[]>('categories/'),
  cities: () => api.get<City[]>('cities/'),
};

export type ApplicationInput = Partial<
  Pick<
    SellerStore,
    | 'name'
    | 'description'
    | 'business_address'
    | 'contact_person'
    | 'phone'
    | 'email'
    | 'business_type'
    | 'legal_name'
    | 'registration_number'
    | 'tin'
    | 'payout_method'
    | 'payout_provider'
    | 'payout_account_name'
    | 'payout_account_number'
  >
> & { city?: number | null };

export const sellerApi = {
  store: () => api.get<SellerStore>('seller/store/'),
  apply: (data: ApplicationInput) => api.post<SellerStore>('seller/store/', data),
  updateStore: (data: ApplicationInput) => api.patch<SellerStore>('seller/store/', data),
  uploadMedia: (kind: 'logo' | 'banner', file: UploadFile) => api.upload<SellerStore>(`seller/store/${kind}/`, file),
  dashboard: () => api.get<SellerDashboard>('seller/dashboard/'),
  products: (query: { search?: string; page?: number }) => api.get<Paginated<SellerProduct>>('seller/products/', query),
  product: (id: number) => api.get<SellerProductDetail>(`seller/products/${id}/`),
  createProduct: (data: SellerProductInput) => api.post<SellerProductDetail>('seller/products/', data),
  updateProduct: (id: number, data: SellerProductInput) => api.patch<SellerProductDetail>(`seller/products/${id}/`, data),
  deleteProduct: (id: number) => api.delete<{ result: 'deleted' | 'deactivated' }>(`seller/products/${id}/`),
  uploadImage: (id: number, file: UploadFile) => api.upload<SellerProductDetail>(`seller/products/${id}/images/`, file),
  makePrimary: (id: number, imageId: number) => api.post<SellerProductDetail>(`seller/products/${id}/images/${imageId}/`),
  removeImage: (id: number, imageId: number) => api.delete<SellerProductDetail>(`seller/products/${id}/images/${imageId}/`),
  setStock: (id: number, variant: number, quantity: number) =>
    api.post<SellerProductDetail>(`seller/products/${id}/stock/`, { variant, quantity }),
  orders: (status?: string, page = 1) => api.get<Paginated<SellerOrder>>('seller/orders/', { status, page, page_size: 30 }),
  order: (id: number) => api.get<SellerOrder>(`seller/orders/${id}/`),
  orderAction: (id: number, action: 'accept' | 'ready') => api.post<SellerOrder>(`seller/orders/${id}/${action}/`),
  reportIssue: (id: number, issue_type: string, note: string) =>
    api.post<SellerOrder>(`seller/orders/${id}/issue/`, { issue_type, note }),
  earnings: () => api.get<SellerEarningsPage>('seller/earnings/'),
  returns: (page = 1) => api.get<Paginated<SellerReturn>>('seller/returns/', { page, page_size: 30 }),
  return: (reference: string) => api.get<SellerReturn>(`seller/returns/${reference}/`),
  respond: (reference: string, message: string) => api.post<SellerReturn>(`seller/returns/${reference}/`, { message }),
  reviews: (page = 1) => api.get<SellerReviewPage>('seller/reviews/', { page, page_size: 30 }),
  reply: (id: number, text: string) => api.post<{ ok: boolean }>(`seller/reviews/${id}/reply/`, { text }),
  flag: (id: number, reason: string) => api.post<{ ok: boolean }>(`seller/reviews/${id}/flag/`, { reason }),
  documents: () => api.get<SellerDocument[]>('seller/documents/'),
  uploadDocument: (kind: string, file: UploadFile) => api.upload<SellerDocument[]>('seller/documents/', file, { kind }),
};

export const notificationApi = {
  list: (page = 1, page_size?: number) => api.get<SellerNotificationPage>('seller/notifications/', { page, page_size }),
  markRead: (ids?: number[]) => api.post<{ unread: number }>('seller/notifications/read/', ids ? { ids } : {}),
};
