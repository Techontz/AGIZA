import { router, type Href } from 'expo-router';
import {
  ChevronRight,
  Globe,
  KeyRound,
  LogOut,
  MapPin,
  MessageCircle,
  Trash2,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { SignInPrompt } from '@/components/sign-in-prompt';
import { Card } from '@/components/ui/card';
import { Loading } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth/session';
import { colors, space } from '@/theme/tokens';

function Item({ icon: Icon, label, href, danger }: { icon: LucideIcon; label: string; href: Href; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(href)} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      <Icon size={20} color={danger ? colors.danger : colors.ink} />
      <Text variant="bodyMedium" color={danger ? colors.danger : colors.ink} style={{ flex: 1 }}>
        {label}
      </Text>
      <ChevronRight size={18} color={colors.textSubtle} />
    </Pressable>
  );
}

export default function AccountScreen() {
  const { status, customer, signOut } = useAuth();
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
      <Card style={styles.profile}>
        <View style={styles.avatar}>
          <Text variant="heading" color={colors.primary}>
            {customer.full_name.trim().charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="heading" color={colors.ink}>
            {customer.full_name}
          </Text>
          <Text variant="small" color={colors.textMuted}>
            {customer.phone}
          </Text>
          {customer.email ? (
            <Text variant="small" color={colors.textMuted}>
              {customer.email}
            </Text>
          ) : null}
        </View>
      </Card>

      <Card style={styles.group}>
        <Item icon={UserRound} label="Profile" href="/profile" />
        <Item icon={MapPin} label="Delivery addresses" href="/addresses" />
        <Item icon={Globe} label="Buy for me requests" href="/requests" />
        <Item icon={MessageCircle} label="AGIZA Support" href="/support" />
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

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg },
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  group: { paddingVertical: space.xs, paddingHorizontal: 0 },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 14 },
  pressed: { backgroundColor: colors.background },
  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.md },
  ref: { textAlign: 'center' },
});
