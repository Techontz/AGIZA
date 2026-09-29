import { router } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { space } from '@/theme/tokens';

export function SignInPrompt({ icon, title, message }: { icon: LucideIcon; title: string; message: string }) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      message={message}
      action={
        <View style={styles.actions}>
          <Button title="Sign in" onPress={() => router.push('/login')} />
          <Button title="Create an account" variant="secondary" onPress={() => router.push('/register')} />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({ actions: { alignSelf: 'stretch', gap: space.sm, marginTop: space.sm } });
