import { Check } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { TimelineStep } from '@/lib/api/types';
import { dateTime } from '@/lib/format';
import { colors, space } from '@/theme/tokens';

/** Tracking steps from the server; only recorded events are shown as done. */
export function Timeline({ steps, cancelled }: { steps: TimelineStep[]; cancelled?: boolean }) {
  return (
    <View>
      {steps.map((step, i) => {
        const done = step.state === 'completed';
        const current = step.state === 'current';
        const last = i === steps.length - 1;
        return (
          <View key={step.key} style={styles.row} accessibilityLabel={`${step.label}: ${done ? 'done' : current ? 'in progress' : 'pending'}`}>
            <View style={styles.rail}>
              <View style={[styles.dot, done && styles.dotDone, current && styles.dotCurrent]}>
                {done ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
              </View>
              {!last ? <View style={[styles.line, done && styles.lineDone]} /> : null}
            </View>
            <View style={styles.body}>
              <Text
                variant={current ? 'subheading' : 'bodyMedium'}
                color={done || current ? colors.ink : colors.textSubtle}>
                {step.label}
              </Text>
              {step.at ? (
                <Text variant="small" color={colors.textMuted}>
                  {dateTime(step.at)}
                </Text>
              ) : current && !cancelled ? (
                <Text variant="small" color={colors.brand}>
                  In progress
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  rail: { alignItems: 'center', width: 22 },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.success, borderColor: colors.success },
  dotCurrent: { borderColor: colors.brand, borderWidth: 6 },
  line: { width: 2, flex: 1, minHeight: 24, backgroundColor: colors.border },
  lineDone: { backgroundColor: colors.success },
  body: { flex: 1, paddingBottom: space.lg, gap: 2 },
});
