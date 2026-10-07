import { BadgeCheck, Store } from 'lucide-react-native';
import { View } from 'react-native';

import { Stars } from '@/components/rating';
import { Text } from '@/components/ui/text';
import type { Review } from '@/lib/api/types';
import { date } from '@/lib/format';
import { colors, radius, space, themed } from '@/theme/tokens';

/** One review with the seller's reply under it. */
export function ReviewItem({ review }: { review: Review }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <View accessible accessibilityLabel={`${review.rating} out of 5 stars`}>
          <Stars value={review.rating} size={14} />
        </View>
        <Text variant="caption" color={colors.textMuted}>
          {date(review.created_at)}
          {review.edited_at ? ' · edited' : ''}
        </Text>
      </View>
      {review.title ? (
        <Text variant="bodyMedium" color={colors.ink}>
          {review.title}
        </Text>
      ) : null}
      {review.body ? (
        <Text variant="body" color={colors.text}>
          {review.body}
        </Text>
      ) : null}
      <View style={styles.author}>
        <Text variant="small" color={colors.textMuted} numberOfLines={1} style={styles.shrink}>
          {review.author}
        </Text>
        {review.verified_purchase ? (
          <View style={styles.verified}>
            <BadgeCheck size={13} color={colors.success} />
            <Text variant="caption" color={colors.success}>
              Verified purchase
            </Text>
          </View>
        ) : null}
      </View>
      {review.vendor_reply ? (
        <View style={styles.reply}>
          <View style={styles.replyHead}>
            <Store size={13} color={colors.textMuted} />
            <Text variant="caption" color={colors.textMuted}>
              Seller&apos;s reply{review.vendor_replied_at ? ` · ${date(review.vendor_replied_at)}` : ''}
            </Text>
          </View>
          <Text variant="small" color={colors.text}>
            {review.vendor_reply}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = themed(() => ({
  wrap: { gap: 4, paddingVertical: space.xs },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  author: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  shrink: { flexShrink: 1 },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  reply: { marginTop: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: colors.background, gap: 4 },
  replyHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
}));
