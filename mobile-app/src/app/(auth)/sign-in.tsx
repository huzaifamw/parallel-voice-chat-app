import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AuthButton, AuthField, AuthHeading, AuthShell, authStyles } from '@/components/auth/auth-ui';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const signIn = async () => {
    if (!supabase || !email.trim() || !password) return;
    setSubmitting(true); setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) setError(authError.message);
    setSubmitting(false);
  };

  return (
    <AuthShell footer={<Pressable onPress={() => router.push('/(auth)/register')}><Text style={authStyles.footerText}>New here? <Text style={authStyles.link}>Create an account</Text></Text></Pressable>}>
      <AuthHeading eyebrow="Welcome back" title="Sign in" body="Return to your groups, messages, and voice rooms." />
      <View style={authStyles.form}>
        <AuthField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        <AuthField label="Password" value={password} onChangeText={setPassword} placeholder="Your password" secureTextEntry autoComplete="current-password" />
        {error ? <Text style={authStyles.error}>{error}</Text> : null}
        <View style={authStyles.actions}><AuthButton label={submitting ? 'Signing in…' : 'Sign in'} disabled={submitting || !email.trim() || !password} onPress={signIn} /><AuthButton label="Back" quiet onPress={() => router.back()} /></View>
      </View>
    </AuthShell>
  );
}
