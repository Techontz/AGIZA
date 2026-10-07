import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokenStore } from '@/lib/auth/token-store';
import { colors, radius, space, themed } from '@/theme/tokens';

/** Thumbnails of private photos (they load with the customer's token); tap one to see it full screen. */
export function PrivatePhotos({ urls, label }: { urls: string[]; label: string }) {
  const token = useQuery({ queryKey: ['access-token'], queryFn: tokenStore.getAccess, staleTime: 5 * 60_000 });
  const [open, setOpen] = useState<string | null>(null);
  if (!token.data || !urls.length) return null;
  // Cached by URL (not by token), so photos seen once open instantly afterwards, even after a token refresh.
  const source = (uri: string) => ({ uri, cacheKey: uri, headers: { Authorization: `Bearer ${token.data}` } });

  return (
    <>
      <View style={styles.row}>
        {urls.map((uri, i) => (
          <Pressable
            key={uri}
            accessibilityRole="imagebutton"
            accessibilityLabel={`${label} ${i + 1} of ${urls.length}`}
            onPress={() => setOpen(uri)}>
            <Image source={source(uri)} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" transition={120} />
          </Pressable>
        ))}
      </View>
      <Modal visible={open !== null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <SafeAreaView style={styles.viewer}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close photo" onPress={() => setOpen(null)} style={styles.close}>
            <X size={24} color="#FFFFFF" />
          </Pressable>
          {open ? <Image source={source(open)} style={styles.full} contentFit="contain" cachePolicy="memory-disk" /> : null}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = themed(() => ({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  thumb: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  close: { alignSelf: 'flex-end', width: 48, height: 48, alignItems: 'center', justifyContent: 'center', margin: space.sm },
  full: { flex: 1, margin: space.md },
}));
