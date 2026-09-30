import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { Globe, MessageCircle, PackageSearch, Search, Truck } from 'lucide-react-native';
import { Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/brand';
import { NotificationBell } from '@/components/notification-bell';
import { ProductTile } from '@/components/product-tile';
import { StoreTile } from '@/components/store';
import { Section } from '@/components/ui/card';
import { ErrorState, Loading } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { shopApi } from '@/lib/api/endpoints';
import type { ProductCard, Store } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/session';
import { keys } from '@/lib/query';
import { colors, radius, shadow, space } from '@/theme/tokens';

const GAP = space.md;

function ProductRow({ products, width }: { products: ProductCard[]; width: number }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
      {products.map((p) => (
        <ProductTile key={p.id} product={p} width={width} />
      ))}
    </ScrollView>
  );
}

function StoreRow({ stores, width }: { stores: Store[]; width: number }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll}>
      {stores.map((s) => (
        <StoreTile key={s.slug} store={s} width={width} />
      ))}
    </ScrollView>
  );
}

function SeeAll({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} hitSlop={8}>
      <Text variant="smallMedium" color={colors.primary}>
        See all
      </Text>
    </Pressable>
  );
}

function ServiceCard({ icon: Icon, title, text, onPress }: { icon: typeof Globe; title: string; text: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.service, pressed && { opacity: 0.85 }]}>
      <View style={styles.serviceIcon}>
        <Icon size={22} color={colors.brand} />
      </View>
      <Text variant="subheading" color={colors.ink}>
        {title}
      </Text>
      <Text variant="small" color={colors.textMuted}>
        {text}
      </Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const { status, customer } = useAuth();
  const featured = useQuery({ queryKey: keys.products({ featured: true }), queryFn: () => shopApi.products({ featured: true }) });
  const deals = useQuery({ queryKey: keys.products({ deals: true }), queryFn: () => shopApi.products({ deals: true }) });
  const latest = useQuery({ queryKey: keys.products({}), queryFn: () => shopApi.products({}) });
  const stores = useQuery({ queryKey: keys.stores({}), queryFn: () => shopApi.stores({}) });
  const tile = Math.min(180, (width - space.lg * 2 - GAP) / 2.2);
  const signedIn = status === 'signedIn';
  const needsSignIn = (href: Href) => () => router.push(signedIn ? href : '/login');

  const refreshing = featured.isRefetching || deals.isRefetching || latest.isRefetching || stores.isRefetching;
  const refresh = () => Promise.all([featured.refetch(), deals.refetch(), latest.refetch(), stores.refetch()]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />}>
        <View style={styles.header}>
          <Logo size={30} />
          <View style={styles.headerRight}>
            <Text variant="small" color={colors.textMuted} numberOfLines={1} style={styles.greeting}>
              {customer ? `Karibu, ${customer.full_name.split(' ')[0]}` : 'Karibu AGIZA'}
            </Text>
            {signedIn ? <NotificationBell /> : null}
          </View>
        </View>

        <Pressable accessibilityRole="search" onPress={() => router.push('/shop')} style={styles.search}>
          <Search size={18} color={colors.textMuted} />
          <Text variant="body" color={colors.textSubtle}>
            Search products
          </Text>
        </Pressable>

        <View style={styles.services}>
          <ServiceCard icon={Globe} title="Buy for me" text="We buy abroad and ship to you" onPress={needsSignIn('/requests/new')} />
          <ServiceCard
            icon={Truck}
            title="Deliver for me"
            text="Ship goods you already bought"
            onPress={needsSignIn({ pathname: '/requests/new', params: { type: 'deliver_for_me' } })}
          />
        </View>

        {latest.isLoading ? (
          <Loading />
        ) : latest.isError ? (
          <ErrorState error={latest.error} onRetry={refresh} />
        ) : (
          <>
            {deals.data?.results.length ? (
              <Section title="Ofa kali">
                <ProductRow products={deals.data.results} width={tile} />
              </Section>
            ) : null}
            {featured.data?.results.length ? (
              <Section title="Featured">
                <ProductRow products={featured.data.results} width={tile} />
              </Section>
            ) : null}
            {stores.data?.results.length ? (
              <Section title="Stores" action={<SeeAll label="See all stores" onPress={() => router.push('/stores')} />}>
                <StoreRow stores={stores.data.results} width={Math.min(132, tile * 0.8)} />
              </Section>
            ) : null}
            <Section
              title="New arrivals"
              action={<SeeAll label="See all new arrivals" onPress={() => router.push('/products')} />}>
              {latest.data?.results.length ? (
                <ProductRow products={latest.data.results} width={tile} />
              ) : (
                <View style={styles.emptyRow}>
                  <PackageSearch size={20} color={colors.textSubtle} />
                  <Text variant="small" color={colors.textMuted}>
                    New products will appear here soon.
                  </Text>
                </View>
              )}
            </Section>
          </>
        )}

        <Pressable accessibilityRole="button" onPress={needsSignIn('/support')} style={styles.help}>
          <MessageCircle size={20} color={colors.ink} />
          <View style={{ flex: 1 }}>
            <Text variant="subheading" color={colors.ink}>
              Need help?
            </Text>
            <Text variant="small" color={colors.textMuted}>
              Chat with AGIZA Support
            </Text>
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.lg, gap: space.xxl, paddingBottom: space.xxxl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
  greeting: { flexShrink: 1 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  services: { flexDirection: 'row', gap: GAP },
  service: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: 6, ...shadow.card },
  serviceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  hscroll: { gap: GAP, paddingRight: space.lg, paddingBottom: 4 },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  help: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
});
