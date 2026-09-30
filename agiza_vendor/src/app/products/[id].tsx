import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { Alert } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { ImageManager } from '@/components/seller/image-manager';
import { ProductEditor } from '@/components/seller/product-editor';
import { StockCard } from '@/components/seller/stock-card';
import { SuspendedBanner } from '@/components/seller/suspended-banner';
import { Button } from '@/components/ui/button';
import { ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { useStore } from '@/hooks/use-store';
import { sellerApi } from '@/lib/api/endpoints';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { colors } from '@/theme/tokens';

export default function ProductScreen() {
  const params = useLocalSearchParams<{ id: string; created?: string }>();
  const id = Number(params.id);
  const client = useQueryClient();
  const { suspended } = useStore();
  const product = useQuery({ queryKey: keys.product(id), queryFn: () => sellerApi.product(id), enabled: Number.isFinite(id) });
  const remove = useMutation({
    mutationFn: () => sellerApi.deleteProduct(id),
    onSuccess: (r) => {
      client.invalidateQueries({ queryKey: ['seller'] });
      toast(r.result === 'deleted' ? 'Product deleted' : 'Product has orders, so it was hidden instead');
      router.back();
    },
    onError: (e) => Alert.alert("Couldn't delete the product", errorMessage(e)),
  });

  if (product.isLoading) return <Loading />;
  if (product.isError || !product.data) return <ErrorState error={product.error} onRetry={() => product.refetch()} />;
  const p = product.data;
  const locked = suspended || p.listing_state === 'disabled';

  const confirmDelete = () =>
    Alert.alert('Delete this product?', 'Products that already have orders are hidden instead of deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() },
    ]);

  return (
    <FormScreen>
      <Stack.Screen options={{ title: p.name }} />
      <SuspendedBanner />
      {params.created ? <Notice tone="success">Product created. Add photos below: products with good photos sell better.</Notice> : null}
      <ImageManager product={p} disabled={locked} />
      <StockCard key={`stock-${p.updated_at}`} product={p} disabled={locked} />
      <ProductEditor key={p.updated_at} product={p} disabled={suspended} />
      {!suspended ? (
        <Button
          title="Delete product"
          variant="danger"
          icon={<Trash2 size={18} color={colors.danger} />}
          loading={remove.isPending}
          onPress={confirmDelete}
        />
      ) : null}
    </FormScreen>
  );
}
