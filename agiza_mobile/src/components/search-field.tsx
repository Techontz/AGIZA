import { Search, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { colors, fonts, radius, space, themed } from '@/theme/tokens';

/** The shop's search box. Reports the trimmed text once typing pauses; searching itself happens on the server. */
export function SearchField({
  placeholder,
  accessibilityLabel,
  onSearch,
}: {
  placeholder: string;
  accessibilityLabel: string;
  onSearch: (value: string) => void;
}) {
  const [text, setText] = useState('');

  useEffect(() => {
    const t = setTimeout(() => onSearch(text.trim()), 350); // wait for typing to pause
    return () => clearTimeout(t);
  }, [text, onSearch]);

  return (
    <View style={styles.search}>
      <Search size={18} color={colors.textMuted} />
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        returnKeyType="search"
        accessibilityLabel={accessibilityLabel}
        style={styles.input}
      />
      {text ? (
        <Pressable accessibilityLabel="Clear search" hitSlop={8} onPress={() => setText('')}>
          <X size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = themed(() => ({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, paddingVertical: space.sm },
}));
