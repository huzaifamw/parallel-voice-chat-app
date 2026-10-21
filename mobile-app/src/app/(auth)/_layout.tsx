import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/providers/auth-provider';

export default function AuthLayout() {
  const { configured, session } = useAuth();

  if (configured && session) {
    return <Redirect href="/(tabs)" />;
  }

  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
