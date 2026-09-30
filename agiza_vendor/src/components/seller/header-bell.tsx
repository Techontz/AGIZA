import { router } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useUnreadNotifications } from '@/hooks/use-notifications';
import { colors, fonts } from '@/theme/tokens';

/** Bell in the header with the server's unread count. */
export function HeaderBell() {
  const unread = useUnreadNotifications();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      onPress={() => router.push('/notifications')}
      style={styles.button}>
      <Bell size={22} color={colors.ink} />
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText} color="#FFFFFF">
            {unread > 99 ? '99+' : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** "AGIZA Seller" title with the small Seller tag. */
export function SellerTitle({ title }: { title: string }) {
  return (
    <View style={styles.title}>
      <Text variant="subheading" color={colors.ink} numberOfLines={1} style={{ flexShrink: 1 }}>
        {title}
      </Text>
      <View style={styles.tag}>
        <Text variant="caption" color={colors.primary}>
          Seller
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.semibold, fontSize: 10, lineHeight: 12 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 260 },
  tag: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
});
