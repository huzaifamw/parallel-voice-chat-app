import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette } from '@/constants/theme';
import { useAuth } from '@/providers/auth-provider';

export default function AuthCallbackScreen() {
  const { session } = useAuth();
  if (session) return <Redirect href="/(tabs)" />;
  return <SafeAreaView style={styles.safe}><View style={styles.content}><ActivityIndicator color={palette.accentBright} size="large" /><Text style={styles.title}>Verifying your email…</Text><Text style={styles.body}>Keep this screen open for a moment.</Text></View></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.canvas },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  title: { color: palette.text, fontSize: 20, fontWeight: '900', marginTop: 8 },
  body: { color: palette.textMuted, fontSize: 13 },
});
