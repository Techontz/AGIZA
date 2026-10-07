import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { Bell, ChevronRight } from 'lucide-react-native';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';

import { EmptyState, ErrorState, errorMessage, Loading, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { openNotificationTarget } from '@/hooks/use-notifications';
import { notificationApi } from '@/lib/api/endpoints';
import type { InboxNotification, NotificationPage } from '@/lib/api/types';
import { dateTime } from '@/lib/format';
import { keys } from '@/lib/query';
import { colors, radius, shadow, space, themed } from '@/theme/tokens';

type Pages = InfiniteData<NotificationPage, number>;

/** The customer's notification inbox (the same messages sent as push notifications). */
export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const listKey = [...keys.notifications, 'list'];
  const list = useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam }) => notificationApi.list(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.total_pages ? last.page + 1 : undefined),
  });

  const markLocal = (ids: number[] | null, unread: number) => {
    queryClient.setQueryData<Pages>(listKey, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((p) => ({
              ...p,
              unread,
              results: p.results.map((n) => (ids === null || ids.includes(n.id) ? { ...n, read: true } : n)),
            })),
          }
        : data,
    );
    queryClient.setQueryData<NotificationPage>(keys.unread, (data) => (data ? { ...data, unread } : data));
  };

  const markAll = useMutation({
    mutationFn: () => notificationApi.markRead(),
    onSuccess: (res) => markLocal(null, res.unread),
  });
  const markOne = useMutation({
    mutationFn: (id: number) => notificationApi.markRead([id]),
    onSuccess: (res, id) => markLocal([id], res.unread),
  });

  const open = (n: InboxNotification) => {
    if (!n.read) markOne.mutate(n.id);
    openNotificationTarget(n);
  };

  const unread = list.data?.pages[0]?.unread ?? 0;
  const items = list.data?.pages.flatMap((p) => p.results) ?? [];

  const header = (
    <Stack.Screen
      options={{
        title: 'Notifications',
        headerRight: () =>
          unread > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Mark all ${unread} notifications as read`}
              onPress={() => markAll.mutate()}
              disabled={markAll.isPending}
              style={styles.markAll}>
              {markAll.isPending ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text variant="smallMedium" color={colors.primary}>
                  Mark all read
                </Text>
              )}
            </Pressable>
          ) : null,
      }}
    />
  );

  if (list.isLoading) {
    return (
      <>
        {header}
        <Loading />
      </>
    );
  }
  if (list.isError) {
    return (
      <>
        {header}
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      </>
    );
  }

  return (
    <>
      {header}
      <FlatList
        data={items}
        keyExtractor={(n) => String(n.id)}
        contentContainerStyle={styles.content}
        refreshing={list.isRefetching && !list.isFetchingNextPage}
        onRefresh={() => {
          list.refetch();
          queryClient.invalidateQueries({ queryKey: keys.unread });
        }}
        onEndReachedThreshold={0.5}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        ListHeaderComponent={markAll.isError ? <Notice tone="danger">{errorMessage(markAll.error)}</Notice> : null}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.read ? '' : 'Unread. '}${item.title}. ${item.body}`}
            onPress={() => open(item)}
            style={({ pressed }) => [styles.item, !item.read && styles.unread, pressed && styles.pressed]}>
            <View style={[styles.dot, item.read && styles.dotRead]} />
            <View style={styles.flex}>
              <Text variant={item.read ? 'bodyMedium' : 'subheading'} color={colors.ink} numberOfLines={2}>
                {item.title}
              </Text>
              {item.body ? (
                <Text variant="small" color={colors.text} numberOfLines={3}>
                  {item.body}
                </Text>
              ) : null}
              <Text variant="caption" color={colors.textMuted}>
                {dateTime(item.created_at)}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textSubtle} />
          </Pressable>
        )}
        ListEmptyComponent={
          <EmptyState icon={Bell} title="No notifications yet" message="Updates about your orders, payments and returns will show here." />
        }
        ListFooterComponent={
          list.isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null
        }
      />
    </>
  );
}

const styles = themed(() => ({
  content: { padding: space.lg, gap: space.sm, flexGrow: 1 },
  markAll: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: space.xs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  unread: { backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.85 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  dotRead: { backgroundColor: 'transparent' },
  flex: { flex: 1, gap: 2 },
  footer: { padding: space.lg },
}));
