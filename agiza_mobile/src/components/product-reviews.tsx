/** The Reviews block on the product page: summary, a few latest reviews, and the write/edit entry. */
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { PenLine } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { RatingDistributionView } from '@/components/rating';
import { ReviewItem } from '@/components/review-card';
import { Button } from '@/components/ui/button';
import { Card, Divider, Section } from '@/components/ui/card';
import { errorMessage, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { reviewApi } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/session';
import { keys } from '@/lib/query';
import { colors, space } from '@/theme/tokens';

const PREVIEW = 3;

export const REVIEW_STATUS_NOTE: Record<string, string> = {
  pending: 'Your review is waiting to be checked before it appears.',
  flagged: 'Your review is being checked by AGIZA.',
  hidden: "Your review isn't shown to other customers.",
};

export function openWriteReview(productId: number, name: string) {
  router.push({ pathname: '/reviews/write', params: { productId, name } });
}

export function ProductReviews({ productId, name }: { productId: number; name: string }) {
  const { status } = useAuth();
  const reviews = useQuery({
    // The answer depends on who is asking (can_review, mine), so the session is part of the key.
    queryKey: [...keys.reviews(productId), status],
    queryFn: () => reviewApi.forProduct(productId),
  });
  const seeAll = () => router.push({ pathname: '/reviews/[productId]', params: { productId, name } });

  let body;
  if (reviews.isLoading) {
    body = (
      <Card style={styles.center}>
        <ActivityIndicator color={colors.brand} accessibilityLabel="Loading reviews" />
      </Card>
    );
  } else if (reviews.isError || !reviews.data) {
    body = (
      <Card style={styles.gap}>
        <Notice tone="warning">{errorMessage(reviews.error)}</Notice>
        <Button title="Try again" variant="secondary" onPress={() => reviews.refetch()} />
      </Card>
    );
  } else {
    const r = reviews.data;
    const latest = r.results.slice(0, PREVIEW);
    body = (
      <Card style={styles.gap}>
        {r.rating_count > 0 ? (
          <RatingDistributionView rating={r.rating} count={r.rating_count} distribution={r.distribution} />
        ) : (
          <Text variant="body" color={colors.textMuted}>
            No reviews yet.{r.can_review ? ' Be the first to review this product.' : ''}
          </Text>
        )}
        {r.mine && REVIEW_STATUS_NOTE[r.mine.status] ? <Notice tone="info">{REVIEW_STATUS_NOTE[r.mine.status]}</Notice> : null}
        {latest.map((review) => (
          <View key={review.id}>
            <Divider />
            <ReviewItem review={review} />
          </View>
        ))}
        {r.count > latest.length ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`See all ${r.count} reviews`}
            onPress={seeAll}
            style={styles.seeAll}>
            <Text variant="smallMedium" color={colors.primary}>
              See all {r.count} reviews
            </Text>
          </Pressable>
        ) : null}
        {r.can_review ? (
          <Button
            title={r.mine ? 'Edit your review' : 'Write a review'}
            variant="secondary"
            icon={<PenLine size={18} color={colors.ink} />}
            onPress={() => openWriteReview(productId, name)}
          />
        ) : null}
      </Card>
    );
  }

  return (
    <View style={styles.section}>
      <Section title="Reviews">{body}</Section>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: space.sm },
  center: { alignItems: 'center', paddingVertical: space.xl },
  gap: { gap: space.md },
  seeAll: { minHeight: 44, justifyContent: 'center' },
});
