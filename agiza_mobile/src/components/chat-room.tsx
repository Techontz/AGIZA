import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Mic, MessageCircle, Paperclip, Send, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ChatAttachments, ChatQuotationCard, formatDuration } from '@/components/chat-attachments';
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
  if (m.quotation) return <ChatQuotationCard q={m.quotation} />;
  const mine = m.from === 'me';
  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
      {!mine && m.author ? (
        <Text variant="caption" color={colors.primary}>
          {m.author} · AGIZA
        </Text>
      ) : null}
      {m.attachments?.length ? <ChatAttachments items={m.attachments} mine={mine} /> : null}
      {m.body ? (
        <Text variant="body" color={mine ? colors.onPrimary : colors.ink}>
          {m.body}
        </Text>
      ) : null}
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
  const added = (msg: ChatMessage) => {
    queryClient.setQueryData(key, (old: { messages: ChatMessage[] } | undefined) => ({
      messages: [...(old?.messages ?? []), msg],
    }));
    queryClient.invalidateQueries({ queryKey: keys.supportRooms });
  };
  const send = useMutation({
    mutationFn: (text: string) => supportApi.send(text, room),
    onSuccess: (msg) => {
      setBody('');
      added(msg);
    },
  });
  // A photo or document goes with the typed text as its caption; a voice note on its own.
  const sendFile = useMutation({
    mutationFn: (v: { file: { uri: string; name: string; type: string }; caption: string; durationMs?: number }) =>
      supportApi.sendFile(v.file, room, v.caption, v.durationMs),
    onSuccess: (msg, v) => {
      if (v.caption) setBody('');
      added(msg);
    },
  });
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recording = useAudioRecorderState(recorder, 250);
  const busy = send.isPending || sendFile.isPending;

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    const a = res.canceled ? null : res.assets[0];
    if (a) {
      sendFile.mutate({
        file: { uri: a.uri, name: a.fileName ?? 'photo.jpg', type: a.mimeType ?? 'image/jpeg' },
        caption: body.trim(),
      });
    }
  };
  const pickDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      copyToCacheDirectory: true,
    });
    const a = res.canceled ? null : res.assets[0];
    if (a) {
      sendFile.mutate({
        file: { uri: a.uri, name: a.name, type: a.mimeType ?? 'application/pdf' },
        caption: body.trim(),
      });
    }
  };
  const attach = () =>
    Alert.alert('Send a file', undefined, [
      { text: 'Photo', onPress: pickPhoto },
      { text: 'Document (PDF, Word, Excel)', onPress: pickDocument },
      { text: 'Cancel', style: 'cancel' },
    ]);
  const startRecording = async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Microphone needed', 'Allow AGIZA to use the microphone to send voice messages.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  };
  const stopRecording = async (keep: boolean) => {
    const durationMs = recording.durationMillis;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (keep && recorder.uri && durationMs >= 500) {
      sendFile.mutate({
        file: { uri: recorder.uri, name: 'voice-note.m4a', type: 'audio/mp4' },
        caption: '',
        durationMs,
      });
    }
  };
  const sendError = send.error ?? sendFile.error;

  if (messages.isLoading) return <Loading />;
  if (messages.isError) return <ErrorState error={messages.error} onRetry={() => messages.refetch()} />;
  const list = [...(messages.data?.messages ?? [])].reverse();

  return (
    <View style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}>
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
        {sendError ? (
          <View style={styles.error}>
            <Notice tone="danger">{errorMessage(sendError)}</Notice>
          </View>
        ) : null}
        {recording.isRecording ? (
          <View style={styles.composer} accessibilityLabel="Recording a voice message">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Discard voice message"
              onPress={() => stopRecording(false)}
              style={styles.iconButton}>
              <Trash2 size={20} color={colors.textMuted} />
            </Pressable>
            <View style={styles.recordingBar}>
              <View style={styles.dot} />
              <Text variant="bodyMedium" color={colors.ink}>
                Recording {formatDuration(recording.durationMillis)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send voice message"
              onPress={() => stopRecording(true)}
              style={styles.send}>
              <Send size={18} color={colors.onPrimary} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.composer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send a photo or document"
              disabled={busy}
              onPress={attach}
              style={[styles.iconButton, busy && styles.sendOff]}>
              <Paperclip size={20} color={colors.textMuted} />
            </Pressable>
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
            {body.trim() || busy ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                disabled={!body.trim() || busy}
                onPress={() => send.mutate(body.trim())}
                style={[styles.send, (!body.trim() || busy) && styles.sendOff]}>
                {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Send size={18} color={colors.onPrimary} />}
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Record a voice message"
                onPress={startRecording}
                style={styles.send}>
                <Mic size={18} color={colors.onPrimary} />
              </Pressable>
            )}
          </View>
        )}
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
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  recordingBar: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.dangerSoft,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  sendOff: { opacity: 0.5 },
}));
