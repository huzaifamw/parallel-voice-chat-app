import { router } from 'expo-router';
import { useState } from 'react';
import * as Linking from 'expo-linking';
import { Pressable, Text, View } from 'react-native';

import { AuthButton, AuthField, AuthHeading, AuthShell, authStyles } from '@/components/auth/auth-ui';
import { supabase } from '@/lib/supabase';

export default function RegisterScreen() {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const register = async () => {
    if (!supabase) return;
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (cleanUsername.length < 3) { setError('Username must contain at least three letters, numbers, or underscores.'); return; }
    if (password.length < 8) { setError('Password must be at least eight characters.'); return; }
    setSubmitting(true); setError(null); setMessage(null);
    const emailRedirectTo = Linking.createURL('/auth/callback');
    const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo, data: { display_name: displayName.trim(), username: cleanUsername } } });
    if (authError) setError(authError.message);
    else if (!data.session) {
      setMessage('Check your email to confirm your account.');
      router.replace({ pathname: '/(auth)/verify-email', params: { email: email.trim() } });
    }
    setSubmitting(false);
  };

  return (
    <AuthShell footer={<Pressable onPress={() => router.push('/(auth)/sign-in')}><Text style={authStyles.footerText}>Already registered? <Text style={authStyles.link}>Sign in</Text></Text></Pressable>}>
      <AuthHeading eyebrow="Join your circle" title="Create account" body="Use a simple profile now. You can add interests and favorite games later." />
      <View style={authStyles.form}>
        <AuthField label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="What friends call you" autoComplete="name" />
        <AuthField label="Username" value={username} onChangeText={setUsername} placeholder="unique_username" autoCapitalize="none" />
        <AuthField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        <AuthField label="Password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry autoComplete="new-password" />
        {error ? <Text style={authStyles.error}>{error}</Text> : null}
        {message ? <Text style={authStyles.helper}>{message}</Text> : null}
        <AuthButton label={submitting ? 'Creating account…' : 'Create account'} disabled={submitting || !displayName.trim() || !username.trim() || !email.trim() || !password} onPress={register} />
      </View>
    </AuthShell>
  );
}
