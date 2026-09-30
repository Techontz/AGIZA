import { Stack } from 'expo-router';
import { AlertTriangle, Clock, LogOut, XCircle } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ApplicationForm, TextButton } from '@/components/seller/application-form';
import { Badge } from '@/components/ui/badge';
import { Card, Divider } from '@/components/ui/card';
import { Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useStore } from '@/hooks/use-store';
import { useAuth } from '@/lib/auth/session';
import { dateTime } from '@/lib/format';
import { openSellerTerms } from '@/lib/links';
import { APPROVAL_TONE } from '@/lib/seller';
import { colors, space } from '@/theme/tokens';

const TEXT: Record<string, string> = {
  pending: 'Your application has been received. AGIZA will review it soon. You can still edit it until the review starts.',
  under_review: "AGIZA is reviewing your application. We'll notify you when there's a decision.",
  changes_requested: 'AGIZA needs a few changes before approving your store. Update your application and resubmit it.',
  rejected: "Your application wasn't approved.",
};

/** Pending / under review / changes requested / rejected: status, AGIZA's note, history, and editing when allowed. */
export default function ApplicationScreen() {
  const { signOut } = useAuth();
  const { store, refetch, isRefetching } = useStore();
  const [editing, setEditing] = useState(false);
  if (!store) return null;
  const Icon = store.approval_status === 'rejected' ? XCircle : store.approval_status === 'changes_requested' ? AlertTriangle : Clock;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[colors.brand]} />}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={signOut} hitSlop={8} style={styles.headerButton}>
              <LogOut size={20} color={colors.ink} />
            </Pressable>
          ),
        }}
      />
      <Card style={styles.card}>
        <View style={styles.head}>
          <View style={styles.icon}>
            <Icon size={24} color={colors.brand} />
          </View>
          <View style={styles.flex}>
            <Text variant="heading" color={colors.ink}>
              {store.name}
            </Text>
            <Badge label={store.approval_status_display} tone={APPROVAL_TONE[store.approval_status]} />
          </View>
        </View>
        <Text variant="body" color={colors.textMuted}>
          {TEXT[store.approval_status] ?? store.approval_status_display}
        </Text>
        {store.review_note && store.approval_status !== 'pending' ? (
          <Notice tone={store.approval_status === 'rejected' ? 'danger' : 'warning'}>Message from AGIZA: {store.review_note}</Notice>
        ) : null}
        {store.history.length ? (
          <>
            <Divider />
            {store.history.map((h, i) => (
              <View key={i} style={styles.historyRow}>
                <Text variant="small" color={colors.ink} style={styles.flex}>
                  {h.status_display}
                  {h.note ? ` · ${h.note}` : ''}
                </Text>
                <Text variant="small" color={colors.textMuted}>
                  {dateTime(h.at)}
                </Text>
              </View>
            ))}
          </>
        ) : null}
        {store.can_edit_application && !editing ? (
          <>
            <Divider />
            <TextButton
              title={store.approval_status === 'changes_requested' ? 'Update and resubmit my application' : 'Edit my application'}
              onPress={() => setEditing(true)}
            />
          </>
        ) : null}
      </Card>
      {editing ? <ApplicationForm store={store} onDone={() => setEditing(false)} /> : null}
      <Text variant="small" color={colors.textMuted} style={styles.center}>
        Pull down to check for updates. Questions? See the{' '}
        <Text variant="smallMedium" color={colors.primary} onPress={openSellerTerms} accessibilityRole="link">
          seller terms
        </Text>{' '}
        or contact AGIZA.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxxl },
  card: { gap: space.md },
  head: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: space.xs },
  historyRow: { flexDirection: 'row', gap: space.md, justifyContent: 'space-between' },
  center: { textAlign: 'center' },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
