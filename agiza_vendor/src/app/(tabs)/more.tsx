import { router, type Href } from 'expo-router';
import {
  Bell,
  ChevronRight,
  ExternalLink,
  FileText,
  KeyRound,
  LogOut,
  Settings,
  Star,
  Undo2,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { StoreAvatar } from '@/components/seller/store-avatar';
import { SuspendedBanner } from '@/components/seller/suspended-banner';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { useUnreadNotifications } from '@/hooks/use-notifications';
import { useStore } from '@/hooks/use-store';
import { useAuth } from '@/lib/auth/session';
import { openPublicStore, openSellerTerms } from '@/lib/links';
import { APPROVAL_TONE } from '@/lib/seller';
import { colors, radius, shadow, space } from '@/theme/tokens';

type Item = { label: string; icon: LucideIcon; href?: Href; onPress?: () => void; badge?: number; external?: boolean };

export default function MoreScreen() {
  const { customer, signOut } = useAuth();
  const { store } = useStore();
  const unread = useUnreadNotifications();

  const groups: { title: string; items: Item[] }[] = [
    {
      title: 'Store',
      items: [
        { label: 'Returns', icon: Undo2, href: '/returns' },
        { label: 'Reviews', icon: Star, href: '/reviews' },
        { label: 'Notifications', icon: Bell, href: '/notifications', badge: unread },
        { label: 'Store settings', icon: Settings, href: '/store-settings' },
        ...(store ? [{ label: 'View public store', icon: ExternalLink, onPress: () => openPublicStore(store.slug), external: true }] : []),
      ],
    },
    {
      title: 'Account',
      items: [
        { label: 'Profile', icon: UserRound, href: '/profile' },
        { label: 'Change password', icon: KeyRound, href: '/change-password' },
        { label: 'Seller terms', icon: FileText, onPress: openSellerTerms, external: true },
      ],
    },
  ];

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You will stop receiving seller notifications on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SuspendedBanner />
      {store ? (
        <View style={styles.storeCard}>
          <StoreAvatar name={store.name} logo={store.logo} size={52} />
          <View style={styles.flex}>
            <Text variant="heading" color={colors.ink} numberOfLines={1}>
              {store.name}
            </Text>
            <Text variant="small" color={colors.textMuted}>
              {store.reference}
              {customer?.phone ? ` · ${customer.phone}` : ''}
            </Text>
            <Badge label={store.approval_status_display} tone={APPROVAL_TONE[store.approval_status]} />
          </View>
        </View>
      ) : null}
      {groups.map((g) => (
        <View key={g.title} style={styles.group}>
          <Text variant="smallMedium" color={colors.textMuted} style={styles.groupTitle}>
            {g.title.toUpperCase()}
          </Text>
          <View style={styles.list}>
            {g.items.map((item, i) => (
              <Pressable
                key={item.label}
                accessibilityRole={item.external ? 'link' : 'button'}
                accessibilityLabel={item.badge ? `${item.label}, ${item.badge} unread` : item.label}
                onPress={item.onPress ?? (() => item.href && router.push(item.href))}
                style={({ pressed }) => [styles.item, i > 0 && styles.itemBorder, pressed && styles.pressed]}>
                <item.icon size={20} color={colors.ink} />
                <Text variant="bodyMedium" color={colors.ink} style={styles.flex}>
                  {item.label}
                </Text>
                {item.badge ? (
                  <View style={styles.count}>
                    <Text variant="caption" color="#FFFFFF">
                      {item.badge > 99 ? '99+' : item.badge}
                    </Text>
                  </View>
                ) : null}
                {item.external ? <ExternalLink size={16} color={colors.textSubtle} /> : <ChevronRight size={18} color={colors.textSubtle} />}
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <Pressable accessibilityRole="button" onPress={confirmSignOut} style={({ pressed }) => [styles.list, styles.item, pressed && styles.pressed]}>
        <LogOut size={20} color={colors.danger} />
        <Text variant="bodyMedium" color={colors.danger} style={styles.flex}>
          Sign out
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxxl },
  storeCard: { flexDirection: 'row', gap: space.md, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, ...shadow.card },
  flex: { flex: 1, gap: 3 },
  group: { gap: space.sm },
  groupTitle: { paddingHorizontal: space.xs, letterSpacing: 0.5 },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow.card },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52, paddingHorizontal: space.lg },
  itemBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { backgroundColor: colors.background },
  count: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
});
