import { Heart } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { useWishlist } from '@/hooks/use-wishlist';
import { colors, shadow, themed } from '@/theme/tokens';

/** Heart toggle. `size` is the visible circle; hitSlop keeps the touch target at least 44 pt. */
export function WishlistButton({ productId, name, size = 40 }: { productId: number; name: string; size?: number }) {
  const { isSaved, toggleSaved } = useWishlist();
  const saved = isSaved(productId);
  const slop = Math.max(0, Math.ceil((44 - size) / 2));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={saved ? `Remove ${name} from saved products` : `Save ${name}`}
      accessibilityState={{ selected: saved }}
      hitSlop={slop}
      onPress={() => toggleSaved(productId)}
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size, borderRadius: size / 2 },
        pressed && styles.pressed,
      ]}>
      <Heart size={size * 0.5} color={saved ? colors.danger : '#121212'} fill={saved ? colors.danger : 'transparent'} />
    </Pressable>
  );
}

const styles = themed(() => ({
  button: { backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center', ...shadow.card },
  pressed: { opacity: 0.7 },
}));
