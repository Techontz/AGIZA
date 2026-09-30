import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { PhoneStep, ResendCode } from '@/components/code-step';
import { FormScreen } from '@/components/form-screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { ApiError } from '@/lib/api/client';
import { accountApi } from '@/lib/api/endpoints';
import { colors } from '@/theme/tokens';

export default function ForgotPasswordScreen() {
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const reset = useMutation({
    mutationFn: () => accountApi.resetPassword({ phone: phone!, code: code.trim(), password }),
  });
  const err = reset.error instanceof ApiError ? reset.error : null;

  if (reset.isSuccess) {
    return (
      <FormScreen>
        <Notice tone="success">Your password was changed. Sign in with the new password.</Notice>
        <Button title="Sign in" onPress={() => router.replace('/login')} />
      </FormScreen>
    );
  }

  return (
    <FormScreen>
      <Text variant="body" color={colors.textMuted}>
        {phone
          ? `If ${phone} has an AGIZA account, we sent it a 6-digit code.`
          : 'Enter the phone number of your account. We will send you a code to set a new password.'}
      </Text>
      {!phone ? (
        <PhoneStep purpose="reset_password" onSent={(p) => setPhone(p)} />
      ) : (
        <>
          {reset.isError && !err?.details ? <Notice tone="danger">{errorMessage(reset.error)}</Notice> : null}
          <Input
            label="Verification code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="sms-otp"
            error={err?.field('code')}
          />
          <ResendCode phone={phone} purpose="reset_password" />
          <Input
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            error={err?.field('password')}
            hint="At least 10 characters."
          />
          <Button
            title="Set new password"
            onPress={() => reset.mutate()}
            loading={reset.isPending}
            disabled={code.trim().length !== 6 || password.length < 10}
          />
        </>
      )}
    </FormScreen>
  );
}
