/** Star ratings. Averages and counts always come from the server; these only draw them. */
import { Star } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';

const STAR = colors.amber;

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

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', gap: 1 },
  half: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
});
