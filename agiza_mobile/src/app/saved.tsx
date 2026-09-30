import { router } from 'expo-router';
import { Heart } from 'lucide-react-native';
import { FlatList, StyleSheet, useWindowDimensions } from 'react-native';

import { ProductTile } from '@/components/product-tile';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Loading } from '@/components/ui/states';
import { useWishlist } from '@/hooks/use-wishlist';
import { space } from '@/theme/tokens';

/** Saved products (wishlist). Tapping a tile's heart removes it from here. */
export default function SavedProductsScreen() {
  const { width } = useWindowDimensions();
  const tile = (width - space.lg * 2 - space.md) / 2;
  const list = useWishlist();

  if (list.isLoading) return <Loading />;
  if (list.isError || !list.data) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;

  return (
    <FlatList
      data={list.data.products}
      keyExtractor={(p) => String(p.id)}
      numColumns={2}
      columnWrapperStyle={styles.column}
      contentContainerStyle={styles.content}
      refreshing={list.isRefetching}
      onRefresh={() => list.refetch()}
      renderItem={({ item }) => <ProductTile product={item} width={tile} />}
      ListEmptyComponent={
        <EmptyState
          icon={Heart}
          title="No saved products"
          message="Tap the heart on a product to keep it here for later."
          action={<Button title="Browse products" variant="secondary" onPress={() => router.push('/shop')} style={styles.action} />}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, flexGrow: 1 },
  column: { gap: space.md },
  action: { marginTop: space.sm, minWidth: 180 },
});
