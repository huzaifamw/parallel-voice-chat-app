import { Session } from '@supabase/supabase-js';
import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Linking } from 'react-native';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const client = supabase;
    const userId = session?.user.id;
    if (!client || !userId) return;
    const updatePresence = async (active: boolean) => {
      const { data } = await client.from('profiles').select('status').eq('id', userId).maybeSingle();
      const status = data?.status === 'invisible' ? 'invisible' : active ? 'online' : 'offline';
      await client.from('profiles').update({ status, last_seen_at: new Date().toISOString() }).eq('id', userId);
    };
    void updatePresence(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => void updatePresence(state === 'active'));
    return () => subscription.remove();
  }, [session?.user.id]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const handleAuthUrl = async (url: string | null) => {
      if (!url) return;
      const code = new URL(url).searchParams.get('code');
      if (!code) return;
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) console.warn('Could not exchange Supabase auth code:', error.message);
    };

    Linking.getInitialURL().then(handleAuthUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => handleAuthUrl(url));
    return () => subscription.remove();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      signOut: async () => {
        if (!supabase) return;
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
