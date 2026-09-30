import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { FormScreen } from '@/components/form-screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { ApiError } from '@/lib/api/client';
import { accountApi } from '@/lib/api/endpoints';
import { tokenStore } from '@/lib/auth/token-store';
import { colors } from '@/theme/tokens';

export default function ChangePasswordScreen() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const change = useMutation({
    mutationFn: () => accountApi.changePassword(current, next),
    // Other devices are signed out; this one continues with the new tokens.
    onSuccess: (tokens) => tokenStore.save(tokens.access, tokens.refresh),
  });
  const err = change.error instanceof ApiError ? change.error : null;
  if (change.isSuccess) return <FormScreen><Notice tone="success">Password changed. Other devices were signed out.</Notice></FormScreen>;
  return (
    <FormScreen>
      <Text variant="body" color={colors.textMuted}>
        Changing your password signs you out on your other devices.
      </Text>
      {change.isError && !err?.details ? <Notice tone="danger">{errorMessage(change.error)}</Notice> : null}
      <Input label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" error={err?.field('current_password')} />
      <Input label="New password" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" error={err?.field('password')} hint="At least 10 characters." />
      <Button title="Change password" onPress={() => change.mutate()} loading={change.isPending} disabled={!current || next.length < 10} />
    </FormScreen>
  );
}
