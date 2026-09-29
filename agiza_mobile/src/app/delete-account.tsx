import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-native';

import { FormScreen } from '@/components/form-screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage, Notice } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { ApiError } from '@/lib/api/client';
import { accountApi } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/session';
import { colors } from '@/theme/tokens';

export default function DeleteAccountScreen() {
  const { signOut } = useAuth();
  const [password, setPassword] = useState('');
  const remove = useMutation({
    mutationFn: () => accountApi.deleteAccount(password),
    onSuccess: signOut,
  });
  const err = remove.error instanceof ApiError ? remove.error : null;
  return (
    <FormScreen>
      <Text variant="body" color={colors.text}>
        Deleting your account removes your sign-in, saved devices and cart. Records of orders and payments are kept by AGIZA
        as required for accounting and delivery.
      </Text>
      {remove.isError && !err?.field('password') ? <Notice tone="danger">{errorMessage(remove.error)}</Notice> : null}
      <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry error={err?.field('password')} />
      <Button
        title="Delete my account"
        variant="danger"
        loading={remove.isPending}
        disabled={!password}
        onPress={() =>
          Alert.alert('Delete your account?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() },
          ])
        }
      />
    </FormScreen>
  );
}
