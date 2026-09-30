import { Stack } from 'expo-router';
import { LogOut, Store } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { ApplicationForm } from '@/components/seller/application-form';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth/session';
import { colors, radius, space } from '@/theme/tokens';

/** Signed in, no store yet: apply to sell with this account. */
export default function ApplyScreen() {
  const { customer, signOut } = useAuth();
  return (
    <FormScreen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={signOut} hitSlop={8} style={styles.headerButton}>
              <LogOut size={20} color={colors.ink} />
            </Pressable>
          ),
        }}
      />
      <View style={styles.intro}>
        <View style={styles.icon}>
          <Store size={24} color={colors.brand} />
        </View>
        <View style={styles.flex}>
          <Text variant="heading" color={colors.ink}>
            Open your store on AGIZA
          </Text>
          <Text variant="small" color={colors.textMuted}>
            {customer?.phone ? `Signed in as ${customer.phone}. ` : ''}This account doesn&apos;t have a store yet. Tell us about your
            business: AGIZA reviews every store before it can sell.
          </Text>
        </View>
      </View>
      <ApplicationForm />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', gap: space.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg },
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: space.xs },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
