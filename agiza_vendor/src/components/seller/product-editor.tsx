import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Picker } from '@/components/picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { errorMessage, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { ApiError } from '@/lib/api/client';
import { sellerApi, shopApi } from '@/lib/api/endpoints';
import type { SellerProductDetail, SellerProductInput } from '@/lib/api/types';
import { keys } from '@/lib/query';
import { CONDITIONS, LISTING } from '@/lib/seller';
import { toast } from '@/lib/toast';
import { colors, radius, space } from '@/theme/tokens';

import { SwitchRow } from './switch-row';

type Status = 'draft' | 'active' | 'inactive';
type VariantRow = { key: string; id?: number; name: string; price: string; stock: string; status: 'active' | 'inactive' };

const STATUSES: { value: Status; label: string }[] = [
  { value: 'active', label: 'Active: show once approved' },
  { value: 'draft', label: 'Draft: not submitted' },
  { value: 'inactive', label: 'Hidden' },
];
const VARIANT_STATUS = [
  { value: 'active' as const, label: 'Active' },
  { value: 'inactive' as const, label: 'Hidden' },
];

const num = (v: string | null | undefined) => (v ? String(Number(v)) : '');
let rowKey = 0;
const newKey = () => `row-${++rowKey}`;

/**
 * A seller's product. What the seller can't decide (commission, stock location, featuring) isn't in
 * this form, and the server ignores it if sent anyway. Prices are sent as typed; the server validates them.
 */
export function ProductEditor({
  product,
  disabled,
  onCreated,
}: {
  product?: SellerProductDetail;
  disabled?: boolean;
  onCreated?: (p: SellerProductDetail) => void;
}) {
  const client = useQueryClient();
  const categories = useQuery({ queryKey: keys.categories, queryFn: shopApi.categories, staleTime: 600_000 });
  const [form, setForm] = useState({
    name: product?.name ?? '',
    description: product?.description ?? '',
    price: num(product?.price),
    compare_at_price: num(product?.compare_at_price),
    weight_kg: num(product?.weight_kg),
    keywords: product?.keywords ?? '',
    stock: String(product ? product.stock : 0),
  });
  const [category, setCategory] = useState<number | null>(product?.category ?? null);
  const [subcategory, setSubcategory] = useState<number>(product?.subcategory ?? 0);
  const [condition, setCondition] = useState(product?.condition || 'new');
  const [status, setStatus] = useState<Status>(product?.status === 'draft' || product?.status === 'inactive' ? product.status : 'active');
  const [hasVariations, setHasVariations] = useState(product?.has_variations ?? false);
  const [variants, setVariants] = useState<VariantRow[]>(
    product?.has_variations
      ? product.variants
          .filter((v) => !v.is_default)
          .map((v) => ({ key: newKey(), id: v.id, name: v.name, price: num(v.price), stock: String(v.quantity), status: v.status === 'inactive' ? 'inactive' : 'active' }))
      : [{ key: newKey(), name: '', price: '', stock: '0', status: 'active' }],
  );
  const [specs, setSpecs] = useState(
    (product?.specifications.length ? product.specifications : [{ name: '', value: '' }]).map((s) => ({ ...s, key: newKey() })),
  );
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const top = categories.data?.find((c) => c.id === category);
  const locked = disabled || product?.listing_state === 'disabled';

  const save = useMutation({
    mutationFn: () => {
      const data: SellerProductInput = {
        name: form.name.trim(),
        category: category ?? undefined,
        subcategory: subcategory || null,
        condition,
        description: form.description,
        price: form.price.trim(),
        compare_at_price: form.compare_at_price.trim() || null,
        weight_kg: form.weight_kg.trim(),
        keywords: form.keywords,
        status,
        has_variations: hasVariations,
        specifications: specs.filter((s) => s.name.trim() && s.value.trim()).map(({ name, value }) => ({ name: name.trim(), value: value.trim() })),
        ...(hasVariations
          ? {
              variants: variants
                .filter((v) => v.name.trim())
                .map((v) => ({ ...(v.id ? { id: v.id } : {}), name: v.name.trim(), price: v.price.trim() || null, stock: Number(v.stock) || 0, status: v.status })),
            }
          : { stock: Number(form.stock) || 0 }),
      };
      return product ? sellerApi.updateProduct(product.id, data) : sellerApi.createProduct(data);
    },
    onSuccess: (p) => {
      client.invalidateQueries({ queryKey: ['seller'] });
      client.setQueryData(keys.product(p.id), p);
      toast(p.listing_state === 'pending_review' ? 'Saved. AGIZA will review it before it goes live.' : 'Saved');
      if (!product) onCreated?.(p);
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const f = (name: string) => err?.field(name);
  const updateVariant = (i: number, patch: Partial<VariantRow>) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const updateSpec = (i: number, patch: Partial<{ name: string; value: string }>) => setSpecs((ss) => ss.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const canSave = form.name.trim() && category && form.price.trim() && form.weight_kg.trim();

  return (
    <View style={styles.wrap}>
      {product ? (
        <View style={styles.metaRow}>
          <Badge label={LISTING[product.listing_state]?.label ?? product.listing_state} tone={LISTING[product.listing_state]?.tone ?? 'neutral'} />
          <Text variant="small" color={colors.textMuted}>
            {product.reference} · SKU {product.sku}
          </Text>
        </View>
      ) : null}
      {product?.review_note && (product.listing_state === 'rejected' || product.listing_state === 'disabled') ? (
        <Notice tone="danger">Message from AGIZA: {product.review_note}</Notice>
      ) : null}
      {product?.listing_state === 'pending_review' ? (
        <Notice tone="warning">AGIZA is reviewing this product. It will appear in your store once approved.</Notice>
      ) : null}
      {product?.listing_state === 'disabled' ? <Notice tone="danger">AGIZA disabled this product, so it can&apos;t be edited.</Notice> : null}

      <Card style={styles.card}>
        <Text variant="heading" color={colors.ink}>
          Details
        </Text>
        <Input label="Product name" value={form.name} onChangeText={set('name')} maxLength={200} error={f('name')} editable={!locked} />
        <Picker
          label="Category"
          value={category}
          options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          onChange={(v) => {
            setCategory(v);
            setSubcategory(0);
          }}
          placeholder={categories.isLoading ? 'Loading categories…' : categories.isError ? "Couldn't load categories" : 'Choose a category'}
          error={f('category')}
          disabled={locked}
        />
        <Picker
          label="Subcategory (optional)"
          value={subcategory}
          options={[{ value: 0, label: 'None' }, ...(top?.children ?? []).map((c) => ({ value: c.id, label: c.name }))]}
          onChange={setSubcategory}
          error={f('subcategory')}
          disabled={locked || !top?.children.length}
        />
        <Picker label="Condition" value={condition} options={CONDITIONS} onChange={setCondition} error={f('condition')} disabled={locked} />
        <Input
          label="Search keywords (optional)"
          value={form.keywords}
          onChangeText={set('keywords')}
          maxLength={255}
          hint="Other words customers may search for."
          editable={!locked}
        />
        <Input label="Description" value={form.description} onChangeText={set('description')} maxLength={5000} multiline error={f('description')} editable={!locked} />
      </Card>

      <Card style={styles.card}>
        <Text variant="heading" color={colors.ink}>
          Price, weight and stock
        </Text>
        <Input label="Price (TZS)" value={form.price} onChangeText={set('price')} keyboardType="number-pad" error={f('price')} editable={!locked} />
        <Input
          label="Was price (optional)"
          value={form.compare_at_price}
          onChangeText={set('compare_at_price')}
          keyboardType="number-pad"
          hint="Shown struck through."
          error={f('compare_at_price')}
          editable={!locked}
        />
        <Input
          label="Weight (kg)"
          value={form.weight_kg}
          onChangeText={set('weight_kg')}
          keyboardType="decimal-pad"
          hint="Used to calculate delivery."
          error={f('weight_kg')}
          editable={!locked}
        />
        <SwitchRow label="This product has options (sizes, colours…)" value={hasVariations} onChange={setHasVariations} disabled={locked} />
        {!hasVariations ? (
          <Input label="Units in stock" value={form.stock} onChangeText={set('stock')} keyboardType="number-pad" error={f('stock')} editable={!locked} />
        ) : (
          <View style={styles.rows}>
            {f('variants') ? (
              <Text variant="small" color={colors.danger}>
                {f('variants')}
              </Text>
            ) : null}
            {variants.map((v, i) => (
              <View key={v.key} style={styles.variant}>
                <View style={styles.variantHead}>
                  <Text variant="smallMedium" color={colors.textMuted}>
                    Option {i + 1}
                  </Text>
                  <RemoveButton label={`Remove option ${i + 1}`} onPress={() => setVariants((vs) => vs.filter((_, j) => j !== i))} disabled={locked} />
                </View>
                <Input label="Name" placeholder="e.g. Red / L" value={v.name} onChangeText={(t) => updateVariant(i, { name: t })} editable={!locked} />
                <View style={styles.pair}>
                  <View style={styles.flex}>
                    <Input label="Price" placeholder="Product price" value={v.price} onChangeText={(t) => updateVariant(i, { price: t })} keyboardType="number-pad" editable={!locked} />
                  </View>
                  <View style={styles.flex}>
                    <Input label="Stock" value={v.stock} onChangeText={(t) => updateVariant(i, { stock: t })} keyboardType="number-pad" editable={!locked} />
                  </View>
                </View>
                <Picker label="Status" value={v.status} options={VARIANT_STATUS} onChange={(s) => updateVariant(i, { status: s })} disabled={locked} />
              </View>
            ))}
            <Text variant="caption" color={colors.textMuted}>
              Leave an option&apos;s price empty to use the product price.
            </Text>
            <Button
              title="Add option"
              variant="ghost"
              icon={<Plus size={18} color={colors.primary} />}
              disabled={locked}
              onPress={() => setVariants((vs) => [...vs, { key: newKey(), name: '', price: '', stock: '0', status: 'active' }])}
            />
          </View>
        )}
      </Card>

      <Card style={styles.card}>
        <Text variant="heading" color={colors.ink}>
          Specifications
        </Text>
        {specs.map((s, i) => (
          <View key={s.key} style={styles.specRow}>
            <View style={styles.flex}>
              <Input label="Specification" placeholder="e.g. Storage" value={s.name} onChangeText={(t) => updateSpec(i, { name: t })} editable={!locked} />
            </View>
            <View style={styles.flex}>
              <Input label="Value" placeholder="e.g. 128 GB" value={s.value} onChangeText={(t) => updateSpec(i, { value: t })} editable={!locked} />
            </View>
            <RemoveButton label={`Remove specification ${i + 1}`} onPress={() => setSpecs((ss) => ss.filter((_, j) => j !== i))} disabled={locked} />
          </View>
        ))}
        <Button
          title="Add specification"
          variant="ghost"
          icon={<Plus size={18} color={colors.primary} />}
          disabled={locked}
          onPress={() => setSpecs((ss) => [...ss, { key: newKey(), name: '', value: '' }])}
        />
      </Card>

      <Card style={styles.card}>
        <Picker label="Visibility" value={status} options={STATUSES} onChange={setStatus} error={f('status')} disabled={locked} />
        {save.isError ? <Notice tone="danger">{err?.hasFieldErrors ? `${errorMessage(save.error)} Check the highlighted fields.` : errorMessage(save.error)}</Notice> : null}
        <Button
          title={product ? 'Save changes' : status === 'active' ? 'Create and submit for review' : 'Create product'}
          onPress={() => save.mutate()}
          loading={save.isPending}
          disabled={locked || !canSave}
        />
      </Card>
    </View>
  );
}

function RemoveButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} style={[styles.remove, disabled && { opacity: 0.4 }]}>
      <Trash2 size={18} color={colors.danger} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  card: { gap: space.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  rows: { gap: space.md },
  variant: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.background },
  variantHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pair: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  specRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' },
  remove: { width: 44, height: 50, alignItems: 'center', justifyContent: 'center' },
});
