import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronRight, PenLine, Star } from 'lucide-react-native';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { openWriteReview, REVIEW_STATUS_NOTE } from '@/components/product-reviews';
import { ProductImage } from '@/components/product-tile';
import { Stars } from '@/components/rating';
import { Badge, type Tone } from '@/components/ui/badge';
import { Card, Divider, Section } from '@/components/ui/card';
import { EmptyState, ErrorState, Loading } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { reviewApi } from '@/lib/api/endpoints';
import { date } from '@/lib/format';
import { keys } from '@/lib/query';
import { colors, space } from '@/theme/tokens';

const STATUS: Record<string, { label: string; tone: Tone }> = {
  published: { label: 'Published', tone: 'success' },
  pending: { label: 'Waiting for approval', tone: 'warning' },
  flagged: { label: 'Being checked', tone: 'warning' },
  hidden: { label: 'Not shown', tone: 'neutral' },
};

/** My reviews and the delivered purchases still waiting for one. */
export default function MyReviewsScreen() {
  const mine = useQuery({ queryKey: keys.myReviews, queryFn: reviewApi.mine });
  if (mine.isLoading) return <Loading />;
  if (mine.isError || !mine.data) return <ErrorState error={mine.error} onRetry={() => mine.refetch()} />;
  const { reviews, to_review } = mine.data;

  if (!reviews.length && !to_review.length) {
    return (
      <EmptyState
        icon={Star}
        title="No reviews yet"
        message="Once an order is delivered, you can rate what you bought here."
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={mine.isRefetching} onRefresh={() => mine.refetch()} tintColor={colors.brand} />}>
      {to_review.length ? (
        <Section title="To review">
          <Card style={styles.list}>
            {to_review.map((item, i) => (
              <View key={`${item.product_id}-${item.order}`}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Review ${item.name}, from order ${item.order}`}
                  onPress={() => openWriteReview(item.product_id, item.name)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                  <ProductImage uri={item.image} size={48} />
                  <View style={styles.flex}>
                    <Text variant="bodyMedium" color={colors.ink} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text variant="small" color={colors.textMuted}>
                      Order {item.order}
                    </Text>
                  </View>
                  <PenLine size={18} color={colors.primary} />
                </Pressable>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {reviews.length ? (
        <Section title="Your reviews">
          {reviews.map((r) => {
            const status = STATUS[r.status] ?? { label: r.status, tone: 'neutral' as Tone };
            return (
              <Card
                key={r.id}
                onPress={() => router.push({ pathname: '/product/[id]', params: { id: r.product_id } })}
                style={styles.review}>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Text variant="bodyMedium" color={colors.ink} numberOfLines={2}>
                      {r.product_name ?? 'Product'}
                    </Text>
                    <View style={styles.meta} accessible accessibilityLabel={`${r.rating} out of 5 stars, ${date(r.created_at)}`}>
                      <Stars value={r.rating} size={13} />
                      <Text variant="caption" color={colors.textMuted}>
                        {date(r.created_at)}
                      </Text>
                    </View>
                  </View>
                  <ChevronRight size={18} color={colors.textSubtle} />
                </View>
                {r.title ? (
                  <Text variant="smallMedium" color={colors.ink} numberOfLines={1}>
                    {r.title}
                  </Text>
                ) : null}
                {r.body ? (
                  <Text variant="small" color={colors.text} numberOfLines={3}>
                    {r.body}
                  </Text>
                ) : null}
                <View style={styles.badges}>
                  <Badge label={status.label} tone={status.tone} />
                  {r.vendor_reply ? <Badge label="Seller replied" tone="info" /> : null}
                </View>
                {REVIEW_STATUS_NOTE[r.status] ? (
                  <Text variant="caption" color={colors.textMuted}>
                    {REVIEW_STATUS_NOTE[r.status]}
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit your review of ${r.product_name ?? 'this product'}`}
                  onPress={() => openWriteReview(r.product_id, r.product_name ?? '')}
                  style={styles.edit}>
                  <PenLine size={16} color={colors.primary} />
                  <Text variant="smallMedium" color={colors.primary}>
                    Edit
                  </Text>
                </Pressable>
              </Card>
            );
          })}
        </Section>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxxl },
  list: { paddingVertical: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  pressed: { opacity: 0.7 },
  flex: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  review: { gap: space.sm },
  badges: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  edit: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 44, paddingRight: space.md },
});
