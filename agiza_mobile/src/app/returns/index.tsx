import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { PackageX } from 'lucide-react-native';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, Loading } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { returnApi } from '@/lib/api/endpoints';
import { date, money } from '@/lib/format';
import { keys } from '@/lib/query';
import { REFUND_LABEL, refundTone, returnTone } from '@/lib/returns';
import { colors, space, themed } from '@/theme/tokens';

/** Every return request I made, newest first. */
export default function ReturnsScreen() {
  const list = useInfiniteQuery({
    queryKey: [...keys.returns, 'list'],
    queryFn: ({ pageParam }) => returnApi.list(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.total_pages ? last.page + 1 : undefined),
  });
  if (list.isLoading) return <Loading />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  const returns = list.data?.pages.flatMap((p) => p.results) ?? [];

  return (
    <FlatList
      data={returns}
      keyExtractor={(r) => r.reference}
      contentContainerStyle={styles.list}
      refreshing={list.isRefetching && !list.isFetchingNextPage}
      onRefresh={() => list.refetch()}
      onEndReachedThreshold={0.5}
      onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
      renderItem={({ item }) => (
        <Card
          onPress={() =>
            router.push({
              pathname: '/returns/[reference]',
              params: { reference: item.reference },
            })
          }>
          <View style={styles.top}>
            <Text variant="small" color={colors.textMuted} numberOfLines={1} style={styles.shrink}>
              {item.reference} · Order {item.order}
            </Text>
            <Text variant="small" color={colors.textMuted}>
              {date(item.created_at)}
            </Text>
          </View>
          <Text variant="subheading" color={colors.ink} numberOfLines={2} style={styles.items}>
            {item.items}
          </Text>
          <Text variant="small" color={colors.textMuted} numberOfLines={1}>
            {item.reason}
          </Text>
          <View style={styles.badges}>
            <Badge label={item.status_display} tone={returnTone(item.status_display)} />
            {(item.refund_status === 'pending' || item.refund_status === 'refunded') &&
            REFUND_LABEL[item.refund_status] !== item.status_display ? (
              <Badge label={REFUND_LABEL[item.refund_status]} tone={refundTone(item.refund_status)} />
            ) : null}
            <View style={styles.spacer} />
            <Text variant="smallMedium" color={colors.ink}>
              {money(item.refund_amount ?? item.value)}
            </Text>
          </View>
        </Card>
      )}
      ListEmptyComponent={
        <EmptyState
          icon={PackageX}
          title="No returns"
          message="If something you received is damaged or not right, open the order and tap Return items."
        />
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
  list: { padding: space.lg, gap: space.md, flexGrow: 1 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  shrink: { flexShrink: 1 },
  items: { marginVertical: 4 },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.sm,
    flexWrap: 'wrap',
  },
  spacer: { flex: 1 },
  footer: { padding: space.lg },
}));
