import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronRight, Undo2 } from 'lucide-react-native';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, Loading } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { sellerApi } from '@/lib/api/endpoints';
import type { SellerReturn } from '@/lib/api/types';
import { date, money } from '@/lib/format';
import { keys } from '@/lib/query';
import { returnTone } from '@/lib/seller';
import { colors, space } from '@/theme/tokens';

export default function ReturnsScreen() {
  const list = useInfiniteQuery({
    queryKey: keys.returns,
    queryFn: ({ pageParam }) => sellerApi.returns(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.total_pages ? last.page + 1 : undefined),
  });
  if (list.isLoading) return <Loading />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  const items = list.data?.pages.flatMap((p) => p.results) ?? [];
  return (
    <FlatList
      style={styles.screen}
      data={items}
      keyExtractor={(r) => r.reference}
      contentContainerStyle={[styles.list, !items.length && styles.grow]}
      ListHeaderComponent={
        <Text variant="small" color={colors.textMuted}>
          Customers&apos; return requests for your items. AGIZA inspects each return and decides the refund; you can add your side of the story.
        </Text>
      }
      refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => list.refetch()} colors={[colors.brand]} />}
      onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
      ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={colors.brand} /> : null}
      ListEmptyComponent={<EmptyState icon={Undo2} title="No returns" message="When a customer asks to return one of your items, it shows up here." />}
      renderItem={({ item }) => <ReturnRow item={item} />}
    />
  );
}

function ReturnRow({ item: r }: { item: SellerReturn }) {
  // Display only: the sum of the item amounts the server sent for this return.
  const total = r.items.reduce((sum, i) => sum + Number(i.amount), 0);
  return (
    <Card onPress={() => router.push({ pathname: '/returns/[reference]', params: { reference: r.reference } })} style={styles.row}>
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <Text variant="subheading" color={colors.ink}>
            {r.reference}
          </Text>
          <Badge label={r.status_display} tone={returnTone(r)} />
        </View>
        <Text variant="small" color={colors.textMuted} numberOfLines={1}>
          Order {r.order_reference} · {r.reason} · {date(r.created_at)}
        </Text>
        <Text variant="small" color={colors.text} numberOfLines={2}>
          {r.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}
        </Text>
      </View>
      <Text variant="bodyMedium" color={colors.ink}>
        {money(total)}
      </Text>
      <ChevronRight size={18} color={colors.textSubtle} />
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: space.lg, gap: space.md, paddingBottom: space.xxxl },
  grow: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
});
