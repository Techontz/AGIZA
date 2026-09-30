import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/brand';
import { PhoneStep, ResendCode } from '@/components/code-step';
import { FormScreen } from '@/components/form-screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { ApiError } from '@/lib/api/client';
import { accountApi } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/session';
import { colors, space } from '@/theme/tokens';

export default function RegisterScreen() {
  const { signIn } = useAuth();
  const [phone, setPhone] = useState<string | null>(null);
  const [smsConfigured, setSmsConfigured] = useState(true);
  const [form, setForm] = useState({ code: '', full_name: '', email: '', password: '', confirm: '' });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const register = useMutation({
    mutationFn: () =>
      accountApi.register({ phone: phone!, code: form.code.trim(), full_name: form.full_name.trim(), email: form.email.trim(), password: form.password }),
    onSuccess: signIn, // the protected stack then closes the sign-in screens
  });
  const err = register.error instanceof ApiError ? register.error : null;
  const mismatch = form.confirm.length > 0 && form.confirm !== form.password;
  const canSubmit = form.code.trim().length === 6 && form.full_name.trim() && form.password.length >= 10 && !mismatch && form.confirm;

  return (
    <FormScreen>
      <View style={styles.hero}>
        <Logo size={36} />
        <Text variant="body" color={colors.textMuted}>
          {phone ? `Enter the code sent to ${phone}` : 'Create your AGIZA account. After that you can apply to open a store.'}
        </Text>
      </View>
      {!phone ? (
        <PhoneStep
          purpose="register"
          onSent={(p, sms) => {
            setPhone(p);
            setSmsConfigured(sms);
          }}
        />
      ) : (
        <>
          {!smsConfigured ? (
            <Notice tone="warning">Development server: SMS is not configured, so the code is in the backend log.</Notice>
          ) : null}
          {register.isError && !err?.details ? <Notice tone="danger">{errorMessage(register.error)}</Notice> : null}
          <Input
            label="Verification code"
            value={form.code}
            onChangeText={set('code')}
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            error={err?.field('code') ?? err?.field('phone')}
          />
          <ResendCode phone={phone} purpose="register" />
          <Input label="Full name" value={form.full_name} onChangeText={set('full_name')} autoComplete="name" error={err?.field('full_name')} />
          <Input
            label="Email (optional)"
            value={form.email}
            onChangeText={set('email')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            error={err?.field('email')}
          />
          <Input
            label="Password"
            value={form.password}
            onChangeText={set('password')}
            secureTextEntry
            autoComplete="new-password"
            error={err?.field('password')}
            hint="At least 10 characters. Avoid common or all-number passwords."
          />
          <Input
            label="Confirm password"
            value={form.confirm}
            onChangeText={set('confirm')}
            secureTextEntry
            error={mismatch ? "Passwords don't match." : undefined}
          />
          <Button title="Create account" onPress={() => register.mutate()} loading={register.isPending} disabled={!canSubmit} />
          <Pressable accessibilityRole="button" onPress={() => setPhone(null)} style={styles.link}>
            <Text variant="smallMedium" color={colors.primary}>
              Use a different number
            </Text>
          </Pressable>
        </>
      )}
      <Pressable accessibilityRole="link" onPress={() => router.replace('/login')} style={styles.link}>
        <Text variant="small" color={colors.textMuted}>
          Already have an account? <Text variant="smallMedium" color={colors.primary}>Sign in</Text>
        </Text>
      </Pressable>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: space.sm, marginVertical: space.lg },
  link: { alignSelf: 'center', padding: space.sm },
});
