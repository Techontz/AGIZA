import type { QueryClient } from '@tanstack/react-query';

import { shopApi } from './api/endpoints';
import type { ProductCard, ProductDetail } from './api/types';
import { keys } from './query';

type Page = { results?: ProductCard[] };

/** The product's card from any list already loaded (home rows, grids, suggestions), if there is one. */
function findCard(qc: QueryClient, id: number): ProductCard | undefined {
  for (const [, data] of qc.getQueriesData<Page | { pages: Page[] } | ProductDetail>({ queryKey: ['products'] })) {
    const pages: Page[] = data && 'pages' in data ? data.pages : data && 'results' in data ? [data as Page] : [];
    const hit = pages.flatMap((p) => p.results ?? []).find((c) => c.id === id);
    if (hit) return hit;
  }
  for (const [, data] of qc.getQueriesData<ProductDetail>({ queryKey: ['product'] })) {
    const hit = [...(data?.related ?? []), ...(data?.bought_together ?? [])].find((c) => c.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * What the product page can show at once while the full product loads: the card the customer tapped
 * (name, photo, price), so opening a product never starts from a blank spinner.
 */
export function productPlaceholder(qc: QueryClient, id: number): ProductDetail | undefined {
  const card = findCard(qc, id);
  if (!card) return undefined;
  return {
    ...card,
    description: '',
    condition_display: card.condition === 'new' ? 'New' : card.condition,
    condition_description: '',
    subcategory: null,
    images: card.image ? [card.image] : [],
    variants: [],
    specifications: [],
    shipping_methods: [],
    ready_to_ship_days: 0,
    allow_chat: false,
  };
}

/** Start loading a product as soon as the customer touches its tile. */
export function prefetchProduct(qc: QueryClient, id: number) {
  qc.prefetchQuery({ queryKey: keys.product(id), queryFn: () => shopApi.product(id), staleTime: 60_000 });
}
