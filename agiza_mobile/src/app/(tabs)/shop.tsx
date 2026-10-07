import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Search, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';

import { ProductGrid } from '@/components/product-grid';
import { StoreTile } from '@/components/store';
import { Text } from '@/components/ui/text';
import { shopApi } from '@/lib/api/endpoints';
import { keys } from '@/lib/query';
import { colors, fonts, radius, space, themed } from '@/theme/tokens';

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price', label: 'Price: low to high' },
  { value: '-price', label: 'Price: high to low' },
];

function Chip({
  label,
  active,
  onPress,
  toggle,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  toggle?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={toggle ? 'switch' : 'button'}
      accessibilityState={toggle ? { checked: active } : { selected: active }}
      hitSlop={{ top: 6, bottom: 6 }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}>
      <Text variant="smallMedium" color={active ? colors.onPrimary : colors.text}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function ShopScreen() {
  const { width } = useWindowDimensions();
  const categories = useQuery({ queryKey: keys.categories, queryFn: shopApi.categories });
  const stores = useQuery({ queryKey: keys.stores({}), queryFn: () => shopApi.stores({}) });
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<number | undefined>();
  const [ordering, setOrdering] = useState('newest');
  const [inStock, setInStock] = useState(false);

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
      {stores.data?.results.length ? (
        <View style={styles.storesBlock}>
          <View style={styles.storesHead}>
            <Text variant="subheading" color={colors.ink}>
              Stores
            </Text>
            <Pressable accessibilityRole="link" accessibilityLabel="See all stores" hitSlop={8} onPress={() => router.push('/stores')}>
              <Text variant="smallMedium" color={colors.primary}>
                See all
              </Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storeRow}>
            {stores.data.results.map((st) => (
              <StoreTile key={st.slug} store={st} width={Math.min(132, (width - space.lg * 2 - space.md) / 2.75)} />
            ))}
          </ScrollView>
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="All" active={!category} onPress={() => setCategory(undefined)} />
        {categories.data?.map((c) => (
          <Chip key={c.id} label={c.name} active={category === c.id} onPress={() => setCategory(c.id)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="In stock only" active={inStock} onPress={() => setInStock((v) => !v)} toggle />
        {SORTS.map((s) => (
          <Chip key={s.value} label={s.label} active={ordering === s.value} onPress={() => setOrdering(s.value)} />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <ProductGrid query={{ search: search || undefined, category, ordering, in_stock: inStock || undefined }} header={header} />
  );
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
  storesBlock: { gap: space.sm },
  storesHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  storeRow: { gap: space.md, paddingBottom: 4 },
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
