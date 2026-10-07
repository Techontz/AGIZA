import { router } from 'expo-router';
import { ShoppingBag } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useCart } from '@/hooks/use-cart';
import { colors, fonts, themed } from '@/theme/tokens';

/** The cart isn't a tab: this header button opens it and shows the item count. 44 pt touch target. */
export function CartButton() {
  const { count } = useCart();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? `Cart, ${count} items` : 'Cart'}
      onPress={() => router.push('/cart')}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <ShoppingBag size={22} color={colors.ink} />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText} color={colors.onPrimary}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = themed(() => ({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  pressed: { backgroundColor: colors.primarySoft },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.semibold, fontSize: 10, lineHeight: 13 },
}));
