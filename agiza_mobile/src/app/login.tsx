import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, type TextInput, View } from 'react-native';

import { Logo } from '@/components/brand';
import { FormScreen } from '@/components/form-screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { accountApi } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/session';
import { cleanPhone } from '@/lib/format';
import { colors, space } from '@/theme/tokens';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const passwordRef = useRef<TextInput>(null);
  const login = useMutation({
    mutationFn: () => accountApi.login(cleanPhone(phone), password),
    onSuccess: signIn, // the protected stack then closes the sign-in screens
  });
  const canSubmit = phone.trim().length >= 9 && password.length > 0;

  return (
    <FormScreen>
      <View style={styles.hero}>
        <Logo size={40} />
        <Text variant="body" color={colors.textMuted}>
          Sign in with your phone number
        </Text>
      </View>
      {login.isError ? <Notice tone="danger">{errorMessage(login.error)}</Notice> : null}
      <Input
        label="Phone number"
        value={phone}
        onChangeText={setPhone}
        placeholder="0712 345 678"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <Input
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => canSubmit && login.mutate()}
      />
      <Button title="Sign in" onPress={() => login.mutate()} loading={login.isPending} disabled={!canSubmit} />
      <Pressable accessibilityRole="link" onPress={() => router.push('/forgot-password')} style={styles.link}>
        <Text variant="smallMedium" color={colors.primary}>
          Forgot password?
        </Text>
      </Pressable>
      <View style={styles.divider} />
      <Text variant="body" color={colors.textMuted} style={styles.center}>
        New to AGIZA?
      </Text>
      <Button title="Create an account" variant="secondary" onPress={() => router.replace('/register')} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: space.sm, marginVertical: space.lg },
  link: { alignSelf: 'center', padding: space.sm },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  center: { textAlign: 'center' },
});
