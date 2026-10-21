import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { palette } from '@/constants/theme';
import { AuthProvider } from '@/providers/auth-provider';

const appTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: palette.accent,
    background: palette.canvas,
    card: palette.surface,
    border: palette.border,
    text: palette.text,
  },
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider value={appTheme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: palette.canvas },
            animation: 'slide_from_right',
            animationDuration: 280,
          }}>
          <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="auth/callback" options={{ animation: 'fade' }} />
          <Stack.Screen name="group/[groupId]" />
          <Stack.Screen name="channel/[channelId]" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="events" />
          <Stack.Screen name="join/[code]" options={{ animation: 'fade' }} />
          <Stack.Screen name="user/[userId]" />
          <Stack.Screen name="voice/[roomId]" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="activity/bottle-spin" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </Stack>
      </ThemeProvider>
    </AuthProvider>
  );
}
