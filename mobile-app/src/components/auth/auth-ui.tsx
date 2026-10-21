import { PropsWithChildren, ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, Radius } from '@/constants/theme';

export function AuthShell({ children, footer }: PropsWithChildren<{ footer?: ReactNode }>) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.glowOne} /><View style={styles.glowTwo} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Animated.View entering={ZoomIn.springify().damping(16)} style={styles.logo}><Image source={require('@/assets/images/parallel-mark.png')} style={styles.logoImage} resizeMode="contain" tintColor={palette.accent} /></Animated.View>
          <Animated.View entering={FadeInUp.duration(450).delay(100)} style={styles.content}>{children}</Animated.View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AuthHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return <Animated.View entering={FadeInDown.duration(420)} style={styles.heading}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.title}>{title}</Text><Text style={styles.body}>{body}</Text></Animated.View>;
}

export function AuthField(props: TextInputProps & { label: string }) {
  const lowered = props.label.toLowerCase();
  const icon: React.ComponentProps<typeof Ionicons>['name'] = lowered.includes('email') ? 'mail-outline' : lowered.includes('password') ? 'lock-closed-outline' : lowered.includes('username') ? 'at-outline' : 'person-outline';
  return <View style={styles.field}><Text style={styles.label}>{props.label}</Text><View style={styles.inputShell}><Ionicons name={icon} size={18} color={palette.textMuted} /><TextInput {...props} placeholderTextColor={palette.textSubtle} style={[styles.input, props.style]} /></View></View>;
}

export function AuthButton({ label, onPress, disabled = false, quiet = false }: { label: string; onPress: () => void; disabled?: boolean; quiet?: boolean }) {
  return <Pressable disabled={disabled} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }} style={({ pressed }) => [styles.button, quiet && styles.buttonQuiet, disabled && styles.buttonDisabled, pressed && styles.pressed]}>{quiet ? <><Text style={[styles.buttonText, styles.buttonQuietText]}>{label}</Text><Ionicons name="arrow-forward" size={16} color={palette.text} /></> : <LinearGradient colors={[palette.accentBright, palette.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.buttonGradient}><Text style={styles.buttonText}>{label}</Text><Ionicons name="arrow-forward" size={16} color={palette.white} /></LinearGradient>}</Pressable>;
}

export const authStyles = StyleSheet.create({
  form: { gap: 16 },
  actions: { gap: 10, marginTop: 8 },
  inline: { flexDirection: 'row', gap: 10 },
  helper: { color: palette.textMuted, fontSize: 11, lineHeight: 17 },
  error: { color: palette.red, fontSize: 12, lineHeight: 18, backgroundColor: '#2A141A', borderColor: '#5A2935', borderWidth: 1, borderRadius: Radius.sm, padding: 11 },
  link: { color: palette.accentBright, fontWeight: '800' },
  footerText: { color: palette.textMuted, fontSize: 12, textAlign: 'center' },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.canvas, overflow: 'hidden' },
  flex: { flex: 1 },
  glowOne: { position: 'absolute', width: 400, height: 400, borderRadius: 200, backgroundColor: '#B8F7650A', top: -210, right: -160 },
  glowTwo: { position: 'absolute', width: 320, height: 320, borderRadius: 160, backgroundColor: '#62DDC00A', bottom: -170, left: -140 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 24 },
  logo: { width: 60, height: 60, marginTop: 10, shadowColor: palette.accent, shadowOpacity: .18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  logoImage: { width: 60, height: 60 },
  content: { flex: 1, justifyContent: 'center', gap: 28, paddingVertical: 34 },
  footer: { paddingVertical: 10 },
  heading: { gap: 9 },
  eyebrow: { color: palette.cyan, fontSize: 11, letterSpacing: 1.3, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: palette.text, fontSize: 34, lineHeight: 40, fontWeight: '900', letterSpacing: -1 },
  body: { color: palette.textMuted, fontSize: 14, lineHeight: 21, maxWidth: 330 },
  field: { gap: 8 },
  label: { color: palette.text, fontSize: 12, fontWeight: '800' },
  inputShell: { minHeight: 54, borderRadius: Radius.md, borderWidth: 1, borderColor: palette.borderBright, backgroundColor: palette.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 11 },
  input: { flex: 1, minHeight: 52, color: palette.text, fontSize: 15, paddingVertical: 0 },
  button: { minHeight: 54, borderRadius: Radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  buttonGradient: { minHeight: 54, width: '100%', paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  buttonQuiet: { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: palette.canvas, fontSize: 14, fontWeight: '900' },
  buttonQuietText: { color: palette.text },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
