import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { supportApi } from '@/lib/api/endpoints';
import type { ChatMessage } from '@/lib/api/types';
import { dateTime } from '@/lib/format';
import { keys } from '@/lib/query';
import { colors, fonts, radius, space } from '@/theme/tokens';

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
      <Text variant="body" color={mine ? '#FFFFFF' : colors.ink}>
        {m.body}
      </Text>
      <Text variant="caption" color={mine ? 'rgba(255,255,255,0.75)' : colors.textSubtle}>
        {dateTime(m.created_at)}
      </Text>
    </View>
  );
}

export default function SupportScreen() {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  // Replies arrive from the admin inbox; poll while the chat is open.
  const messages = useQuery({ queryKey: keys.support, queryFn: supportApi.messages, refetchInterval: 8000 });
  const send = useMutation({
    mutationFn: (text: string) => supportApi.send(text),
    onSuccess: (msg) => {
      setBody('');
      queryClient.setQueryData(keys.support, (old: { messages: ChatMessage[] } | undefined) => ({
        messages: [...(old?.messages ?? []), msg],
      }));
    },
  });

  if (messages.isLoading) return <Loading />;
  if (messages.isError) return <ErrorState error={messages.error} onRetry={() => messages.refetch()} />;
  const list = [...(messages.data?.messages ?? [])].reverse();

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          inverted
          data={list}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <Bubble m={item} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="body" color={colors.textMuted} style={styles.center}>
                Ask us anything about orders, delivery or payments. The AGIZA team replies here.
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
            {send.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Send size={18} color="#FFFFFF" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  list: { padding: space.lg, gap: space.sm, flexGrow: 1 },
  empty: { flex: 1, justifyContent: 'center', padding: space.xl, transform: [{ scaleY: -1 }] },
  center: { textAlign: 'center' },
  system: { alignSelf: 'center', textAlign: 'center' },
  bubble: { maxWidth: '82%', padding: space.md, borderRadius: radius.lg, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 4 },
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
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.5 },
});
