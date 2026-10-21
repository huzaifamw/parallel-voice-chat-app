import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet, Avatar, Field, IconButton, PrimaryButton, QueryState } from '@/components/ui/app-ui';
import { palette, Radius } from '@/constants/theme';
import { clockTime, findOrCreateDirectConversation, Profile, toPerson } from '@/lib/app-data';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type PollOption = { id: string; label: string; votes: string[] };
type MessagePoll = { id: string; question: string; allows_multiple: boolean; options: PollOption[] };
type ChatMessage = { id: string; body: string; created_at: string; author_id: string | null; profile: Profile | null; reactions: string[]; poll: MessagePoll | null };

export default function ChannelScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const { session } = useAuth();
  const isDm = channelId?.startsWith('dm-') ?? false;
  const friendId = isDm ? channelId.slice(3) : null;
  const [draft, setDraft] = useState('');
  const [title, setTitle] = useState('Conversation');
  const [subtitle, setSubtitle] = useState('');
  const [voiceChannelId, setVoiceChannelId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptionOne, setPollOptionOne] = useState('');
  const [pollOptionTwo, setPollOptionTwo] = useState('');
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !session || !channelId) return;
    setLoading(true); setError(null);
    try {
      if (isDm && friendId) {
        const [{ data: profile, error: profileError }, foundConversation] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', friendId).single(),
          findOrCreateDirectConversation(session.user.id, friendId, false),
        ]);
        if (profileError) throw profileError;
        setTitle(profile.display_name);
        setSubtitle(`${profile.status === 'online' ? 'Online' : 'Offline'} · @${profile.username}`);
        setConversationId(foundConversation);
        if (!foundConversation) { setMessages([]); return; }
        const { data, error: messageError } = await supabase.from('direct_messages').select('id, body, created_at, author_id, author:profiles!direct_messages_author_id_fkey(*)').eq('conversation_id', foundConversation).order('created_at').limit(100);
        if (messageError) throw messageError;
        const messageIds = (data ?? []).map((message) => message.id);
        let directReactions: { message_id: string; emoji: string }[] = [];
        if (messageIds.length) {
          const reactionResult = await supabase.from('direct_message_reactions').select('message_id, emoji').in('message_id', messageIds);
          if (reactionResult.error) console.warn('Could not attach DM reactions:', reactionResult.error.message);
          else directReactions = reactionResult.data ?? [];
        }
        setMessages((data ?? []).map((message: any) => {
          const counts = new Map<string, number>();
          for (const reaction of directReactions.filter((item) => item.message_id === message.id)) counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
          return { ...message, profile: Array.isArray(message.author) ? message.author[0] : message.author, reactions: [...counts].map(([emoji, count]) => `${emoji} ${count}`), poll: null };
        }));
      } else {
        const { data: channel, error: channelError } = await supabase.from('channels').select('id, name, group_id, groups(name)').eq('id', channelId).single();
        if (channelError) throw channelError;
        const group = Array.isArray(channel.groups) ? channel.groups[0] : channel.groups;
        setTitle(`# ${channel.name}`);
        setSubtitle(group?.name ?? 'Group channel');
        const [{ data, error: messageError }, { data: voiceChannels }] = await Promise.all([
          supabase.from('messages').select('id, body, created_at, author_id, author:profiles!messages_author_id_fkey(*), message_reactions(emoji), polls(id, question, allows_multiple, poll_options(id, label, poll_votes(user_id)))').eq('channel_id', channelId).order('created_at').limit(100),
          supabase.from('channels').select('id').eq('group_id', channel.group_id).eq('kind', 'voice').order('position').limit(1),
        ]);
        if (messageError) throw messageError;
        setVoiceChannelId(voiceChannels?.[0]?.id ?? null);
        setMessages((data ?? []).map((message: any) => {
          const counts = new Map<string, number>();
          for (const reaction of message.message_reactions ?? []) counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
          const rawPoll = Array.isArray(message.polls) ? message.polls[0] : message.polls;
          const poll = rawPoll ? { id: rawPoll.id, question: rawPoll.question, allows_multiple: rawPoll.allows_multiple, options: (rawPoll.poll_options ?? []).map((option: any) => ({ id: option.id, label: option.label, votes: (option.poll_votes ?? []).map((vote: any) => vote.user_id) })) } : null;
          return { ...message, profile: Array.isArray(message.author) ? message.author[0] : message.author, reactions: [...counts].map(([emoji, count]) => `${emoji} ${count}`), poll };
        }));
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : typeof reason === 'object' && reason && 'message' in reason ? String(reason.message) : 'Could not load this conversation.';
      console.error('Conversation load failed:', reason);
      setError(message);
    }
    finally { setLoading(false); }
  }, [channelId, friendId, isDm, session]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!supabase || !channelId) return;
    const table = isDm ? 'direct_messages' : 'messages';
    const filter = isDm ? (conversationId ? `conversation_id=eq.${conversationId}` : undefined) : `channel_id=eq.${channelId}`;
    if (isDm && !filter) return;
    const reactionTable = isDm ? 'direct_message_reactions' : 'message_reactions';
    const subscription = supabase.channel(`chat:${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: reactionTable }, () => void load())
      .subscribe();
    return () => { void supabase?.removeChannel(subscription); };
  }, [channelId, conversationId, isDm, load]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !supabase || !session || !channelId || sending) return;
    setSending(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (isDm && friendId) {
        const id = conversationId ?? await findOrCreateDirectConversation(session.user.id, friendId, true);
        setConversationId(id);
        const { error: sendError } = await supabase.from('direct_messages').insert({ conversation_id: id, author_id: session.user.id, body });
        if (sendError) throw sendError;
      } else {
        const { error: sendError } = await supabase.from('messages').insert({ channel_id: channelId, author_id: session.user.id, body });
        if (sendError) throw sendError;
      }
      setDraft(''); await load();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : typeof reason === 'object' && reason && 'message' in reason ? String(reason.message) : 'Please try again.';
      Alert.alert('Could not send message', message.includes('email') ? 'Please verify your email, then sign in again.' : message);
    }
    finally { setSending(false); }
  };

  const createPoll = async () => {
    if (!supabase || !session || !channelId || isDm || !pollQuestion.trim() || !pollOptionOne.trim() || !pollOptionTwo.trim() || creatingPoll) return;
    setCreatingPoll(true);
    try {
      const { data: message, error: messageError } = await supabase.from('messages').insert({ channel_id: channelId, author_id: session.user.id, body: `Poll · ${pollQuestion.trim()}`, type: 'system' }).select('id').single();
      if (messageError) throw messageError;
      const { data: poll, error: pollError } = await supabase.from('polls').insert({ message_id: message.id, question: pollQuestion.trim(), allows_multiple: false }).select('id').single();
      if (pollError) throw pollError;
      const { error: optionsError } = await supabase.from('poll_options').insert([{ poll_id: poll.id, label: pollOptionOne.trim(), position: 0 }, { poll_id: poll.id, label: pollOptionTwo.trim(), position: 1 }]);
      if (optionsError) throw optionsError;
      setPollQuestion(''); setPollOptionOne(''); setPollOptionTwo(''); setPollOpen(false); await load();
    } catch (reason) { Alert.alert('Could not create poll', reason instanceof Error ? reason.message : 'Please try again.'); }
    finally { setCreatingPoll(false); }
  };

  const vote = async (poll: MessagePoll, option: PollOption) => {
    if (!supabase || !session) return;
    void Haptics.selectionAsync();
    const { error: removeError } = await supabase.from('poll_votes').delete().eq('poll_id', poll.id).eq('user_id', session.user.id);
    if (removeError) return Alert.alert('Could not vote', removeError.message);
    const { error: voteError } = await supabase.from('poll_votes').insert({ poll_id: poll.id, option_id: option.id, user_id: session.user.id });
    if (voteError) Alert.alert('Could not vote', voteError.message); else await load();
  };

  const react = async (emoji: string) => {
    if (!supabase || !session || !selectedMessage) return;
    const reactionTable = isDm ? 'direct_message_reactions' : 'message_reactions';
    const { error: reactionError } = await supabase.from(reactionTable).upsert({ message_id: selectedMessage.id, user_id: session.user.id, emoji }, { onConflict: 'message_id,user_id,emoji' });
    if (reactionError) Alert.alert('Could not react', reactionError.message); else { setSelectedMessage(null); await load(); }
  };

  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.header}><IconButton label="‹" onPress={() => router.back()} /><Pressable disabled={!isDm || !friendId} onPress={() => friendId && router.push({ pathname: '/user/[userId]', params: { userId: friendId } })} style={styles.headerCopy}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}{isDm ? ' · View profile' : ''}</Text></Pressable>{voiceChannelId ? <IconButton label="♬" onPress={() => router.push(`/voice/${voiceChannelId}`)} /> : null}</View>
    <View style={styles.divider} />
    {loading || error ? <QueryState loading={loading} error={error} onRetry={load} /> : <ScrollView contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled">
      {!messages.length ? <View style={styles.welcome}><Text style={styles.welcomeIcon}>{isDm ? '✦' : '#'}</Text><Text style={styles.welcomeTitle}>{isDm ? `You and ${title}` : `Welcome to ${title}`}</Text><Text style={styles.welcomeText}>This is the beginning of the conversation.</Text></View> : null}
      {messages.map((message) => { const person = message.profile ? toPerson(message.profile) : { id: 'removed', name: 'Former member', handle: '', initials: '?', color: palette.surfaceSoft, status: 'offline' as const }; const own = message.author_id === session?.user.id; const totalVotes = message.poll?.options.reduce((total, option) => total + option.votes.length, 0) ?? 0; return <Pressable onLongPress={() => setSelectedMessage(message)} key={message.id} style={[styles.messageRow, own && styles.messageRowOwn]}>{!own ? <Avatar person={person} size={38} /> : null}<View style={[styles.messageBody, own && styles.messageBodyOwn]}><View style={[styles.messageMeta, own && styles.messageMetaOwn]}><Text style={styles.sender}>{own ? 'You' : person.name}</Text><Text style={styles.time}>{clockTime(message.created_at)}</Text></View>{message.poll ? <View style={styles.poll}><View style={styles.pollHeading}><Ionicons name="stats-chart" size={15} color={palette.accent} /><Text style={styles.pollLabel}>POLL</Text></View><Text style={styles.pollQuestion}>{message.poll.question}</Text><View style={styles.pollOptions}>{message.poll.options.map((option) => { const selected = option.votes.includes(session?.user.id ?? ''); const percent = totalVotes ? Math.round(option.votes.length / totalVotes * 100) : 0; return <Pressable key={option.id} onPress={() => void vote(message.poll!, option)} style={[styles.pollOption, selected && styles.pollOptionSelected]}><View style={[styles.pollProgress, { width: `${percent}%` }]} /><Text style={[styles.pollOptionText, selected && styles.pollOptionTextSelected]}>{option.label}</Text><Text style={styles.pollPercent}>{percent}%</Text></Pressable>; })}</View><Text style={styles.pollVotes}>{totalVotes} {totalVotes === 1 ? 'vote' : 'votes'} · Tap to vote</Text></View> : <View style={[styles.bubble, own && styles.bubbleOwn]}><Text style={[styles.messageText, own && styles.messageTextOwn]}>{message.body}</Text></View>}<View style={[styles.messageTools, own && styles.messageToolsOwn]}>{message.reactions.map((reaction) => <View key={reaction} style={styles.reaction}><Text style={styles.reactionText}>{reaction}</Text></View>)}<Pressable onPress={() => setSelectedMessage(message)} hitSlop={8} style={styles.reactionAdd}><Ionicons name="happy-outline" size={14} color={palette.textMuted} /><Ionicons name="add" size={9} color={palette.textMuted} /></Pressable></View></View></Pressable>; })}
    </ScrollView>}
    <View style={styles.composer}>{!isDm ? <Pressable onPress={() => setToolsOpen(true)} style={styles.add}><Ionicons name="add" size={20} color={palette.text} /></Pressable> : null}<TextInput value={draft} onChangeText={setDraft} placeholder={`Message ${title}`} placeholderTextColor={palette.textSubtle} style={styles.input} multiline /><Pressable disabled={!draft.trim() || sending} onPress={send} style={[styles.mic, (!draft.trim() || sending) && styles.disabled]}><Ionicons name={draft ? 'arrow-up' : 'mic'} size={18} color={palette.canvas} /></Pressable></View>
    <ActionSheet visible={toolsOpen} onClose={() => setToolsOpen(false)} title="Create together" subtitle="Start something interactive in this channel."><Pressable onPress={() => { setToolsOpen(false); setPollOpen(true); }} style={styles.toolRow}><View style={styles.toolIcon}><Ionicons name="stats-chart" size={20} color={palette.accent} /></View><View style={styles.toolCopy}><Text style={styles.toolTitle}>Create a poll</Text><Text style={styles.toolText}>Make a quick decision with everyone</Text></View><Ionicons name="chevron-forward" size={17} color={palette.textSubtle} /></Pressable><View style={styles.comingRow}><Ionicons name="images-outline" size={18} color={palette.textMuted} /><Text style={styles.comingText}>Media, documents and voice notes are next</Text></View></ActionSheet>
    <ActionSheet visible={pollOpen} onClose={() => setPollOpen(false)} title="New poll" subtitle="Ask one clear question with two choices."><Field label="Question" value={pollQuestion} onChangeText={setPollQuestion} placeholder="What should we play tonight?" maxLength={180} /><Field label="Option 1" value={pollOptionOne} onChangeText={setPollOptionOne} placeholder="Valorant" maxLength={120} /><Field label="Option 2" value={pollOptionTwo} onChangeText={setPollOptionTwo} placeholder="Minecraft" maxLength={120} /><PrimaryButton label={creatingPoll ? 'Publishing…' : 'Publish poll'} onPress={() => void createPoll()} /></ActionSheet>
    <ActionSheet visible={Boolean(selectedMessage)} onClose={() => setSelectedMessage(null)} title="React to message" subtitle="Reactions make conversations faster and more expressive."><View style={styles.emojiRow}>{['🔥', '😂', '❤️', '👏', '🎮'].map((emoji) => <Pressable key={emoji} onPress={() => void react(emoji)} style={styles.emoji}><Text style={styles.emojiText}>{emoji}</Text></Pressable>)}</View></ActionSheet>
  </KeyboardAvoidingView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.canvas }, keyboard: { flex: 1 }, header: { height: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 }, headerCopy: { flex: 1 }, title: { color: palette.text, fontSize: 16, fontWeight: '800' }, subtitle: { color: palette.textMuted, fontSize: 10, marginTop: 3 }, divider: { height: 1, backgroundColor: palette.border },
  messages: { flexGrow: 1, padding: 18, justifyContent: 'flex-end', gap: 18 }, welcome: { alignItems: 'center', marginVertical: 30 }, welcomeIcon: { color: palette.accentBright, fontSize: 32, fontWeight: '900' }, welcomeTitle: { color: palette.text, fontSize: 18, fontWeight: '900', marginTop: 8 }, welcomeText: { color: palette.textMuted, fontSize: 11, textAlign: 'center', marginTop: 5 }, messageRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' }, messageRowOwn: { justifyContent: 'flex-end' }, messageBody: { flex: 1, maxWidth: '82%' }, messageBodyOwn: { alignItems: 'flex-end' }, messageMeta: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 5 }, messageMetaOwn: { flexDirection: 'row-reverse' }, sender: { color: palette.text, fontSize: 12, fontWeight: '800' }, time: { color: palette.textSubtle, fontSize: 9 }, bubble: { alignSelf: 'flex-start', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 18, borderBottomLeftRadius: 5, paddingHorizontal: 13, paddingVertical: 9 }, bubbleOwn: { alignSelf: 'flex-end', backgroundColor: palette.accent, borderColor: palette.accentBright, borderBottomLeftRadius: 18, borderBottomRightRadius: 5 }, messageText: { color: palette.text, fontSize: 14, lineHeight: 20 }, messageTextOwn: { color: palette.white }, reactions: { flexDirection: 'row', gap: 6, marginTop: 7 }, reaction: { backgroundColor: palette.surfaceSoft, borderRadius: Radius.pill, paddingHorizontal: 9, paddingVertical: 5 }, reactionText: { color: palette.text, fontSize: 11 }, messageTools: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 6 }, messageToolsOwn: { justifyContent: 'flex-end' }, reactionAdd: { height: 27, minWidth: 34, paddingHorizontal: 7, borderRadius: Radius.pill, backgroundColor: palette.surfaceSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  poll: { width: '100%', minWidth: 250, backgroundColor: palette.surface, borderRadius: 20, borderWidth: 1, borderColor: palette.border, padding: 15 }, pollHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 }, pollLabel: { color: palette.accent, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, pollQuestion: { color: palette.text, fontSize: 15, lineHeight: 21, fontWeight: '900', marginTop: 10 }, pollOptions: { gap: 8, marginTop: 13 }, pollOption: { height: 43, borderRadius: 13, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }, pollOptionSelected: { borderColor: palette.accent }, pollProgress: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#B8F76522' }, pollOptionText: { flex: 1, color: palette.text, fontSize: 11, fontWeight: '800' }, pollOptionTextSelected: { color: palette.accent }, pollPercent: { color: palette.textMuted, fontSize: 10, fontWeight: '800' }, pollVotes: { color: palette.textSubtle, fontSize: 9, marginTop: 10 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', margin: 14, padding: 7, borderRadius: 22, backgroundColor: palette.surface, borderColor: palette.borderBright, borderWidth: 1, gap: 7, shadowColor: '#31534D', shadowOpacity: .12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 7 }, add: { width: 36, height: 36, borderRadius: 12, backgroundColor: palette.surfaceSoft, alignItems: 'center', justifyContent: 'center' }, input: { flex: 1, minHeight: 36, maxHeight: 90, color: palette.text, paddingHorizontal: 6, paddingTop: 8, fontSize: 14 }, mic: { width: 36, height: 36, borderRadius: 12, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.45 },
  toolRow: { minHeight: 74, borderRadius: 18, backgroundColor: palette.surface, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 }, toolIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: palette.surfaceRaised, alignItems: 'center', justifyContent: 'center' }, toolCopy: { flex: 1, gap: 4 }, toolTitle: { color: palette.text, fontSize: 14, fontWeight: '800' }, toolText: { color: palette.textMuted, fontSize: 10 }, comingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 }, comingText: { color: palette.textMuted, fontSize: 11 }, emojiRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, emoji: { flex: 1, aspectRatio: 1, maxHeight: 58, borderRadius: 17, backgroundColor: palette.surfaceRaised, alignItems: 'center', justifyContent: 'center' }, emojiText: { fontSize: 24 },
});
