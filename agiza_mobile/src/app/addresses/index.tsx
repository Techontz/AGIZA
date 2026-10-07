import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { MapPin, Pencil, Trash2 } from 'lucide-react-native';
import { Alert, FlatList, Pressable, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { addressApi } from '@/lib/api/endpoints';
import { keys } from '@/lib/query';
import { colors, space, themed } from '@/theme/tokens';

export default function AddressesScreen() {
  const queryClient = useQueryClient();
  const addresses = useQuery({ queryKey: keys.addresses, queryFn: addressApi.list });
  const remove = useMutation({
    mutationFn: addressApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.addresses }),
  });
  const makeDefault = useMutation({
    mutationFn: (id: number) => addressApi.update(id, { is_default: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.addresses }),
  });

  if (addresses.isLoading) return <Loading />;
  if (addresses.isError) return <ErrorState error={addresses.error} onRetry={() => addresses.refetch()} />;

  return (
    <FlatList
      data={addresses.data ?? []}
      keyExtractor={(a) => String(a.id)}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        remove.isError || makeDefault.isError ? <Notice tone="danger">{errorMessage(remove.error ?? makeDefault.error)}</Notice> : null
      }
      renderItem={({ item }) => (
        <Card>
          <View style={styles.row}>
            <MapPin size={20} color={colors.primary} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.titleRow}>
                <Text variant="subheading" color={colors.ink}>
                  {item.label || item.city_name}
                </Text>
                {item.is_default ? <Badge label="Default" tone="brand" /> : null}
              </View>
              <Text variant="small" color={colors.textMuted}>
                {item.one_line}
                {item.region_name ? `, ${item.region_name}` : ''}
              </Text>
              {!item.is_default ? (
                <Pressable accessibilityRole="button" onPress={() => makeDefault.mutate(item.id)} hitSlop={6}>
                  <Text variant="smallMedium" color={colors.primary} style={{ marginTop: 4 }}>
                    Set as default
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable
              accessibilityLabel={`Edit ${item.label || 'address'}`}
              hitSlop={10}
              onPress={() => router.push({ pathname: '/addresses/edit', params: { id: item.id } })}>
              <Pencil size={18} color={colors.textMuted} />
            </Pressable>
            <Pressable
              accessibilityLabel={`Delete ${item.label || 'address'}`}
              hitSlop={10}
              onPress={() =>
                Alert.alert('Delete this address?', item.one_line, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(item.id) },
                ])
              }>
              <Trash2 size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        </Card>
      )}
      ListEmptyComponent={<EmptyState icon={MapPin} title="No saved addresses" message="Add where you'd like your orders delivered." />}
      ListFooterComponent={<Button title="Add address" onPress={() => router.push('/addresses/edit')} style={{ marginTop: space.sm }} />}
    />
  );
}

const styles = themed(() => ({
  list: { padding: space.lg, gap: space.md, flexGrow: 1 },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
}));
