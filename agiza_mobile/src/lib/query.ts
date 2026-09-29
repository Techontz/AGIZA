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

export const keys = {
  config: ['config'] as const,
  categories: ['categories'] as const,
  products: (query: object) => ['products', query] as const,
  product: (id: number) => ['product', id] as const,
  stores: (query: object) => ['stores', query] as const,
  store: (slug: string) => ['store', slug] as const,
  cities: ['cities'] as const,
  countries: ['sourcing-countries'] as const,
  cart: ['cart'] as const,
  addresses: ['addresses'] as const,
  orders: (group?: string) => ['orders', group ?? 'all'] as const,
  order: (reference: string) => ['order', reference] as const,
  requests: ['requests'] as const,
  request: (id: number) => ['request', id] as const,
  support: ['support'] as const,
};
