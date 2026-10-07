import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Globe, ReceiptText } from 'lucide-react-native';
import { FlatList, View } from 'react-native';

import { SignInPrompt } from '@/components/sign-in-prompt';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, Loading } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { requestApi } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/session';
import { date, money } from '@/lib/format';
import { keys } from '@/lib/query';
import { QUOTE_TONE, requestKind, requestTitle } from '@/lib/requests';
import { colors, space, themed } from '@/theme/tokens';

export default function QuotationsScreen() {
  const { status } = useAuth();
  const requests = useQuery({ queryKey: keys.requests, queryFn: requestApi.list, enabled: status === 'signedIn' });
  if (status !== 'signedIn') {
    return (
      <SignInPrompt icon={ReceiptText} title="Your quotations" message="Sign in to request Buy for me or Deliver for me quotations." />
    );
  }
  if (requests.isLoading) return <Loading />;
  if (requests.isError) return <ErrorState error={requests.error} onRetry={() => requests.refetch()} />;
  return (
    <FlatList
      data={requests.data?.results ?? []}
      keyExtractor={(q) => String(q.id)}
      contentContainerStyle={styles.list}
      refreshing={requests.isRefetching}
      onRefresh={() => requests.refetch()}
      renderItem={({ item }) => (
        <Card onPress={() => router.push({ pathname: '/requests/[id]', params: { id: item.id } })}>
          <View style={styles.top}>
            <Text variant="small" color={colors.textMuted}>
              {item.reference} · {requestKind(item)}
            </Text>
            <Text variant="small" color={colors.textMuted}>
              {date(item.requested_at)}
            </Text>
          </View>
          <Text variant="subheading" color={colors.ink} numberOfLines={1} style={{ marginVertical: 4 }}>
            {requestTitle(item)}
          </Text>
          <View style={styles.top}>
            <Badge label={item.can_reply ? 'Quote ready: reply' : item.status_display} tone={QUOTE_TONE[item.status]} />
            {item.quoted_amount ? (
              <Text variant="subheading" color={colors.ink}>
                {money(item.quoted_amount, item.currency)}
              </Text>
            ) : null}
          </View>
        </Card>
      )}
      ListEmptyComponent={
        <EmptyState
          icon={Globe}
          title="Buy from anywhere"
          message="Tell us what you want from China, Dubai, the UK or elsewhere. We quote the full price including shipping, you approve, we deliver."
        />
      }
      ListFooterComponent={<Button title="New request" onPress={() => router.push('/requests/new')} style={{ marginTop: space.sm }} />}
    />
  );
}

const styles = themed(() => ({
  list: { padding: space.lg, gap: space.md, flexGrow: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
}));
