import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { FormScreen } from '@/components/form-screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage, Notice } from '@/components/ui/states';
import { ApiError } from '@/lib/api/client';
import { accountApi } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/session';

export default function ProfileScreen() {
  const { customer, setCustomer } = useAuth();
  const [fullName, setFullName] = useState(customer?.full_name ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [company, setCompany] = useState(customer?.company_name ?? '');
  const save = useMutation({
    mutationFn: () => accountApi.updateMe({ full_name: fullName.trim(), email: email.trim(), company_name: company.trim() }),
    onSuccess: setCustomer,
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <FormScreen>
      {save.isSuccess ? <Notice tone="success">Profile saved.</Notice> : null}
      {save.isError && !err?.details ? <Notice tone="danger">{errorMessage(save.error)}</Notice> : null}
      <Input label="Full name" value={fullName} onChangeText={setFullName} error={err?.field('full_name')} />
      <Input label="Phone number" value={customer?.phone ?? ''} editable={false} hint="Your phone number is your sign-in and can't be changed here." />
      <Input label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={err?.field('email')} />
      <Input label="Company (optional)" value={company} onChangeText={setCompany} error={err?.field('company_name')} />
      <Button title="Save" onPress={() => save.mutate()} loading={save.isPending} disabled={!fullName.trim()} />
    </FormScreen>
  );
}
