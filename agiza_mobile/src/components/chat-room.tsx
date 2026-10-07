import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Send } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { supportApi } from '@/lib/api/endpoints';
import type { ChatMessage } from '@/lib/api/types';
import { dateTime } from '@/lib/format';
import { keys } from '@/lib/query';
import { colors, fonts, radius, space, themed } from '@/theme/tokens';

function Bubble({ m }: { m: ChatMessage }) {
  if (m.from === 'system') {
    return (
      <Text variant="caption" color={colors.textSubtle} style={styles.system}>
        {m.body}
      </Text>
    );
  }
  const mine = m.from === 'me';
  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
      {!mine && m.author ? (
        <Text variant="caption" color={colors.primary}>
          {m.author} · AGIZA
        </Text>
      ) : null}
      <Text variant="body" color={mine ? colors.onPrimary : colors.ink}>
        {m.body}
      </Text>
      <Text variant="caption" color={mine ? colors.onPrimary : colors.textSubtle} style={mine && styles.mineTime}>
        {dateTime(m.created_at)}
      </Text>
    </View>
  );
}

/**
 * One chat room with AGIZA: general support (`room` = '') or a conversation about an order,
 * quotation or return (`order:<ref>`, `quote:<id>`, `return:<ref>`). Staff reply from the admin inbox.
 */
export function ChatRoomView({ room, about }: { room: string; about?: string }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const key = keys.supportRoom(room);
  // Replies arrive from the admin inbox; poll while the chat is open.
  const messages = useQuery({ queryKey: key, queryFn: () => supportApi.messages(room), refetchInterval: 8000 });
  const send = useMutation({
    mutationFn: (text: string) => supportApi.send(text, room),
    onSuccess: (msg) => {
      setBody('');
      queryClient.setQueryData(key, (old: { messages: ChatMessage[] } | undefined) => ({
        messages: [...(old?.messages ?? []), msg],
      }));
      queryClient.invalidateQueries({ queryKey: keys.supportRooms });
    },
  });

  if (messages.isLoading) return <Loading />;
  if (messages.isError) return <ErrorState error={messages.error} onRetry={() => messages.refetch()} />;
  const list = [...(messages.data?.messages ?? [])].reverse();

  return (
    <View style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          inverted
          data={list}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <Bubble m={item} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <MessageCircle size={26} color={colors.primary} />
              </View>
              <Text variant="heading" color={colors.ink} style={styles.center}>
                {about ? `Chat about ${about}` : 'Chat with AGIZA Support'}
              </Text>
              <Text variant="body" color={colors.textMuted} style={styles.center}>
                {about
                  ? `Ask anything about ${about}. Type your message below and our team will reply here.`
                  : 'Ask about your orders, delivery or payments. Type your message below and our team will reply here.'}
              </Text>
            </View>
          }
        />
        {send.isError ? (
          <View style={styles.error}>
            <Notice tone="danger">{errorMessage(send.error)}</Notice>
          </View>
        ) : null}
        <View style={styles.composer}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Type a message"
            placeholderTextColor={colors.textSubtle}
            multiline
            maxLength={2000}
            accessibilityLabel="Message"
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            disabled={!body.trim() || send.isPending}
            onPress={() => send.mutate(body.trim())}
            style={[styles.send, (!body.trim() || send.isPending) && styles.sendOff]}>
            {send.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Send size={18} color={colors.onPrimary} />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = themed(() => ({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  list: { padding: space.lg, gap: space.sm, flexGrow: 1 },
  // No flip here: an inverted FlatList already shows its empty component the right way up.
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.xl },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    marginBottom: space.xs,
  },
  mineTime: { opacity: 0.7 },
  center: { textAlign: 'center' },
  system: { alignSelf: 'center', textAlign: 'center' },
  bubble: { maxWidth: '82%', padding: space.md, borderRadius: radius.lg, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  error: { paddingHorizontal: space.lg },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    padding: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.5 },
}));
