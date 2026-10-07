import { useInfiniteQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { PenLine, Star } from 'lucide-react-native';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { openWriteReview, REVIEW_STATUS_NOTE } from '@/components/product-reviews';
import { RatingDistributionView } from '@/components/rating';
import { ReviewItem } from '@/components/review-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { reviewApi } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/session';
import { keys } from '@/lib/query';
import { colors, space, themed } from '@/theme/tokens';

/** Every visible review of a product, 20 per page. */
export default function ProductReviewsScreen() {
  const params = useLocalSearchParams<{ productId: string; name?: string }>();
  const productId = Number(params.productId);
  const { status } = useAuth();
  const list = useInfiniteQuery({
    queryKey: [...keys.reviews(productId), status, 'all'],
    queryFn: ({ pageParam }) => reviewApi.forProduct(productId, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.total_pages ? last.page + 1 : undefined),
  });

  if (list.isLoading) return <Loading />;
  if (list.isError || !list.data) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  const first = list.data.pages[0];
  const reviews = list.data.pages.flatMap((p) => p.results);

  return (
    <>
      <Stack.Screen options={{ title: 'Reviews' }} />
      <FlatList
        data={reviews}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={styles.content}
        refreshing={list.isRefetching && !list.isFetchingNextPage}
        onRefresh={() => list.refetch()}
        onEndReachedThreshold={0.5}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        ListHeaderComponent={
          <View style={styles.header}>
            {params.name ? (
              <Text variant="subheading" color={colors.ink} numberOfLines={2}>
                {params.name}
              </Text>
            ) : null}
            {first.rating_count > 0 ? (
              <Card>
                <RatingDistributionView rating={first.rating} count={first.rating_count} distribution={first.distribution} />
              </Card>
            ) : null}
            {first.mine && REVIEW_STATUS_NOTE[first.mine.status] ? (
              <Notice tone="info">{REVIEW_STATUS_NOTE[first.mine.status]}</Notice>
            ) : null}
            {first.can_review ? (
              <Button
                title={first.mine ? 'Edit your review' : 'Write a review'}
                variant="secondary"
                icon={<PenLine size={18} color={colors.ink} />}
                onPress={() => openWriteReview(productId, params.name ?? '')}
              />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Card>
            <ReviewItem review={item} />
          </Card>
        )}
        ListEmptyComponent={<EmptyState icon={Star} title="No reviews yet" message="Customers who buy this product can review it." />}
        ListFooterComponent={
          list.isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null
        }
      />
    </>
  );
}

const styles = themed(() => ({
  content: { padding: space.lg, gap: space.md, flexGrow: 1 },
  header: { gap: space.md, marginBottom: space.xs },
  footer: { padding: space.lg },
}));
