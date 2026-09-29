import { useInfiniteQuery } from '@tanstack/react-query';
import { Store as StoreIcon } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { SearchField } from '@/components/search-field';
import { StoreListCard } from '@/components/store';
import { EmptyState, ErrorState, Loading } from '@/components/ui/states';
import { shopApi } from '@/lib/api/endpoints';
import { keys } from '@/lib/query';
import { colors, space } from '@/theme/tokens';

/** Every store customers can buy from (AGIZA first), searchable on the server. */
export default function StoresScreen() {
  const [search, setSearch] = useState('');
  const list = useInfiniteQuery({
    queryKey: [...keys.stores({ search }), 'list'],
    queryFn: ({ pageParam }) => shopApi.stores({ search: search || undefined, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.total_pages ? last.page + 1 : undefined),
  });
  const stores = list.data?.pages.flatMap((p) => p.results) ?? [];

  return (
    <FlatList
      data={stores}
      keyExtractor={(s) => s.slug}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <SearchField placeholder="Search stores…" accessibilityLabel="Search stores" onSearch={setSearch} />
      }
      renderItem={({ item }) => <StoreListCard store={item} />}
      onEndReachedThreshold={0.5}
      onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
      refreshing={list.isRefetching && !list.isFetchingNextPage}
      onRefresh={() => list.refetch()}
      ListEmptyComponent={
        list.isLoading ? (
          <Loading />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : (
          <EmptyState
            icon={StoreIcon}
            title="No stores found"
            message={search ? 'Try another name.' : 'Stores will appear here soon.'}
          />
        )
      }
      ListFooterComponent={
        list.isFetchingNextPage ? (
          <View style={styles.footer}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, flexGrow: 1 },
  footer: { padding: space.lg },
});
