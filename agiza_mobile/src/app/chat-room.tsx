import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatRoomView } from '@/components/chat-room';
import { colors, themed } from '@/theme/tokens';

/** /chat-room?room=order:ORD-1&title=Order ORD-1 (no room = general AGIZA Support). */
export default function ChatRoomScreen() {
  const { room = '', title } = useLocalSearchParams<{ room?: string; title?: string }>();
  const general = !room;
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: title || 'AGIZA Support' }} />
      <ChatRoomView room={room} about={general ? undefined : title} />
    </SafeAreaView>
  );
}

const styles = themed(() => ({ safe: { flex: 1, backgroundColor: colors.background } }));
