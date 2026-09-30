import { router } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useUnreadNotifications } from '@/hooks/use-notifications';
import { colors, fonts } from '@/theme/tokens';

/** Bell with the unread count; opens the inbox. 44 pt touch target. */
export function NotificationBell() {
  const unread = useUnreadNotifications();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      onPress={() => router.push('/notifications')}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
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

/** Just the count pill, for list rows. */
export function UnreadPill({ count }: { count: number }) {
  if (!count) return null;
  return (
    <View style={[styles.badge, styles.inline]}>
      <Text style={styles.badgeText} color="#FFFFFF">
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  inline: { position: 'relative', top: 0, right: 0 },
  badgeText: { fontFamily: fonts.semibold, fontSize: 10, lineHeight: 13 },
});
