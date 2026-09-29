import { Stack, useLocalSearchParams } from 'expo-router';

import { ProductGrid } from '@/components/product-grid';

/** Product list for a filter: /products?category=3&title=Phones, ?featured=1, ?deals=1. */
export default function ProductsScreen() {
  const params = useLocalSearchParams<{ category?: string; featured?: string; deals?: string; title?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: params.title || 'Products' }} />
      <ProductGrid
        query={{
          category: params.category ? Number(params.category) : undefined,
          featured: params.featured === '1' || undefined,
          deals: params.deals === '1' || undefined,
        }}
      />
    </>
  );
}
