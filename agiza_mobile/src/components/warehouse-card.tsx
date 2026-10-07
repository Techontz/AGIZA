import * as Clipboard from 'expo-clipboard';
import { Check, Copy, MapPin, Phone, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { WarehouseAddress } from '@/lib/api/types';
import { colors, fonts, radius, shadow, space, themed } from '@/theme/tokens';

/** 🇨🇳 from "CN". */
export const flag = (code: string) =>
  code.length === 2 ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '';

export function addressText(w: WarehouseAddress) {
  return [w.name, w.address, `${w.city}, ${w.country.name}`, [w.contact_person, w.phone].filter(Boolean).join(' · ')]
    .filter(Boolean)
    .join('\n');
}

/** One AGIZA receiving warehouse abroad, with a button that copies the full address for the supplier. */
export function WarehouseCard({ warehouse: w, compact }: { warehouse: WarehouseAddress; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(addressText(w));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <View style={[styles.card, compact && styles.compact]}>
      <View style={styles.head}>
        <Text style={styles.flag}>{flag(w.country.code)}</Text>
        <View style={{ flex: 1 }}>
          <Text variant="overline" color={colors.primary}>
            {w.country.name}
          </Text>
          <Text variant="subheading" color={colors.ink}>
            {w.name}
          </Text>
        </View>
      </View>
      <Line icon={MapPin} text={`${w.address}\n${w.city}, ${w.country.name}`} />
      {w.contact_person ? <Line icon={UserRound} text={w.contact_person} /> : null}
      {w.phone ? <Line icon={Phone} text={w.phone} /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Copy the ${w.country.name} address`}
        onPress={copy}
        style={({ pressed }) => [styles.copy, copied && styles.copied, pressed && { opacity: 0.85 }]}>
        {copied ? <Check size={16} color={colors.onPrimary} /> : <Copy size={16} color={colors.onPrimary} />}
        <Text style={styles.copyText} color={colors.onPrimary}>
          {copied ? 'Address copied' : 'Copy address'}
        </Text>
      </Pressable>
    </View>
  );
}

function Line({ icon: Icon, text }: { icon: typeof MapPin; text: string }) {
  return (
    <View style={styles.line}>
      <Icon size={16} color={colors.textMuted} style={{ marginTop: 2 }} />
      <Text variant="body" color={colors.text} style={{ flex: 1 }} selectable>
        {text}
      </Text>
    </View>
  );
}

const styles = themed(() => ({
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  compact: { padding: space.md, gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flag: { fontSize: 30, lineHeight: 36 },
  line: { flexDirection: 'row', gap: space.sm },
  copy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
  },
  copied: { backgroundColor: colors.brandPressed },
  copyText: { fontFamily: fonts.semibold, fontSize: 15 },
}));
