import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { colors, fonts, radius, space } from '@/theme/tokens';

import { Text } from './text';

type Props = TextInputProps & { label: string; error?: string; hint?: string };

export const Input = forwardRef<TextInput, Props>(function Input({ label, error, hint, style, ...props }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text variant="smallMedium" color={colors.text}>
        {label}
      </Text>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textSubtle}
        accessibilityLabel={label}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          styles.input,
          props.multiline && styles.multiline,
          focused && styles.focused,
          !!error && styles.invalid,
          style,
        ]}
      />
      {error ? (
        <Text variant="small" color={colors.danger}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" color={colors.textMuted}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  multiline: { minHeight: 96, paddingTop: space.md, textAlignVertical: 'top' },
  focused: { borderColor: colors.brand },
  invalid: { borderColor: colors.danger },
});
