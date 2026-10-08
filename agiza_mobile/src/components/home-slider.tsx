import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowRight, ChevronLeft, ChevronRight, Globe2, PackageCheck, ShoppingBag, type LucideIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { Text } from '@/components/ui/text';
import { shopApi } from '@/lib/api/endpoints';
import { appRouteFor } from '@/lib/links';
import { keys } from '@/lib/query';
import { colors, fonts, radius, space, themed } from '@/theme/tokens';

const ASPECT = 0.46; // banner height / width
const AUTO_ADVANCE_MS = 5000;

type Promo = {
  kind: 'promo';
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  href: Href;
  icon: LucideIcon;
  tone: 'flame' | 'night' | 'sand';
};
type Remote = { kind: 'image'; id: string; title: string; link: string | null; image: string };
type Slide = Promo | Remote;

/** Shown until staff add banners in the admin (Settings → App Home Sliders). */
const BUILT_IN: Promo[] = [
  {
    kind: 'promo',
    id: 'china',
    eyebrow: 'Agiza kutoka nje',
    title: 'Agiza kutoka China',
    subtitle: 'Tunanunua China, USA, UK, India na Dubai. Unalipa ukikubali bei',
    cta: 'Order sasa',
    href: '/requests/new',
    icon: Globe2,
    tone: 'flame',
  },
  {
    kind: 'promo',
    id: 'deliver',
    eyebrow: 'Deliver for me',
    title: 'Mzigo wako, tunaufikisha',
    subtitle: 'Umenunua nje? Tunasafirisha, tunatoa bandarini na kukuletea',
    cta: 'Tuma mzigo',
    href: { pathname: '/requests/new', params: { type: 'deliver_for_me' } },
    icon: PackageCheck,
    tone: 'night',
  },
  {
    kind: 'promo',
    id: 'shop',
    eyebrow: 'AGIZA Shop',
    title: 'Bidhaa zilizopitiwa tayari',
    subtitle: 'Zipo Tanzania, zinafika haraka. Lipia ukipokea',
    cta: 'Nunua sasa',
    href: '/shop',
    icon: ShoppingBag,
    tone: 'sand',
  },
];

/** Home-screen banners staff manage in the admin, falling back to AGIZA's own promos. */
export function HomeSlider() {
  const sliders = useQuery({ queryKey: keys.sliders, queryFn: shopApi.sliders, staleTime: 10 * 60_000 });
  const remote: Remote[] = (sliders.data ?? []).map((s) => ({ kind: 'image', id: `r${s.id}`, title: s.title, link: s.link, image: s.image }));
  const slides: Slide[] = remote.length ? remote : BUILT_IN;
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList<Slide>>(null);
  const touched = useRef(false); // stop auto-advancing once the customer swipes

  const go = (to: number) => {
    const next = (to + slides.length) % slides.length;
    list.current?.scrollToOffset({ offset: next * width, animated: true });
    setIndex(next);
  };

  useEffect(() => {
    if (slides.length < 2 || !width) return;
    const timer = setInterval(() => {
      if (!touched.current) go(index + 1);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  });

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width) setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };
  const open = (slide: Slide) => {
    if (slide.kind === 'promo') router.push(slide.href);
    else if (slide.link) {
      // An AGIZA product / store link (e.g. copied from the app's Share button) opens inside the app.
      const inApp = appRouteFor(slide.link);
      if (inApp) router.push(inApp);
      else WebBrowser.openBrowserAsync(slide.link).catch(() => null);
    }
  };
  const height = width * ASPECT;
  const current = slides[index];
  const onLight = current?.kind === 'promo' && TONES()[current.tone].light; // dark dots on light banners

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width ? (
        <FlatList
          ref={list}
          data={slides}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(s) => s.id}
          onScrollBeginDrag={() => (touched.current = true)}
          onMomentumScrollEnd={onScrollEnd}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          renderItem={({ item, index: i }) => (
            <Pressable
              accessibilityRole={item.kind === 'promo' || item.link ? 'link' : 'image'}
              accessibilityLabel={item.title || `Banner ${i + 1} of ${slides.length}`}
              disabled={item.kind === 'image' && !item.link}
              onPress={() => open(item)}
              style={{ width, height }}>
              {item.kind === 'promo' ? <PromoBanner promo={item} height={height} /> : <ImageBanner slide={item} />}
            </Pressable>
          )}
        />
      ) : (
        <View style={{ aspectRatio: 1 / ASPECT }} />
      )}
      {slides.length > 1 ? (
        <>
          <Arrow side="left" onPress={() => ((touched.current = true), go(index - 1))} />
          <Arrow side="right" onPress={() => ((touched.current = true), go(index + 1))} />
          <View style={styles.dots} pointerEvents="none">
            {slides.map((s, i) => (
              <View key={s.id} style={[styles.dot, onLight && styles.dotDark, i === index && (onLight ? styles.dotActiveDark : styles.dotActive)]} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

// Exact AGIZA brand yellow (#FCB800) with black text, as on agizastore.com; no orange.
const TONES = () => ({
  flame: { bg: '#FCB800', ring: 'rgba(18,18,18,0.06)', glow: '#121212', icon: '#FCB800', text: '#121212', sub: 'rgba(18,18,18,0.72)', chip: '#121212', chipText: '#FFFFFF', light: true },
  night: { bg: '#161412', ring: 'rgba(255,255,255,0.06)', glow: '#FCB800', icon: '#121212', text: '#FFFFFF', sub: 'rgba(255,255,255,0.72)', chip: '#FCB800', chipText: '#121212', light: false },
  sand: { bg: '#FFF6D6', ring: 'rgba(138,97,0,0.08)', glow: '#FCB800', icon: '#121212', text: '#121212', sub: 'rgba(18,18,18,0.7)', chip: '#121212', chipText: '#FFFFFF', light: true },
});

function PromoBanner({ promo, height }: { promo: Promo; height: number }) {
  const t = TONES()[promo.tone];
  const Icon = promo.icon;
  return (
    <View style={[styles.promo, { backgroundColor: t.bg }]}>
      {/* Decorative rings and a soft glow behind the icon. */}
      <View style={[styles.ring, { width: height * 1.5, height: height * 1.5, right: -height * 0.45, top: -height * 0.25, borderColor: t.ring }]} />
      <View style={[styles.ring, { width: height * 1.05, height: height * 1.05, right: -height * 0.22, top: height * 0.0, borderColor: t.ring }]} />
      <View style={[styles.glow, { right: height * 0.3, top: height * 0.24, width: height * 0.52, height: height * 0.52, backgroundColor: t.glow }]}>
        <Icon size={height * 0.24} color={t.icon} strokeWidth={1.6} />
      </View>
      <View style={styles.promoText}>
        <Text style={[styles.eyebrow, { color: t.sub }]} numberOfLines={1}>
          {promo.eyebrow}
        </Text>
        <Text style={[styles.promoTitle, { color: t.text }]} numberOfLines={2}>
          {promo.title}
        </Text>
        <Text style={[styles.promoSub, { color: t.sub }]} numberOfLines={2}>
          {promo.subtitle}
        </Text>
        <View style={[styles.chip, { backgroundColor: t.chip }]}>
          <Text style={[styles.chipText, { color: t.chipText }]}>{promo.cta}</Text>
          <ArrowRight size={14} color={t.chipText} />
        </View>
      </View>
    </View>
  );
}

function ImageBanner({ slide }: { slide: Remote }) {
  return (
    <>
      <Image source={{ uri: slide.image }} style={styles.image} contentFit="cover" transition={200} />
      {slide.title ? (
        <View style={styles.caption}>
          <Text style={styles.captionTitle} color="#FFFFFF" numberOfLines={2}>
            {slide.title}
          </Text>
        </View>
      ) : null}
    </>
  );
}

function Arrow({ side, onPress }: { side: 'left' | 'right'; onPress: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={side === 'left' ? 'Previous banner' : 'Next banner'}
      onPress={onPress}
      hitSlop={8}
      style={[styles.arrow, side === 'left' ? { left: space.sm } : { right: space.sm }]}>
      <Icon size={18} color="#121212" />
    </Pressable>
  );
}

const styles = themed(() => ({
  wrap: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  promo: { flex: 1, overflow: 'hidden' },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 18 },
  glow: { position: 'absolute', borderRadius: 999, alignItems: 'center', justifyContent: 'center', opacity: 0.95 },
  promoText: { flex: 1, justifyContent: 'center', paddingLeft: 52, paddingRight: '38%', gap: 4 },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase' },
  promoTitle: { fontFamily: fonts.bold, fontSize: 21, lineHeight: 25, letterSpacing: -0.4 },
  promoSub: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  chipText: { fontFamily: fonts.semibold, fontSize: 13 },
  image: { width: '100%', height: '100%' },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.xxl + space.lg,
    paddingTop: space.md,
    paddingBottom: space.xl,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  captionTitle: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 23 },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: { position: 'absolute', bottom: space.md + 2, right: space.xl, flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotActive: { width: 20, backgroundColor: '#FFFFFF' },
  dotDark: { backgroundColor: 'rgba(18,18,18,0.25)' },
  dotActiveDark: { width: 20, backgroundColor: '#121212' },
}));
