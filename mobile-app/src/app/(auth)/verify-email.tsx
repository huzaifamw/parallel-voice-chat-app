import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AuthButton, AuthHeading, AuthShell, authStyles } from '@/components/auth/auth-ui';
import { supabase } from '@/lib/supabase';

export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resend = async () => {
    if (!supabase || !email) return;
    setSending(true); setError(null); setMessage(null);
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: Linking.createURL('/auth/callback') },
    });
    if (resendError) setError(resendError.message);
    else setMessage('A fresh verification email has been sent.');
    setSending(false);
  };

  return (
    <AuthShell>
      <AuthHeading eyebrow="One last step" title="Verify your email" body={`We sent a confirmation link to ${email ?? 'your inbox'}. Open it on this device to verify your account.`} />
      <View style={authStyles.form}>
        <Text style={authStyles.helper}>After verification, the app will sign you in automatically when the link opens here. You can also return and sign in normally.</Text>
        {error ? <Text style={authStyles.error}>{error}</Text> : null}
        {message ? <Text style={authStyles.helper}>{message}</Text> : null}
        <View style={authStyles.actions}>
          <AuthButton label={sending ? 'Sending…' : 'Resend verification email'} disabled={sending || !email} onPress={resend} />
          <AuthButton label="I verified — go to sign in" quiet onPress={() => router.replace('/(auth)/sign-in')} />
          <AuthButton label="Use a different email" quiet onPress={() => router.replace('/(auth)/register')} />
        </View>
      </View>
    </AuthShell>
  );
}
