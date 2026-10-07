import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Warehouse } from 'lucide-react-native';
import { FlatList, View } from 'react-native';

import { WarehouseCard } from '@/components/warehouse-card';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Loading } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { shopApi } from '@/lib/api/endpoints';
import { openChatRoom } from '@/lib/chat';
import { keys } from '@/lib/query';
import { colors, space, themed } from '@/theme/tokens';

/** AGIZA's receiving warehouses abroad: where customers have suppliers send "Deliver for me" parcels. */
export default function ShippingAddressesScreen() {
  const warehouses = useQuery({ queryKey: keys.warehouses, queryFn: shopApi.warehouses, staleTime: 60 * 60_000 });
  if (warehouses.isLoading) return <Loading />;
  if (warehouses.isError) return <ErrorState error={warehouses.error} onRetry={() => warehouses.refetch()} />;

  return (
    <FlatList
      data={warehouses.data?.results ?? []}
      keyExtractor={(w) => String(w.id)}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.intro}>
          <Text variant="title" color={colors.ink}>
            Ship to AGIZA abroad
          </Text>
          <Text variant="body" color={colors.textMuted}>
            Bought from a supplier abroad? Give them the AGIZA address in that country. Put your name and phone number on
            the parcel, then send a Deliver for me request with the tracking number.
          </Text>
          <Button
            title="Send a Deliver for me request"
            variant="dark"
            onPress={() => router.push({ pathname: '/requests/new', params: { type: 'deliver_for_me' } })}
          />
        </View>
      }
      renderItem={({ item }) => <WarehouseCard warehouse={item} />}
      ListEmptyComponent={
        <EmptyState
          icon={Warehouse}
          title="Addresses coming soon"
          message="Ask AGIZA in chat where your supplier should send the parcel."
          action={<Button title="Chat with AGIZA" onPress={() => openChatRoom('', 'AGIZA Support')} />}
        />
      }
    />
  );
}

const styles = themed(() => ({
  list: { padding: space.lg, gap: space.md, paddingBottom: space.xxxl },
  intro: { gap: space.md, marginBottom: space.sm },
}));
