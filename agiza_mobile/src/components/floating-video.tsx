import { Image } from 'expo-image';
import { Play, X } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Text } from '@/components/ui/text';
import type { ProductVideo } from '@/lib/api/types';
import { SITE_URL } from '@/lib/config';
import { themed } from '@/theme/tokens';

const NAME = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram' } as const;

/**
 * The provider's own player in a page of ours: YouTube needs a referring site to play embeds, which a
 * bare URL load in a WebView doesn't send. Landscape YouTube videos are cropped to fill the portrait frame.
 */
function playerHtml(video: ProductVideo) {
  const fill = video.vertical || video.provider === 'tiktok';
  const frame = fill
    ? 'position:absolute;inset:0;width:100%;height:100%'
    : 'position:absolute;top:0;left:50%;height:100%;aspect-ratio:16/9;transform:translateX(-50%)';
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{border:0;${frame}}</style></head>
<body><iframe src="${video.embed_url}" allow="autoplay; encrypted-media" allowfullscreen></iframe></body></html>`;
}

/**
 * Pinduoduo-style product video: a small portrait player floating over the right side of the main
 * product photo. YouTube / TikTok play muted in their own players; Instagram (and any video that can't
 * be embedded) shows a preview that opens the original. Tapping the video opens it in its app; X closes it.
 */
export function FloatingVideo({
  video,
  galleryWidth,
  bottom,
}: {
  video: ProductVideo;
  galleryWidth: number;
  /** Distance from the photo's bottom edge (above the gallery's own overlays, e.g. the photo counter). */
  bottom?: number;
}) {
  const [closed, setClosed] = useState(false);
  const [failed, setFailed] = useState(false);
  if (closed) return null;
  // ~28% of the photo's width, within sensible limits on small and large phones.
  const width = Math.round(Math.min(150, Math.max(88, galleryWidth * 0.28)));
  const height = Math.round((width * 16) / 9);
  const open = () => Linking.openURL(video.url).catch(() => null);
  // Only the providers' own players are ever loaded (the server builds these links from the video id).
  const trusted = /^https:\/\/(www\.youtube-nocookie\.com\/embed\/|www\.tiktok\.com\/player\/v1\/)/.test(
    video.embed_url ?? '',
  );
  const embed = video.embeddable && trusted && !failed;

  return (
    <View
      style={[styles.card, { width, height }, bottom !== undefined && { bottom }]}
      accessibilityLabel={`Product video on ${NAME[video.provider]}`}>
      {embed ? (
        <WebView
          source={{ html: playerHtml(video), baseUrl: SITE_URL || 'https://agizastore.xyz' }}
          style={styles.web}
          originWhitelist={['https://*']}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          scrollEnabled={false}
          bounces={false}
          setSupportMultipleWindows={false}
          // The player stays inside its frame: any navigation away opens the original instead.
          onShouldStartLoadWithRequest={(req) =>
            req.isTopFrame === false ||
            req.url.startsWith(SITE_URL || 'https://agizastore.xyz') ||
            req.url === 'about:blank'
          }
          onError={() => setFailed(true)}
        />
      ) : video.thumbnail_url ? (
        <Image source={{ uri: video.thumbnail_url }} style={styles.web} contentFit="cover" />
      ) : (
        <View style={[styles.web, styles.placeholder]} />
      )}
      {/* The video plays muted; a tap opens it with sound in the provider's app. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Watch the video on ${NAME[video.provider]}`}
        onPress={open}
        style={styles.overlay}>
        {!embed ? (
          <>
            <View style={styles.play}>
              <Play size={16} color="#111111" fill="#111111" />
            </View>
            <Text variant="caption" color="#FFFFFF" style={styles.watch}>
              Watch on {NAME[video.provider]}
            </Text>
          </>
        ) : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close video"
        hitSlop={10}
        onPress={() => setClosed(true)}
        style={styles.close}>
        <X size={14} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = themed(() => ({
  card: {
    position: 'absolute',
    right: '3%',
    bottom: '10%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000000',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  web: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000' },
  placeholder: { backgroundColor: '#2A2A2A' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  watch: { position: 'absolute', bottom: 6, left: 4, right: 4, textAlign: 'center', fontSize: 10 },
  close: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
