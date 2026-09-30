import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './api/client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
    mutations: { retry: false },
  },
});

/** Every seller query starts with "seller", so one invalidation refreshes them all after a change. */
export const keys = {
  categories: ['categories'] as const,
  cities: ['cities'] as const,
  store: ['seller', 'store'] as const,
  dashboard: ['seller', 'dashboard'] as const,
  products: (search: string) => ['seller', 'products', search] as const,
  allProducts: ['seller', 'products'] as const,
  product: (id: number) => ['seller', 'product', id] as const,
  orders: (status: string) => ['seller', 'orders', status] as const,
  allOrders: ['seller', 'orders'] as const,
  order: (id: number) => ['seller', 'order', id] as const,
  earnings: ['seller', 'earnings'] as const,
  returns: ['seller', 'returns'] as const,
  returnDetail: (reference: string) => ['seller', 'return', reference] as const,
  reviews: ['seller', 'reviews'] as const,
  documents: ['seller', 'documents'] as const,
  notifications: ['seller', 'notifications'] as const,
  unread: ['seller', 'notifications', 'unread'] as const,
};
