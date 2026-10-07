/** Star ratings. Averages and counts always come from the server; these only draw them. */
import { Star } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { RatingDistribution } from '@/lib/api/types';
import { colors, radius, space, themed } from '@/theme/tokens';

const STAR = colors.amber;

function reviewsLabel(count: number) {
  return `${count} review${count === 1 ? '' : 's'}`;
}

/** Five stars filled to the nearest half of `value` (a server average like "4.5", or a review's 1–5). */
export function Stars({ value, size = 14 }: { value: string | number | null; size?: number }) {
  const n = Number(value ?? 0);
  return (
    <View style={styles.stars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[1, 2, 3, 4, 5].map((i) => {
        const full = n >= i - 0.25;
        const half = !full && n >= i - 0.75;
        return (
          <View key={i} style={{ width: size, height: size }}>
            <Star size={size} color={full || half ? STAR : colors.borderStrong} fill={full ? STAR : 'transparent'} />
            {half ? (
              <View style={[styles.half, { width: size / 2, height: size }]}>
                <Star size={size} color={STAR} fill={STAR} />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** "★ 4.5 (12)": renders nothing when there are no reviews. */
export function RatingInline({ rating, count, size = 12 }: { rating: string | null; count: number | undefined; size?: number }) {
  if (!count || !rating) return null;
  return (
    <View style={styles.inline} accessible accessibilityLabel={`Rated ${rating} out of 5, ${reviewsLabel(count)}`}>
      <Star size={size} color={STAR} fill={STAR} />
      <Text variant="caption" color={colors.ink}>
        {rating}
      </Text>
      <Text variant="caption" color={colors.textMuted}>
        ({count})
      </Text>
    </View>
  );
}

/** Stars with average and count, for the product page. */
export function RatingSummaryLine({ rating, count, onPress }: { rating: string | null; count: number; onPress?: () => void }) {
  if (!count || !rating) return null;
  return (
    <Pressable
      accessibilityRole={onPress ? 'link' : undefined}
      accessibilityLabel={`Rated ${rating} out of 5, ${reviewsLabel(count)}${onPress ? '. See reviews' : ''}`}
      onPress={onPress}
      disabled={!onPress}
      hitSlop={8}
      style={styles.line}>
      <Stars value={rating} size={16} />
      <Text variant="smallMedium" color={colors.ink}>
        {rating}
      </Text>
      <Text variant="small" color={colors.textMuted}>
        · {reviewsLabel(count)}
      </Text>
    </Pressable>
  );
}

/** Average, stars and a bar per star level. Bar widths are the server's counts shown as proportions. */
export function RatingDistributionView({
  rating,
  count,
  distribution,
}: {
  rating: string | null;
  count: number;
  distribution: RatingDistribution;
}) {
  const max = Math.max(1, ...Object.values(distribution));
  return (
    <View style={styles.summary}>
      <View style={styles.average}>
        <Text variant="title" color={colors.ink}>
          {rating ?? '—'}
        </Text>
        <Stars value={rating} size={14} />
        <Text variant="caption" color={colors.textMuted}>
          {reviewsLabel(count)}
        </Text>
      </View>
      <View style={styles.bars}>
        {['5', '4', '3', '2', '1'].map((star) => {
          const n = distribution[star] ?? 0;
          return (
            <View key={star} style={styles.barRow} accessible accessibilityLabel={`${star} stars: ${n}`}>
              <Text variant="caption" color={colors.textMuted} style={styles.barLabel}>
                {star}
              </Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${(n / max) * 100}%` }]} />
              </View>
              <Text variant="caption" color={colors.textMuted} style={styles.barCount}>
                {n}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/** 1–5 picker with 44 pt touch targets. */
export function StarPicker({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  return (
    <View style={styles.pickerWrap}>
      <View style={styles.picker} accessibilityRole="radiogroup" accessibilityLabel="Your rating">
        {[1, 2, 3, 4, 5].map((i) => (
          <Pressable
            key={i}
            accessibilityRole="radio"
            accessibilityLabel={`${i} star${i === 1 ? '' : 's'}, ${LABELS[i]}`}
            accessibilityState={{ checked: value === i }}
            onPress={() => onChange(i)}
            style={styles.pickStar}>
            <Star size={32} color={i <= value ? STAR : colors.borderStrong} fill={i <= value ? STAR : 'transparent'} />
          </Pressable>
        ))}
      </View>
      <Text variant="smallMedium" color={value ? colors.ink : colors.textMuted}>
        {value ? LABELS[value] : 'Tap a star to rate'}
      </Text>
    </View>
  );
}

const styles = themed(() => ({
  stars: { flexDirection: 'row', gap: 1 },
  half: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 14 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', minHeight: 24 },
  summary: { flexDirection: 'row', gap: space.lg, alignItems: 'center' },
  average: { alignItems: 'center', gap: 4, minWidth: 84 },
  bars: { flex: 1, gap: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  barLabel: { width: 10, textAlign: 'right' },
  barCount: { minWidth: 22, textAlign: 'right' },
  track: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radius.pill, backgroundColor: STAR },
  pickerWrap: { gap: space.xs },
  picker: { flexDirection: 'row', gap: space.xs },
  pickStar: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
}));
