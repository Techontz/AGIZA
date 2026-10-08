import { Share2 } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { shadow, themed } from '@/theme/tokens';

/** Round share button matching the wishlist heart on product photos. */
export function ShareButton({ label, onPress, size = 44 }: { label: string; onPress: () => void; size?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { width: size, height: size, borderRadius: size / 2 }, pressed && styles.pressed]}>
      <Share2 size={size * 0.45} color="#121212" />
    </Pressable>
  );
}

const styles = themed(() => ({
  button: { backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center', ...shadow.card },
  pressed: { opacity: 0.7 },
}));
