import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react-native';
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

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
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
          <Pressable accessibilityLabel="Clear search" hitSlop={8} onPress={() => setText('')}>
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {SORTS.map((s) => (
          <Chip key={s.value} label={s.label} active={ordering === s.value} onPress={() => setOrdering(s.value)} />
        ))}
      </ScrollView>
    </View>
  );

  return <ProductGrid query={{ search: search || undefined, category, ordering }} header={header} />;
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
