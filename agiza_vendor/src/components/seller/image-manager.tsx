import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Star, Trash2 } from 'lucide-react-native';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { errorMessage } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { sellerApi } from '@/lib/api/endpoints';
import type { SellerProductDetail } from '@/lib/api/types';
import { choosePhoto } from '@/lib/files';
import { keys } from '@/lib/query';
import { colors, radius, space } from '@/theme/tokens';

import { PrivateImage } from './private-image';

const MAX = 10;

/** Product photos: add from camera or library, choose the main one, remove. */
export function ImageManager({ product, disabled }: { product: SellerProductDetail; disabled?: boolean }) {
  const client = useQueryClient();
  const update = (p: SellerProductDetail) => {
    client.setQueryData(keys.product(p.id), p);
    client.invalidateQueries({ queryKey: keys.allProducts });
  };
  const onError = (e: unknown) => Alert.alert("Couldn't update the photos", errorMessage(e));
  const upload = useMutation({
    mutationFn: async () => {
      const file = await choosePhoto('Add a product photo');
      return file ? sellerApi.uploadImage(product.id, file) : null;
    },
    onSuccess: (p) => p && update(p),
    onError,
  });
  const primary = useMutation({ mutationFn: (id: number) => sellerApi.makePrimary(product.id, id), onSuccess: update, onError });
  const remove = useMutation({ mutationFn: (id: number) => sellerApi.removeImage(product.id, id), onSuccess: update, onError });
  const busy = primary.isPending || remove.isPending;

  const confirmRemove = (id: number) =>
    Alert.alert('Remove this photo?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(id) },
    ]);

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text variant="heading" color={colors.ink}>
          Photos
        </Text>
        <Text variant="small" color={colors.textMuted}>
          {product.images.length}/{MAX}
        </Text>
      </View>
      <View style={styles.grid}>
        {product.images.map((img, n) => (
          <View key={img.id} style={styles.tile}>
            <PrivateImage uri={img.url} style={styles.image} accessibilityLabel={`Photo ${n + 1}${img.is_primary ? ', main photo' : ''}`} />
            {img.is_primary ? (
              <View style={styles.main}>
                <Text variant="caption" color="#FFFFFF">
                  Main
                </Text>
              </View>
            ) : null}
            {!disabled ? (
              <View style={styles.tools}>
                {!img.is_primary ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Make photo ${n + 1} the main photo`}
                    disabled={busy}
                    onPress={() => primary.mutate(img.id)}
                    style={styles.tool}>
                    <Star size={16} color={colors.ink} />
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${n + 1}`}
                  disabled={busy}
                  onPress={() => confirmRemove(img.id)}
                  style={styles.tool}>
                  <Trash2 size={16} color={colors.danger} />
                </Pressable>
              </View>
            ) : null}
          </View>
        ))}
        {product.images.length < MAX && !disabled ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add photo"
            disabled={upload.isPending}
            onPress={() => upload.mutate()}
            style={[styles.tile, styles.add]}>
            {upload.isPending ? <ActivityIndicator color={colors.brand} /> : <ImagePlus size={26} color={colors.textMuted} />}
            <Text variant="caption" color={colors.textMuted}>
              {upload.isPending ? 'Uploading…' : 'Add photo'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Text variant="small" color={colors.textMuted}>
        JPEG, PNG or WebP up to 8 MB. Tap the star to choose the main photo. New photos are checked by AGIZA like the rest of the listing.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: '31%', aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#F3F4F6' },
  image: { width: '100%', height: '100%' },
  main: { position: 'absolute', top: 6, left: 6, backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tools: { position: 'absolute', right: 4, bottom: 4, flexDirection: 'row', gap: 4 },
  tool: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center' },
  add: { alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.borderStrong, backgroundColor: colors.surface },
});
