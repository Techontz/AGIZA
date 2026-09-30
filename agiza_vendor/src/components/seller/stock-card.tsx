import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { sellerApi } from '@/lib/api/endpoints';
import type { SellerProductDetail, SellerVariant } from '@/lib/api/types';
import { keys } from '@/lib/query';
import { toast } from '@/lib/toast';
import { colors, space } from '@/theme/tokens';

/** Quick stock count per option ("units on hand"), without re-submitting the whole listing. */
export function StockCard({ product, disabled }: { product: SellerProductDetail; disabled?: boolean }) {
  const rows = product.has_variations ? product.variants.filter((v) => !v.is_default) : product.variants.filter((v) => v.is_default).slice(0, 1);
  if (!rows.length) return null;
  return (
    <Card style={styles.card}>
      <Text variant="heading" color={colors.ink}>
        Stock
      </Text>
      <Text variant="small" color={colors.textMuted}>
        Units you have on hand. &quot;Reserved&quot; units are in orders not yet collected.
      </Text>
      {rows.map((v) => (
        <StockRow key={v.id} productId={product.id} variant={v} label={product.has_variations ? v.name : product.name} disabled={disabled} />
      ))}
    </Card>
  );
}

function StockRow({ productId, variant, label, disabled }: { productId: number; variant: SellerVariant; label: string; disabled?: boolean }) {
  const client = useQueryClient();
  const [value, setValue] = useState(String(variant.quantity));
  const save = useMutation({
    mutationFn: () => sellerApi.setStock(productId, variant.id, Number(value)),
    onSuccess: (p) => {
      client.setQueryData(keys.product(p.id), p);
      client.invalidateQueries({ queryKey: keys.allProducts });
      client.invalidateQueries({ queryKey: keys.dashboard });
      toast('Stock updated');
    },
    onError: (e) => Alert.alert("Couldn't update stock", errorMessage(e)),
  });
  const valid = /^\d+$/.test(value.trim());
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Input
          label={label}
          value={value}
          onChangeText={setValue}
          keyboardType="number-pad"
          editable={!disabled}
          hint={`${variant.reserved} reserved · ${variant.available} available`}
        />
      </View>
      <Button
        title="Update"
        variant="secondary"
        onPress={() => save.mutate()}
        loading={save.isPending}
        disabled={disabled || !valid || Number(value) === variant.quantity}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  flex: { flex: 1 },
  button: { marginTop: 24, minWidth: 96 },
});
