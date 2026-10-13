import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Search, X } from 'lucide-react-native';
import { useEffect, useState, type ReactElement } from 'react';
import { Pressable, RefreshControl, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';

import { ProductGrid } from '@/components/product-grid';
import { ProductTile } from '@/components/product-tile';
import { StoreTile } from '@/components/store';
import { SeeAll, Section } from '@/components/ui/card';
import { ErrorState, Loading } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useWishlist } from '@/hooks/use-wishlist';
import { shopApi } from '@/lib/api/endpoints';
import type { ProductCard } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/session';
import { keys } from '@/lib/query';
import { recentlyViewed, recentlyViewedKey } from '@/lib/recently-viewed';
import { colors, fonts, radius, space, themed } from '@/theme/tokens';

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={{ top: 6, bottom: 6 }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}>
      <Text variant="smallMedium" color={active ? colors.onPrimary : colors.text}>
        {label}
      </Text>
    </Pressable>
  );
}

function Row({ products, width }: { products: ProductCard[]; width: number }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll} style={styles.bleed}>
      {products.map((p) => (
        <ProductTile key={p.id} product={p} width={width} />
      ))}
    </ScrollView>
  );
}

const see = (params: Record<string, string>) => () => router.push({ pathname: '/products', params });

/**
 * The "All" page of the shop, made for this customer: Hot Sales, what they looked at, saved and bought
 * before, products for their interests, then stores selling in the categories they like.
 */
function ShopHome({ header }: { header: ReactElement }) {
  const { width } = useWindowDimensions();
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const tile = Math.min(176, (width - space.lg * 2 - space.md) / 2.15);
  const featured = useQuery({ queryKey: keys.products({ featured: true }), queryFn: () => shopApi.products({ featured: true }) });
  const viewedIds = useQuery({ queryKey: recentlyViewedKey, queryFn: recentlyViewed });
  const ids = (viewedIds.data ?? []).join(',');
  const viewed = useQuery({
    queryKey: keys.products({ ids }),
    queryFn: () => shopApi.products({ ids }),
    enabled: ids.length > 0,
  });
  const saved = useWishlist();
  const bought = useQuery({
    queryKey: keys.products({ purchased: true }),
    queryFn: () => shopApi.products({ purchased: true }),
    enabled: signedIn,
  });
  const forYou = useQuery({
    queryKey: keys.products({ for_you: true }),
    queryFn: () => shopApi.products({ for_you: true }),
    enabled: signedIn,
  });
  const myStores = useQuery({
    queryKey: keys.stores({ for_you: signedIn }),
    queryFn: () => shopApi.stores(signedIn ? { for_you: true } : {}),
  });
  const allStores = useQuery({
    queryKey: keys.stores({}),
    queryFn: () => shopApi.stores({}),
    enabled: myStores.isFetched && !myStores.data?.results.length,
  });
  const stores = myStores.data?.results.length ? myStores.data.results : (allStores.data?.results ?? []);
  const refreshing = featured.isRefetching || bought.isRefetching || forYou.isRefetching;
  const refresh = () =>
    Promise.all([featured.refetch(), viewedIds.refetch(), signedIn ? Promise.all([saved.refetch(), bought.refetch(), forYou.refetch()]) : null, myStores.refetch()]);

  const rows: { key: string; title: string; subtitle?: string; products: ProductCard[]; more?: () => void }[] = [
    { key: 'hot', title: 'Hot Sales', products: featured.data?.results ?? [], more: see({ featured: '1', title: 'Hot Sales' }) },
    { key: 'viewed', title: 'Recently viewed', products: ids ? (viewed.data?.results ?? []) : [] },
    { key: 'saved', title: 'Your saved list', products: signedIn ? (saved.data?.products ?? []) : [], more: () => router.push('/saved') },
    {
      key: 'bought',
      title: 'Bought before',
      subtitle: 'Order them again',
      products: bought.data?.results ?? [],
      more: see({ purchased: '1', title: 'Bought before' }),
    },
    {
      key: 'for-you',
      title: 'We think you\'ll like these',
      subtitle: 'From the categories you like',
      products: forYou.data?.results ?? [],
      more: see({ for_you: '1', title: 'For you' }),
    },
  ];

  return (
    <ScrollView
      contentContainerStyle={styles.home}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {header}
      {featured.isLoading ? <Loading /> : featured.isError ? <ErrorState error={featured.error} onRetry={refresh} /> : null}
      {rows
        .filter((r) => r.products.length)
        .map((r) => (
          <Section key={r.key} title={r.title} subtitle={r.subtitle} action={r.more ? <SeeAll label={`See all: ${r.title}`} onPress={r.more} /> : undefined}>
            <Row products={r.products} width={tile} />
          </Section>
        ))}
      {stores.length ? (
        <Section
          title={myStores.data?.results.length && signedIn ? 'Stores for you' : 'Stores'}
          subtitle={myStores.data?.results.length && signedIn ? 'Selling in the categories you like' : undefined}
          action={<SeeAll label="See all stores" onPress={() => router.push('/stores')} />}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hscroll} style={styles.bleed}>
            {stores.map((st) => (
              <StoreTile key={st.slug} store={st} width={Math.min(132, (width - space.lg * 2 - space.md) / 2.75)} />
            ))}
          </ScrollView>
        </Section>
      ) : null}
    </ScrollView>
  );
}

export default function ShopScreen() {
  const categories = useQuery({ queryKey: keys.categories, queryFn: shopApi.categories });
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<number | undefined>();

  useEffect(() => {
    const t = setTimeout(() => setSearch(text.trim()), 350); // wait for typing to pause
    return () => clearTimeout(t);
  }, [text]);

  const header = (
    <View style={styles.header}>
      <View style={styles.search}>
        <Search size={18} color={colors.textMuted} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Search products, brands…"
          placeholderTextColor={colors.textSubtle}
          returnKeyType="search"
          accessibilityLabel="Search products"
          style={styles.searchInput}
        />
        {text ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={13} onPress={() => setText('')}>
            <X size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="All" active={!category} onPress={() => setCategory(undefined)} />
        {categories.data?.map((c) => (
          <Chip key={c.id} label={c.name} active={category === c.id} onPress={() => setCategory(c.id)} />
        ))}
      </ScrollView>
    </View>
  );

  // "All" without a search: the customer's own shop page. A category or a search: that product list.
  if (!category && !search) return <ShopHome header={header} />;
  return <ProductGrid query={{ search: search || undefined, category }} header={header} />;
}

const styles = themed(() => ({
  header: { gap: space.md, marginBottom: space.xs },
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
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, paddingVertical: space.sm },
  chips: { gap: space.sm },
  home: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xxxl, gap: space.xl },
  bleed: { marginHorizontal: -space.lg },
  hscroll: { gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.md, paddingTop: 2 },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
}));
