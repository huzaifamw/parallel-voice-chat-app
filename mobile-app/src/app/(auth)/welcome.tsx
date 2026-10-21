import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AuthButton, AuthHeading, AuthShell } from '@/components/auth/auth-ui';
import { palette } from '@/constants/theme';
import { useAuth } from '@/providers/auth-provider';

export default function WelcomeScreen() {
  const { configured } = useAuth();
  return (
    <AuthShell footer={<Text style={styles.footer}>Private by default · Built for your circle</Text>}>
      <AuthHeading eyebrow="Voice, chat, play" title="Your people, one place." body="Create private groups, drop into permanent voice rooms, and stay close wherever the day takes you." />
      <View style={styles.features}>
        {['Permanent voice rooms', 'Fast group messaging', 'Bottle Spin with friends'].map((feature, index) => <View key={feature} style={styles.feature}><View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View><Text style={styles.featureText}>{feature}</Text></View>)}
      </View>
      <View style={styles.actions}>
        {configured ? <><AuthButton label="Create an account" onPress={() => router.push('/(auth)/register')} /><AuthButton label="I already have an account" quiet onPress={() => router.push('/(auth)/sign-in')} /></> : <View style={styles.setupNotice}><Text style={styles.setupTitle}>Supabase setup needed</Text><Text style={styles.setupBody}>Add the project URL and publishable key to enable accounts and app data.</Text></View>}
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  features: { gap: 14 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  number: { width: 34, height: 34, borderRadius: 12, backgroundColor: palette.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: palette.accentBright, fontWeight: '900', fontSize: 12 },
  featureText: { color: palette.text, fontSize: 14, fontWeight: '700' },
  actions: { gap: 10 },
  setupNotice: { backgroundColor: '#FFF7E9', borderColor: '#E9D1A7', borderWidth: 1, borderRadius: 14, padding: 13 },
  setupTitle: { color: palette.amber, fontSize: 12, fontWeight: '900' },
  setupBody: { color: '#7D6A4C', fontSize: 11, lineHeight: 17, marginTop: 4 },
  footer: { color: palette.textMuted, textAlign: 'center', fontSize: 11 },
});
