import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, Radius, Shadows } from '@/constants/theme';
import { Person } from '@/lib/app-data';

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  const body = <Animated.View entering={FadeIn.duration(300)} style={styles.screenInner}>{children}</Animated.View>;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {scroll ? <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

export function Header({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.header}>
      <View style={styles.headerCopy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      {right}
    </Animated.View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? <Pressable onPress={onAction} hitSlop={8} style={styles.sectionActionWrap}><Text style={styles.sectionAction}>{action}</Text><Ionicons name={action.startsWith('+') ? 'add' : 'chevron-forward'} size={13} color={palette.accentBright} /></Pressable> : null}
    </View>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle | ViewStyle[] }>) {
  return <Animated.View layout={LinearTransition.springify().damping(20)} entering={FadeInDown.duration(380)} style={[styles.card, Shadows.soft, style]}>{children}</Animated.View>;
}

export function Avatar({ person, size = 46, showStatus = true }: { person: Person; size?: number; showStatus?: boolean }) {
  const statusColor = person.status === 'online' ? palette.green : person.status === 'idle' ? palette.amber : palette.textMuted;
  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.avatarRing, { width: size, height: size, borderRadius: size / 2 }]}><View style={[styles.avatar, { width: size - 3, height: size - 3, borderRadius: size / 2, backgroundColor: person.color }]}>
        {person.avatarUrl ? <Image source={{ uri: person.avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} /> : <Text style={[styles.avatarText, { fontSize: size * 0.31 }]}>{person.initials}</Text>}
      </View></View>
      {showStatus ? <View style={[styles.status, { backgroundColor: statusColor }]} /> : null}
    </View>
  );
}

export function QueryState({ loading, error, empty, onRetry }: { loading?: boolean; error?: string | null; empty?: string; onRetry?: () => void }) {
  if (loading) return <View style={styles.queryState}><ActivityIndicator color={palette.accentBright} /><Text style={styles.queryText}>Loading…</Text></View>;
  if (error) return <Pressable onPress={onRetry} style={styles.queryState}><Text style={styles.queryError}>{error}</Text><Text style={styles.queryAction}>Tap to retry</Text></Pressable>;
  if (empty) return <View style={styles.queryState}><Text style={styles.queryText}>{empty}</Text></View>;
  return null;
}

export function ActionSheet({ visible, onClose, title, subtitle, children }: PropsWithChildren<{ visible: boolean; onClose: () => void; title: string; subtitle?: string }>) {
  return <Modal visible={visible} transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
    <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={styles.backdrop}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} /></Animated.View>
      <Animated.View entering={SlideInDown.springify().damping(20)} exiting={SlideOutDown.duration(220)} style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}><View style={styles.sheetHeaderCopy}><Text style={styles.sheetTitle}>{title}</Text>{subtitle ? <Text style={styles.sheetSubtitle}>{subtitle}</Text> : null}</View><IconButton label="×" onPress={onClose} /></View>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>{children}</ScrollView>
      </Animated.View>
    </KeyboardAvoidingView>
  </Modal>;
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...props} placeholderTextColor={palette.textSubtle} style={[styles.fieldInput, props.multiline && styles.fieldMultiline, props.style]} /></View>;
}

const iconMap: Record<string, React.ComponentProps<typeof Ionicons>['name']> = { '⌕': 'search', '+': 'add', '‹': 'chevron-back', '⌄': 'chevron-down', '•••': 'ellipsis-horizontal', '♬': 'headset', '×': 'close', '?': 'help', '✉': 'chatbubble-ellipses', '✎': 'pencil', '◉': 'mic', '↟': 'radio' };

export function IconButton({ label, onPress, active = false }: { label: string; onPress?: () => void; active?: boolean }) {
  const icon = iconMap[label];
  return (
    <Pressable onPress={() => { void Haptics.selectionAsync(); onPress?.(); }} style={({ pressed }) => [styles.iconButton, active && styles.iconButtonActive, pressed && styles.pressed]}>
      {icon ? <Ionicons name={icon} size={19} color={palette.text} /> : <Text style={styles.iconButtonText}>{label}</Text>}
    </Pressable>
  );
}

export function PrimaryButton({ label, onPress, tone = 'accent' }: { label: string; onPress?: () => void; tone?: 'accent' | 'danger' | 'quiet' }) {
  return (
    <Pressable onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress?.(); }} style={({ pressed }) => [styles.primaryButton, tone === 'danger' ? styles.primaryDanger : tone === 'quiet' ? styles.primaryQuiet : styles.primaryAccent, pressed && styles.pressed]}>
      <Text style={[styles.primaryButtonText, tone === 'accent' && styles.primaryButtonTextAccent]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.canvas, overflow: 'hidden' },
  scrollContent: { paddingBottom: 118 },
  screenInner: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 18, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCopy: { gap: 4, flexShrink: 1 },
  eyebrow: { color: palette.accentSoft, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { color: palette.text, fontSize: 32, lineHeight: 42, fontWeight: '800', letterSpacing: -.7 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: palette.text, fontSize: 17, fontWeight: '700' },
  sectionActionWrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionAction: { color: palette.accentBright, fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 0, borderRadius: 18, padding: 16 },
  avatarRing: { alignItems: 'center', justifyContent: 'center' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: palette.white, fontWeight: '900' },
  status: { position: 'absolute', width: 12, height: 12, borderRadius: 6, right: -1, bottom: 1, borderWidth: 2.5, borderColor: palette.canvas },
  iconButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  iconButtonActive: { backgroundColor: palette.accent, borderColor: palette.accentBright },
  iconButtonText: { color: palette.text, fontSize: 17, fontWeight: '800' },
  primaryButton: { minHeight: 48, borderRadius: 18, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  primaryAccent: { backgroundColor: palette.accent },
  primaryQuiet: { backgroundColor: palette.surfaceRaised },
  primaryDanger: { backgroundColor: palette.surfaceRaised },
  primaryButtonText: { color: palette.text, fontWeight: '700', fontSize: 14 },
  primaryButtonTextAccent: { color: palette.canvas },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  queryState: { minHeight: 90, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  queryText: { color: palette.textMuted, fontSize: 13, textAlign: 'center' },
  queryError: { color: palette.red, fontSize: 12, textAlign: 'center' },
  queryAction: { color: palette.accentBright, fontSize: 12, fontWeight: '800' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#000000A8' },
  sheet: { maxHeight: '88%', minHeight: 280, backgroundColor: palette.canvasRaised, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 24, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 20, shadowColor: '#000', shadowOpacity: .45, shadowRadius: 26, shadowOffset: { width: 0, height: -8 }, elevation: 20 },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: palette.borderBright, alignSelf: 'center', marginBottom: 18 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sheetHeaderCopy: { flex: 1, gap: 4 },
  sheetTitle: { color: palette.text, fontSize: 23, fontWeight: '800', letterSpacing: -.6 },
  sheetSubtitle: { color: palette.textMuted, fontSize: 12, lineHeight: 17 },
  sheetContent: { gap: 18, paddingTop: 22, paddingBottom: 20 },
  field: { gap: 8, width: '100%', flexShrink: 0 },
  fieldLabel: { color: palette.text, fontSize: 12, fontWeight: '700' },
  fieldInput: { width: '100%', minHeight: 54, borderRadius: Radius.md, borderWidth: 1, borderColor: palette.borderBright, backgroundColor: palette.surface, color: palette.text, paddingHorizontal: 15, paddingVertical: 12, fontSize: 15, lineHeight: 21 },
  fieldMultiline: { height: 110, minHeight: 110, paddingTop: 14, textAlignVertical: 'top' },
});
