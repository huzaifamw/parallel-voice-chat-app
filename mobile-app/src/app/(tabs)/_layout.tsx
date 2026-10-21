import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ActivityIndicator, ColorValue, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';

import { palette } from '@/constants/theme';
import { useAuth } from '@/providers/auth-provider';

const icons: Record<string, { active: React.ComponentProps<typeof Ionicons>['name']; inactive: React.ComponentProps<typeof Ionicons>['name'] }> = {
  home: { active: 'home', inactive: 'home-outline' },
  friends: { active: 'people', inactive: 'people-outline' },
  groups: { active: 'grid', inactive: 'grid-outline' },
  activity: { active: 'sparkles', inactive: 'sparkles-outline' },
  profile: { active: 'person', inactive: 'person-outline' },
};

function TabIcon({ name, color, focused }: { name: string; color: ColorValue; focused: boolean }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      {focused ? <Animated.View entering={ZoomIn.springify().damping(14)} exiting={FadeOut.duration(100)}><Ionicons name={icons[name].active} size={20} color={color} /></Animated.View> : <Animated.View entering={FadeIn.duration(180)}><Ionicons name={icons[name].inactive} size={20} color={color} /></Animated.View>}
      {focused ? <View style={styles.activeDot} /> : null}
    </View>
  );
}

export default function TabsLayout() {
  const { configured, loading, session } = useAuth();

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color={palette.accentBright} size="large" /></View>;
  }

  if (!configured || !session) {
    return <Redirect href="/(auth)/welcome" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
        sceneStyle: { backgroundColor: palette.canvas },
      }}>
      {(['home', 'friends', 'groups', 'activity', 'profile'] as const).map((name) => (
        <Tabs.Screen
          key={name}
          name={name === 'home' ? 'index' : name}
          options={{
            title: name[0].toUpperCase() + name.slice(1),
            tabBarIcon: ({ color, focused }) => <TabIcon name={name} color={color} focused={focused} />,
          }}
          listeners={{ tabPress: () => { void Haptics.selectionAsync(); } }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.canvas },
  tabBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: Platform.OS === 'ios' ? 10 : 12,
    height: 74,
    paddingTop: 9,
    paddingBottom: 8,
    backgroundColor: palette.surface,
    borderTopColor: palette.borderBright,
    borderWidth: 1,
    borderRadius: 24,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 14,
  },
  tabItem: { paddingVertical: 2 },
  label: { fontSize: 10, fontWeight: '700', marginTop: 1 },
  iconWrap: { width: 42, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconWrapActive: { backgroundColor: palette.surfaceRaised },
  activeDot: { display: 'none' },
});
