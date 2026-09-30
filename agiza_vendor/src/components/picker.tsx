import { Check, ChevronDown, Search, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { colors, fonts, radius, space } from '@/theme/tokens';

export type PickerOption<T extends string | number> = { value: T; label: string; detail?: string };

/** A select field that opens a full-screen list; long lists (cities, categories) get a search box. */
export function Picker<T extends string | number>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Choose…',
  error,
  hint,
  disabled = false,
}: {
  label: string;
  value: T | null;
  options: PickerOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const searchable = options.length > 8;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? options.filter((o) => `${o.label} ${o.detail ?? ''}`.toLowerCase().includes(q)) : options;
  }, [options, search]);

  return (
    <View style={styles.wrap}>
      <Text variant="smallMedium">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.field, !!error && styles.invalid, disabled && styles.disabled]}>
        <Text variant="body" color={selected ? colors.ink : colors.textSubtle} style={{ flex: 1 }}>
          {selected ? selected.label : placeholder}
        </Text>
        <ChevronDown size={18} color={colors.textMuted} />
      </Pressable>
      {error ? (
        <Text variant="small" color={colors.danger}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" color={colors.textMuted}>
          {hint}
        </Text>
      ) : null}
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHead}>
            <Text variant="heading" color={colors.ink}>
              {label}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={styles.close} onPress={() => setOpen(false)}>
              <X size={22} color={colors.ink} />
            </Pressable>
          </View>
          {searchable ? (
            <View style={styles.search}>
              <Search size={18} color={colors.textMuted} />
              <TextInput
                autoFocus
                value={search}
                onChangeText={setSearch}
                placeholder="Search"
                accessibilityLabel={`Search ${label}`}
                placeholderTextColor={colors.textSubtle}
                style={styles.searchInput}
              />
            </View>
          ) : null}
          <FlatList
            data={filtered}
            keyExtractor={(o) => String(o.value)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: item.value === value }}
                onPress={() => {
                  onChange(item.value);
                  setOpen(false);
                  setSearch('');
                }}
                style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.background }]}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" color={colors.ink}>
                    {item.label}
                  </Text>
                  {item.detail ? (
                    <Text variant="small" color={colors.textMuted}>
                      {item.detail}
                    </Text>
                  ) : null}
                </View>
                {item.value === value ? <Check size={18} color={colors.primary} /> : null}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  field: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
  },
  invalid: { borderColor: colors.danger },
  disabled: { opacity: 0.55 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  modal: { flex: 1, backgroundColor: colors.surface },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: space.lg, paddingRight: space.sm, paddingVertical: space.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  searchInput: { flex: 1, minHeight: 44, fontFamily: fonts.regular, fontSize: 16, color: colors.ink },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
