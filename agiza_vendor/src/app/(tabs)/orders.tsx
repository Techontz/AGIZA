import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ShoppingCart } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { Chips } from '@/components/seller/chips';
import { SuspendedBanner } from '@/components/seller/suspended-banner';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, Loading } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { sellerApi } from '@/lib/api/endpoints';
import type { SellerOrder } from '@/lib/api/types';
import { dateTime, money } from '@/lib/format';
import { keys } from '@/lib/query';
import { fulfilmentTone, ORDER_FILTERS, plural } from '@/lib/seller';
import { colors, space } from '@/theme/tokens';

type Filter = (typeof ORDER_FILTERS)[number]['value'];

export default function OrdersScreen() {
  const [status, setStatus] = useState<Filter>('open');
  const list = useInfiniteQuery({
    queryKey: keys.orders(status),
    queryFn: ({ pageParam }) => sellerApi.orders(status || undefined, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.total_pages ? last.page + 1 : undefined),
  });
  const items = list.data?.pages.flatMap((p) => p.results) ?? [];

  return (
    <View style={styles.screen}>
      <View>
        <Chips label="Order status" options={ORDER_FILTERS} value={status} onChange={setStatus} />
      </View>
      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={[styles.list, !items.length && styles.grow]}
          ListHeaderComponent={<SuspendedBanner />}
          refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => list.refetch()} colors={[colors.brand]} />}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
          onEndReachedThreshold={0.4}
          ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={colors.brand} /> : null}
          ListEmptyComponent={
            <EmptyState icon={ShoppingCart} title="No orders here" message="When customers buy your products, their orders appear here for you to prepare." />
          }
          renderItem={({ item }) => <OrderRow order={item} />}
        />
      )}
    </View>
  );
}

function OrderRow({ order: o }: { order: SellerOrder }) {
  return (
    <Card
      onPress={() => router.push({ pathname: '/orders/[id]', params: { id: String(o.id) } })}
      style={styles.row}>
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <Text variant="subheading" color={colors.ink}>
            {o.order_reference}
          </Text>
          <Badge label={o.status_display} tone={fulfilmentTone(o.status)} />
        </View>
        <Text variant="small" color={colors.textMuted}>
          {plural(o.item_count, 'item')} · {o.customer}
          {o.delivery_city ? `, ${o.delivery_city}` : ''}
        </Text>
        <Text variant="small" color={colors.textMuted}>
          {dateTime(o.created_at)}
        </Text>
        {o.issue && !o.issue.resolved_at ? <Badge label="Problem reported" tone="warning" /> : null}
      </View>
      <View style={styles.amount}>
        <Text variant="subheading" color={colors.ink}>
          {money(o.vendor_net)}
        </Text>
        <Text variant="caption" color={colors.textMuted}>
          your earnings
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: space.lg, paddingTop: space.xs, gap: space.md, paddingBottom: space.xxxl },
  grow: { flexGrow: 1 },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  flex: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  amount: { alignItems: 'flex-end' },
});
