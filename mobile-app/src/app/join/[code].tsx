import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/ui/app-ui';
import { palette } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export default function JoinGroupLinkScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { loading: authLoading, session } = useAuth();
  const [joining, setJoining] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !session || !supabase || !code) return;
    let current = true;
    supabase.rpc('redeem_group_invite', { invite_code: code }).then(({ data, error: joinError }) => {
      if (!current) return;
      setJoining(false);
      if (joinError) setError(joinError.message);
      else if (data) router.replace(`/group/${data}`);
    });
    return () => { current = false; };
  }, [authLoading, code, session]);

  if (!authLoading && !session) return <Redirect href="/(auth)/welcome" />;
  return <SafeAreaView style={styles.safe}><View style={styles.content}><View style={styles.icon}><Ionicons name={error ? 'alert-circle-outline' : 'people'} size={34} color={error ? palette.red : palette.accent} /></View><Text style={styles.title}>{error ? 'Could not join group' : 'Joining your group'}</Text><Text style={styles.body}>{error ?? 'Checking the invitation and setting up your membership…'}</Text>{joining && !error ? <ActivityIndicator color={palette.accent} /> : null}{error ? <PrimaryButton label="Enter code manually" tone="quiet" onPress={() => router.replace('/groups')} /> : null}</View></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: palette.canvas }, content: { flex: 1, maxWidth: 440, width: '100%', alignSelf: 'center', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 }, icon: { width: 72, height: 72, borderRadius: 26, backgroundColor: palette.surfaceRaised, alignItems: 'center', justifyContent: 'center' }, title: { color: palette.text, fontSize: 23, fontWeight: '900', textAlign: 'center' }, body: { color: palette.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginBottom: 8 } });
