import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Headset, MessageCircle, Package, PackageX, ReceiptText, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { SignInPrompt } from '@/components/sign-in-prompt';
import { ErrorState, Loading } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { supportApi } from '@/lib/api/endpoints';
import type { ChatRoom } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/session';
import { openChatRoom } from '@/lib/chat';
import { dateTime } from '@/lib/format';
import { keys } from '@/lib/query';
import { colors, radius, shadow, space, themed } from '@/theme/tokens';

const ICON: Record<ChatRoom['kind'], LucideIcon> = { general: Headset, order: Package, quote: ReceiptText, return: PackageX };

function RoomRow({ room }: { room: ChatRoom }) {
  const Icon = ICON[room.kind];
  const general = room.kind === 'general';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${room.title}${room.preview ? `. Last message: ${room.preview}` : ''}`}
      onPress={() => openChatRoom(room.key, room.title)}
      style={({ pressed }) => [styles.row, general && styles.general, pressed && styles.pressed]}>
      <View style={[styles.icon, general && { backgroundColor: colors.brand }]}>
        <Icon size={20} color={general ? colors.onPrimary : colors.ink} />
      </View>
      <View style={styles.body}>
        <View style={styles.top}>
          <Text variant="subheading" color={colors.ink} numberOfLines={1} style={styles.title}>
            {room.title}
          </Text>
          {room.last_message_at ? (
            <Text variant="caption" color={colors.textSubtle}>
              {dateTime(room.last_message_at)}
            </Text>
          ) : null}
        </View>
        <Text variant="small" color={colors.textMuted} numberOfLines={1}>
          {room.preview || (general ? 'Questions about anything? We reply here.' : 'Start the conversation')}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.textSubtle} />
    </Pressable>
  );
}

// A quotation's chat moves to its order once approved, so each conversation shows under one filter.
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'quote', label: 'Quotations' },
  { value: 'order', label: 'Orders' },
  { value: 'return', label: 'Returns' },
] as const;
type Filter = (typeof FILTERS)[number]['value'];

export default function ChatScreen() {
  const { status } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');
  const rooms = useQuery({
    queryKey: keys.supportRooms,
    queryFn: supportApi.rooms,
    enabled: status === 'signedIn',
    refetchInterval: 20_000,
  });
  if (status !== 'signedIn') {
    return <SignInPrompt icon={MessageCircle} title="Chat with AGIZA" message="Sign in to ask about orders, delivery or payments." />;
  }
  if (rooms.isLoading) return <Loading />;
  if (rooms.isError) return <ErrorState error={rooms.error} onRetry={() => rooms.refetch()} />;

  return (
    <FlatList
      data={(rooms.data?.rooms ?? []).filter((r) => filter === 'all' || r.kind === filter)}
      keyExtractor={(r) => r.key || 'general'}
      contentContainerStyle={styles.list}
      refreshing={rooms.isRefetching}
      onRefresh={() => rooms.refetch()}
      renderItem={({ item }) => <RoomRow room={item} />}
      ListHeaderComponent={
        <View style={styles.filters} accessibilityRole="tablist">
          {FILTERS.map((f) => {
            const active = filter === f.value;
            const n = f.value === 'all' ? null : (rooms.data?.rooms ?? []).filter((r) => r.kind === f.value).length;
            return (
              <Pressable
                key={f.value}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setFilter(f.value)}
                style={[styles.chip, active && styles.chipActive]}>
                <Text variant="smallMedium" color={active ? colors.onPrimary : colors.text}>
                  {n ? `${f.label} · ${n}` : f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      }
      ListEmptyComponent={
        <Text variant="small" color={colors.textMuted} style={styles.hint}>
          {filter === 'quote'
            ? 'No quotation chats. Open a quotation and tap “Chat with AGIZA”.'
            : filter === 'order'
              ? 'No order chats. Open an order and tap “Chat with AGIZA”.'
              : 'No return chats yet.'}
        </Text>
      }
      ListFooterComponent={
        <Text variant="caption" color={colors.textMuted} style={styles.hint}>
          To chat about a specific order, quotation or return, open it and tap “Chat with AGIZA”.
        </Text>
      }
    />
  );
}

const styles = themed(() => ({
  list: { padding: space.lg, gap: space.sm },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  general: { ...shadow.card, marginBottom: space.sm },
  pressed: { opacity: 0.9 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  body: { flex: 1, gap: 2 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { flex: 1 },
  hint: { textAlign: 'center', marginTop: space.lg, paddingHorizontal: space.lg },
}));
