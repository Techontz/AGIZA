import { router, type Href } from 'expo-router';
import {
  Bell,
  ChevronRight,
  Heart,
  KeyRound,
  LogOut,
  MapPin,
  PackageX,
  Star,
  Trash2,
  UserRound,
  Warehouse,
  type LucideIcon,
} from 'lucide-react-native';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { UnreadPill } from '@/components/notification-bell';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { Card } from '@/components/ui/card';
import { Loading } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useUnreadNotifications } from '@/hooks/use-notifications';
import { useAuth } from '@/lib/auth/session';
import { colors, radius, shadow, space, themed } from '@/theme/tokens';

function Item({
  icon: Icon,
  label,
  href,
  danger,
  count,
}: {
  icon: LucideIcon;
  label: string;
  href: Href;
  danger?: boolean;
  count?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? `${label}, ${count} unread` : label}
      onPress={() => router.push(href)}
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      <View style={[styles.itemIcon, danger && { backgroundColor: colors.dangerSoft }]}>
        <Icon size={18} color={danger ? colors.danger : colors.ink} />
      </View>
      <Text variant="bodyMedium" color={danger ? colors.danger : colors.ink} style={{ flex: 1 }}>
        {label}
      </Text>
      {count ? <UnreadPill count={count} /> : null}
      <ChevronRight size={18} color={colors.textSubtle} />
    </Pressable>
  );
}

export default function AccountScreen() {
  const { status, customer, signOut } = useAuth();
  const unread = useUnreadNotifications();
  if (status === 'signedIn' && !customer) return <Loading />;
  if (status !== 'signedIn' || !customer) {
    return <SignInPrompt icon={UserRound} title="Your AGIZA account" message="Sign in to manage orders, addresses and requests." />;
  }
  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You can sign in again any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.profile}>
        <View style={styles.profileGlow} />
        <View style={styles.avatar}>
          <Text variant="title" color={colors.onPrimary}>
            {customer.full_name.trim().charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="heading" color={colors.onHero} numberOfLines={1}>
            {customer.full_name}
          </Text>
          <Text variant="small" color="rgba(255,255,255,0.72)">
            {customer.phone}
          </Text>
          {customer.email ? (
            <Text variant="small" color="rgba(255,255,255,0.72)" numberOfLines={1}>
              {customer.email}
            </Text>
          ) : null}
        </View>
      </View>

      <Card style={styles.group}>
        <Item icon={Bell} label="Notifications" href="/notifications" count={unread} />
        <Item icon={Heart} label="Saved products" href="/saved" />
        <Item icon={Star} label="My reviews" href="/my-reviews" />
        <Item icon={PackageX} label="My returns" href="/returns" />
      </Card>

      <Card style={styles.group}>
        <Item icon={UserRound} label="Profile" href="/profile" />
        <Item icon={MapPin} label="Delivery addresses" href="/addresses" />
        <Item icon={Warehouse} label="AGIZA shipping addresses" href="/shipping-addresses" />
      </Card>

      <Card style={styles.group}>
        <Item icon={KeyRound} label="Change password" href="/change-password" />
        <Item icon={Trash2} label="Delete account" href="/delete-account" danger />
      </Card>

      <Pressable accessibilityRole="button" onPress={confirmSignOut} style={styles.signOut}>
        <LogOut size={18} color={colors.danger} />
        <Text variant="subheading" color={colors.danger}>
          Sign out
        </Text>
      </Pressable>
      <Text variant="caption" color={colors.textSubtle} style={styles.ref}>
        Customer {customer.reference}
      </Text>
    </ScrollView>
  );
}

const styles = themed(() => ({
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxxl },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.hero,
    overflow: 'hidden',
    ...shadow.float,
  },
  profileGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    right: -60,
    top: -90,
    borderWidth: 22,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  group: { paddingVertical: space.xs, paddingHorizontal: 0 },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12 },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.surfaceMuted },
  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.md },
  ref: { textAlign: 'center' },
}));
