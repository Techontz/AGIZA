import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { ApiError } from '@/lib/api/client';
import { accountApi } from '@/lib/api/endpoints';
import { cleanPhone } from '@/lib/format';
import { colors, space, themed } from '@/theme/tokens';

const RESEND_SECONDS = 60;

/** Step 1 of registration / password reset: send an SMS code to the phone. */
export function PhoneStep({
  purpose,
  onSent,
}: {
  purpose: 'register' | 'reset_password';
  onSent: (phone: string, smsConfigured: boolean) => void;
}) {
  const [phone, setPhone] = useState('');
  const send = useMutation({
    mutationFn: () => accountApi.requestCode(cleanPhone(phone), purpose),
    onSuccess: (res) => onSent(cleanPhone(phone), res.sms_configured),
  });
  const fieldError = send.error instanceof ApiError ? send.error.field('phone') : undefined;
  return (
    <>
      {send.isError && !fieldError ? <Notice tone="danger">{errorMessage(send.error)}</Notice> : null}
      <Input
        label="Phone number"
        value={phone}
        onChangeText={setPhone}
        placeholder="0712 345 678"
        keyboardType="phone-pad"
        autoComplete="tel"
        error={fieldError}
        hint="We'll send a 6-digit code by SMS."
      />
      <Button title="Send code" onPress={() => send.mutate()} loading={send.isPending} disabled={phone.trim().length < 9} />
    </>
  );
}

/** "Resend code" with a countdown matching the server's resend limit. */
export function ResendCode({ phone, purpose }: { phone: string; purpose: 'register' | 'reset_password' }) {
  const [left, setLeft] = useState(RESEND_SECONDS);
  const resend = useMutation({
    mutationFn: () => accountApi.requestCode(phone, purpose),
    onSuccess: () => setLeft(RESEND_SECONDS),
  });
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return (
    <View style={styles.resend}>
      {resend.isError ? (
        <Text variant="small" color={colors.danger}>
          {errorMessage(resend.error)}
        </Text>
      ) : null}
      <Pressable accessibilityRole="button" disabled={left > 0 || resend.isPending} onPress={() => resend.mutate()}>
        <Text variant="smallMedium" color={left > 0 ? colors.textSubtle : colors.primary}>
          {left > 0 ? `Resend code in ${left}s` : 'Resend code'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = themed(() => ({ resend: { alignItems: 'center', gap: space.xs } }));
