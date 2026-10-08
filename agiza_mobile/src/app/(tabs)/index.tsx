import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { ArrowUpRight, Globe2, Search, Store } from 'lucide-react-native';
import { Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/brand';
import { HomeSlider } from '@/components/home-slider';
import { NotificationBell } from '@/components/notification-bell';
import { ProductTile } from '@/components/product-tile';
import { SeeAll, Section } from '@/components/ui/card';
import { ErrorState, Loading } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { shopApi } from '@/lib/api/endpoints';
import type { ProductCard } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/session';
import { keys } from '@/lib/query';
import { colors, fonts, radius, shadow, space, themed } from '@/theme/tokens';

const GAP = space.md;
const ORIGINS = ['China', 'USA', 'UK', 'India', 'Dubai'];

function ProductRow({ products, width }: { products: ProductCard[]; width: number }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll} style={styles.bleed}>
      {products.map((p) => (
        <ProductTile key={p.id} product={p} width={width} />
      ))}
    </ScrollView>
  );
}

/** Agiza: AGIZA buys or ships from abroad. A dark card so it reads as the flagship service. */
function AgizaCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Agiza: order from China, USA, UK, India and Dubai"
      onPress={onPress}
      style={({ pressed }) => [styles.feature, styles.agiza, pressed && styles.pressed]}>
      <View style={styles.agizaGlow} />
      <View style={[styles.featureIcon, { backgroundColor: colors.brand }]}>
        <Globe2 size={22} color={colors.onPrimary} strokeWidth={1.8} />
      </View>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle} color={colors.onHero}>
          Agiza
        </Text>
        <Text variant="caption" color="rgba(255,255,255,0.7)" numberOfLines={2}>
          {ORIGINS.join(' · ')}
        </Text>
      </View>
      <View style={[styles.featureCta, { backgroundColor: colors.brand }]}>
        <Text style={styles.ctaText} color={colors.onPrimary}>
          Order
        </Text>
        <ArrowUpRight size={15} color={colors.onPrimary} />
      </View>
    </Pressable>
  );
}

/** Shop: ready stock in Tanzania. A warm light card beside the dark Agiza one. */
function ShopCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Shop: products checked and ready in stock"
      onPress={onPress}
      style={({ pressed }) => [styles.feature, styles.shop, pressed && styles.pressed]}>
      <View style={[styles.featureIcon, { backgroundColor: colors.ink }]}>
        <Store size={22} color={colors.background} strokeWidth={1.8} />
      </View>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle} color={colors.ink}>
          Shop
        </Text>
        <Text variant="caption" color={colors.textMuted} numberOfLines={2}>
          Bidhaa zilizopitiwa tayari
        </Text>
      </View>
      {/* Ink pill: dark on the light card, light on the dark-mode card. */}
      <View style={[styles.featureCta, { backgroundColor: colors.ink }]}>
        <Text style={styles.ctaText} color={colors.background}>
          Shop
        </Text>
        <ArrowUpRight size={15} color={colors.background} />
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const { status, customer } = useAuth();
  const signedIn = status === 'signedIn';
  // Hot Sales: only the products staff mark as Featured in the admin (the row hides when there are none).
  const featured = useQuery({ queryKey: keys.products({ featured: true }), queryFn: () => shopApi.products({ featured: true }) });
  // Below Hot Sales: products picked for this customer (staff set their interests in the admin).
  const forYou = useQuery({
    queryKey: keys.products({ for_you: true }),
    queryFn: () => shopApi.products({ for_you: true }),
    enabled: signedIn,
  });
  const tile = Math.min(176, (width - space.lg * 2 - GAP) / 2.15);
  const needsSignIn = (href: Href) => () => router.push(signedIn ? href : '/login');
  const see = (params: Record<string, string>) => () => router.push({ pathname: '/products', params });

  const refreshing = featured.isRefetching || forYou.isRefetching;
  const refresh = () => Promise.all([featured.refetch(), signedIn ? forYou.refetch() : null]);
  const picked = signedIn ? (forYou.data?.results ?? []) : [];
  const firstName = customer?.full_name.split(' ')[0];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}>
        <View style={styles.header}>
          <Logo size={28} />
          <View style={styles.headerRight}>
            <View style={styles.greeting}>
              <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
                Karibu
              </Text>
              <Text variant="smallMedium" color={colors.ink} numberOfLines={1}>
                {firstName ?? 'AGIZA'}
              </Text>
            </View>
            {signedIn ? (
              <View style={styles.bell}>
                <NotificationBell />
              </View>
            ) : null}
          </View>
        </View>

        <Pressable accessibilityRole="search" onPress={() => router.push('/shop')} style={styles.search}>
          <Search size={19} color={colors.ink} />
          <Text variant="body" color={colors.textSubtle} style={{ flex: 1 }}>
            Search products
          </Text>
        </Pressable>

        <View style={styles.features}>
          <AgizaCard onPress={needsSignIn('/requests/new')} />
          <ShopCard onPress={() => router.push('/shop')} />
        </View>

        <HomeSlider />

        {featured.isLoading ? (
          <Loading />
        ) : featured.isError ? (
          <ErrorState error={featured.error} onRetry={refresh} />
        ) : featured.data?.results.length ? (
          <Section
            title="Hot Sales"
            action={<SeeAll label="See all hot sales" onPress={see({ featured: '1', title: 'Hot Sales' })} />}>
            <ProductRow products={featured.data.results} width={tile} />
          </Section>
        ) : null}

        {picked.length ? (
          <Section
            title="For you"
            subtitle="Picked for your interests"
            action={<SeeAll label="See all products for you" onPress={see({ for_you: '1', title: 'For you' })} />}>
            <ProductRow products={picked} width={tile} />
          </Section>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.xxl, paddingBottom: space.xxxl + space.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  greeting: { alignItems: 'flex-end', flexShrink: 1 },
  bell: {
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 54,
    marginTop: -space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  features: { flexDirection: 'row', gap: GAP, marginTop: -space.xs },
  feature: { flex: 1, borderRadius: radius.lg, padding: space.lg, gap: space.md, minHeight: 186, overflow: 'hidden' },
  agiza: { backgroundColor: colors.hero, ...shadow.float },
  agizaGlow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    right: -70,
    top: -60,
    borderWidth: 22,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  shop: { backgroundColor: colors.primarySoft, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  pressed: { opacity: 0.94, transform: [{ scale: 0.98 }] },
  featureIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  featureText: { flex: 1, gap: 4 },
  featureTitle: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 26, letterSpacing: -0.4 },
  featureCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 42,
    borderRadius: radius.pill,
  },
  ctaText: { fontFamily: fonts.semibold, fontSize: 14 },
  bleed: { marginHorizontal: -space.lg },
  hscroll: { gap: GAP, paddingHorizontal: space.lg, paddingBottom: space.md, paddingTop: 2 },
}));
