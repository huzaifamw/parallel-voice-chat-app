/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

export const palette = {
  canvas: '#080C10',
  canvasRaised: '#0D1318',
  surface: '#12191F',
  surfaceRaised: '#1B252C',
  surfaceSoft: '#1B252C',
  surfaceAccent: '#17242A',
  border: '#28363E',
  borderBright: '#344750',
  text: '#EEF3F5',
  textMuted: '#8C9DA7',
  textSubtle: '#62747E',
  accent: '#B8F765',
  accentBright: '#B8F765',
  accentSoft: '#62DDC0',
  cyan: '#62DDC0',
  green: '#62DDC0',
  amber: '#D9B7FF',
  red: '#FF718B',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export const Colors = {
  light: {
    text: palette.text,
    background: palette.canvas,
    backgroundElement: palette.surface,
    backgroundSelected: palette.surfaceSoft,
    textSecondary: palette.textMuted,
  },
  dark: {
    text: palette.text,
    background: palette.canvas,
    backgroundElement: palette.surface,
    backgroundSelected: palette.surfaceSoft,
    textSecondary: palette.textMuted,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = { half: 2, one: 4, two: 8, three: 12, four: 16, five: 20, six: 24, seven: 32, eight: 40 } as const;

export const Radius = { xs: 8, sm: 12, md: 16, lg: 22, xl: 28, pill: 999 } as const;

export const Shadows = {
  soft: { shadowColor: '#000000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  accent: { shadowColor: '#B8F765', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
