import { router } from 'expo-router';
import { BadgeCheck, PackagePlus, ShoppingCart, Wallet, type LucideIcon } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { openSellerTerms } from '@/lib/links';
import { colors, radius, space } from '@/theme/tokens';

const POINTS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: ShoppingCart, title: 'Receive orders', text: 'Accept each order and get the items ready. AGIZA collects from your shop and delivers.' },
  { icon: PackagePlus, title: 'Manage your products', text: 'Photos, prices and stock from your phone. AGIZA checks each product before it goes live.' },
  { icon: Wallet, title: 'Track your earnings', text: 'Sale, AGIZA commission and your net amount for every order, plus payouts and a full statement.' },
  { icon: BadgeCheck, title: 'A verified store', text: 'Your own store page on the AGIZA website and app, with your logo and reviews.' },
];

/** First screen when signed out: what AGIZA Seller is for, then sign in or create an account. */
export default function WelcomeScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.brandRow}>
            <Logo size={40} />
            <View style={styles.sellerTag}>
              <Text variant="smallMedium" color={colors.primary}>
                Seller
              </Text>
            </View>
          </View>
          <Text variant="title" color={colors.ink} style={styles.center}>
            Sell to customers across Tanzania
          </Text>
          <Text variant="body" color={colors.textMuted} style={styles.center}>
            AGIZA Seller is the app for stores selling on AGIZA. Customers pay AGIZA; AGIZA collects from you and delivers.
          </Text>
        </View>
        <View style={styles.points}>
          {POINTS.map(({ icon: Icon, title, text }) => (
            <View key={title} style={styles.point}>
              <View style={styles.icon}>
                <Icon size={20} color={colors.brand} />
              </View>
              <View style={styles.flex}>
                <Text variant="subheading" color={colors.ink}>
                  {title}
                </Text>
                <Text variant="small" color={colors.textMuted}>
                  {text}
                </Text>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.actions}>
          <Button title="Sign in" onPress={() => router.push('/login')} />
          <Button title="Create an account" variant="secondary" onPress={() => router.push('/register')} />
          <Text variant="small" color={colors.textMuted} style={styles.center}>
            Already shop on AGIZA? Sign in with the same phone number and password. See the{' '}
            <Text variant="smallMedium" color={colors.primary} onPress={openSellerTerms} accessibilityRole="link">
              seller terms
            </Text>
            .
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: space.xl, gap: space.xxl, paddingBottom: space.xxxl },
  hero: { alignItems: 'center', gap: space.md, marginTop: space.xl },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sellerTag: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  center: { textAlign: 'center' },
  points: { gap: space.md },
  point: { flexDirection: 'row', gap: space.md, backgroundColor: colors.background, borderRadius: radius.md, padding: space.md },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
  actions: { gap: space.md },
});
