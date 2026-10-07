import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './api/client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Screens show what they already have instantly and refresh quietly in the background.
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
    mutations: { retry: false },
  },
});

export const keys = {
  config: ['config'] as const,
  categories: ['categories'] as const,
  products: (query: object) => ['products', query] as const,
  product: (id: number) => ['product', id] as const,
  stores: (query: object) => ['stores', query] as const,
  store: (slug: string) => ['store', slug] as const,
  cities: ['cities'] as const,
  countries: ['sourcing-countries'] as const,
  sliders: ['sliders'] as const,
  cart: ['cart'] as const,
  addresses: ['addresses'] as const,
  orders: (group?: string) => ['orders', group ?? 'all'] as const,
  order: (reference: string) => ['order', reference] as const,
  requests: ['requests'] as const,
  request: (id: number) => ['request', id] as const,
  support: ['support'] as const,
  supportRoom: (room: string) => ['support', 'room', room] as const,
  supportRooms: ['support', 'rooms'] as const,
  warehouses: ['warehouse-addresses'] as const,
  reviews: (productId: number) => ['reviews', productId] as const,
  myReviews: ['reviews', 'mine'] as const,
  wishlist: ['wishlist'] as const,
  notifications: ['notifications'] as const,
  unread: ['notifications', 'unread'] as const,
  returns: ['returns'] as const,
  returnDetail: (reference: string) => ['returns', 'detail', reference] as const,
  returnOptions: (order: string) => ['returns', 'options', order] as const,
};
