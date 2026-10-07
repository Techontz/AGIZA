import { useInfiniteQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { ActivityIndicator, FlatList, useWindowDimensions, View } from 'react-native';
import { PackageSearch } from 'lucide-react-native';

import { ProductTile } from '@/components/product-tile';
import { EmptyState, ErrorState, Loading } from '@/components/ui/states';
import { shopApi, type ProductQuery } from '@/lib/api/endpoints';
import { colors, space, themed } from '@/theme/tokens';

/** Two-column, infinitely scrolling product list for any catalogue filter. */
export function ProductGrid({
  query,
  header,
  emptyMessage = 'Try another search or category.',
}: {
  query: ProductQuery;
  header?: ReactElement;
  emptyMessage?: string;
}) {
  const { width } = useWindowDimensions();
  const tile = (width - space.lg * 2 - space.md) / 2;
  const list = useInfiniteQuery({
    queryKey: ['products', 'grid', query],
    queryFn: ({ pageParam }) => shopApi.products({ ...query, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.total_pages ? last.page + 1 : undefined),
  });
  const products = list.data?.pages.flatMap((p) => p.results) ?? [];

  return (
    <FlatList
      data={products}
      keyExtractor={(p) => String(p.id)}
      numColumns={2}
      columnWrapperStyle={styles.column}
      contentContainerStyle={styles.content}
      ListHeaderComponent={header}
      renderItem={({ item }) => <ProductTile product={item} width={tile} />}
      onEndReachedThreshold={0.5}
      onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
      refreshing={list.isRefetching && !list.isFetchingNextPage}
      onRefresh={() => list.refetch()}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={
        list.isLoading ? (
          <Loading />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : (
          <EmptyState icon={PackageSearch} title="No products found" message={emptyMessage} />
        )
      }
      ListFooterComponent={
        list.isFetchingNextPage ? (
          <View style={styles.footer}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null
      }
    />
  );
}

const styles = themed(() => ({
  content: { padding: space.lg, gap: space.md, flexGrow: 1 },
  column: { gap: space.md },
  footer: { padding: space.lg },
}));
