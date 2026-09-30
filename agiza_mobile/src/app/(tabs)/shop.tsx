import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronRight, Search, Store as StoreIcon, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ProductGrid } from '@/components/product-grid';
import { Text } from '@/components/ui/text';
import { shopApi } from '@/lib/api/endpoints';
import { keys } from '@/lib/query';
import { colors, fonts, radius, space } from '@/theme/tokens';

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
      <Text variant="smallMedium" color={active ? '#FFFFFF' : colors.text}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function ShopScreen() {
  const categories = useQuery({ queryKey: keys.categories, queryFn: shopApi.categories });
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
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Browse stores"
        accessibilityHint="Shop by seller"
        onPress={() => router.push('/stores')}
        style={({ pressed }) => [styles.stores, pressed && styles.pressed]}>
        <View style={styles.storesIcon}>
          <StoreIcon size={18} color={colors.brand} />
        </View>
        <View style={styles.storesText}>
          <Text variant="bodyMedium" color={colors.ink}>
            Browse stores
          </Text>
          <Text variant="small" color={colors.textMuted}>
            Shop from AGIZA and marketplace sellers
          </Text>
        </View>
        <ChevronRight size={18} color={colors.textSubtle} />
      </Pressable>
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

const styles = StyleSheet.create({
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
  stores: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  pressed: { opacity: 0.85 },
  storesIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storesText: { flex: 1 },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
});
