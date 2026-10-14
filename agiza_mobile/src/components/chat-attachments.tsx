import { useQuery } from '@tanstack/react-query';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { FileText, Pause, Play, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import type { ChatAttachment, ChatQuotation } from '@/lib/api/types';
import { tokenStore } from '@/lib/auth/token-store';
import { openPrivateFile } from '@/lib/private-file';
import { date, money } from '@/lib/format';
import { colors, radius, space, themed } from '@/theme/tokens';

/** Chat files load with the customer's token (they're private to the conversation). */
function useAuthHeaders() {
  const token = useQuery({ queryKey: ['access-token'], queryFn: tokenStore.getAccess, staleTime: 5 * 60_000 });
  return token.data ? { Authorization: `Bearer ${token.data}` } : null;
}

export function formatDuration(ms: number | null | undefined) {
  const s = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function ChatImage({ a }: { a: ChatAttachment }) {
  const headers = useAuthHeaders();
  const [open, setOpen] = useState(false);
  if (!headers) return <View style={styles.image} />;
  const source = { uri: a.url, cacheKey: a.url, headers };
  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel="Photo, tap to enlarge"
        onPress={() => setOpen(true)}>
        <Image source={source} style={styles.image} contentFit="cover" cachePolicy="memory-disk" transition={120} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.viewer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            onPress={() => setOpen(false)}
            style={styles.close}>
            <X size={24} color="#FFFFFF" />
          </Pressable>
          <Image source={source} style={styles.full} contentFit="contain" cachePolicy="memory-disk" />
        </SafeAreaView>
      </Modal>
    </>
  );
}

function VoiceNote({ a, mine }: { a: ChatAttachment; mine: boolean }) {
  const headers = useAuthHeaders();
  const player = useAudioPlayer(headers ? { uri: a.url, headers } : null);
  const status = useAudioPlayerStatus(player);
  const total = status.duration > 0 ? status.duration * 1000 : a.duration_ms;
  const toggle = () => {
    if (status.playing) return player.pause();
    void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.05)) player.seekTo(0);
    player.play();
  };
  const tint = mine ? colors.onPrimary : colors.ink;
  const progress = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;
  return (
    <View style={styles.voice}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause voice message' : 'Play voice message'}
        onPress={toggle}
        disabled={!headers}
        hitSlop={8}
        style={[styles.play, { borderColor: tint }]}>
        {status.isBuffering && !status.playing ? (
          <ActivityIndicator size="small" color={tint} />
        ) : status.playing ? (
          <Pause size={16} color={tint} />
        ) : (
          <Play size={16} color={tint} />
        )}
      </Pressable>
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${progress * 100}%`, backgroundColor: tint }]} />
      </View>
      <Text variant="caption" color={tint}>
        {formatDuration(status.playing || status.currentTime > 0 ? status.currentTime * 1000 : total)}
      </Text>
    </View>
  );
}

function Document({ a, mine }: { a: ChatAttachment; mine: boolean }) {
  const [busy, setBusy] = useState(false);
  // Download with the token, then let the phone open it ("Open with…" / share sheet).
  const open = async () => {
    setBusy(true);
    try {
      await openPrivateFile(a.url, `${a.id}-${a.name}`, a.content_type);
    } catch {
      Alert.alert("Couldn't open the file", 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  const tint = mine ? colors.onPrimary : colors.ink;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${a.name}`} onPress={open} style={styles.doc}>
      {busy ? <ActivityIndicator size="small" color={tint} /> : <FileText size={20} color={tint} />}
      <View style={{ flexShrink: 1 }}>
        <Text variant="smallMedium" color={tint} numberOfLines={1}>
          {a.name}
        </Text>
        <Text variant="caption" color={mine ? colors.onPrimary : colors.textMuted}>
          {Math.max(1, Math.round(a.size / 1024))} KB · Tap to open
        </Text>
      </View>
    </Pressable>
  );
}

export function ChatAttachments({ items, mine }: { items: ChatAttachment[]; mine: boolean }) {
  return (
    <View style={{ gap: space.xs }}>
      {items.map((a) =>
        a.kind === 'image' ? (
          <ChatImage key={a.id} a={a} />
        ) : a.kind === 'voice' ? (
          <VoiceNote key={a.id} a={a} mine={mine} />
        ) : (
          <Document key={a.id} a={a} mine={mine} />
        ),
      )}
    </View>
  );
}

/** A quotation AGIZA sent in the chat: tap to see it and accept or decline. */
export function ChatQuotationCard({ q }: { q: ChatQuotation }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Quotation ${q.reference}, ${money(q.amount, q.currency)}. Open it`}
      onPress={() => router.push({ pathname: '/requests/[id]', params: { id: q.id } })}
      style={styles.quote}>
      <Text variant="overline" color={colors.textMuted}>
        Quotation {q.reference}
      </Text>
      <Text variant="heading" color={colors.ink}>
        {money(q.amount, q.currency)}
      </Text>
      {q.estimated_delivery ? (
        <Text variant="small" color={colors.textMuted}>
          Estimated delivery {date(q.estimated_delivery)}
        </Text>
      ) : null}
      <View style={[styles.quoteAction, !q.can_reply && styles.quoteDone]}>
        <Text variant="smallMedium" color={q.can_reply ? colors.onPrimary : colors.ink}>
          {q.can_reply ? 'Review & accept' : q.status_display}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = themed(() => ({
  image: { width: 200, height: 200, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  close: {
    alignSelf: 'flex-end',
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    margin: space.sm,
  },
  full: { flex: 1, margin: space.md },
  voice: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minWidth: 200 },
  play: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  track: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(127,127,127,0.3)', overflow: 'hidden' },
  trackFill: { height: 3 },
  doc: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs, minWidth: 180 },
  quote: {
    alignSelf: 'flex-start',
    maxWidth: '82%',
    minWidth: 220,
    gap: 4,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  quoteAction: {
    marginTop: space.xs,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  quoteDone: { backgroundColor: colors.surfaceMuted },
}));
