/**
 * Anthropic Brand Colors and Theme
 * Based on official brand guidelines with dark mode support
 */

// Brand accent colors (constant across themes)
export const brandColors = {
  orange: '#d97757',      // Primary accent
  blue: '#6a9bcc',        // Secondary accent
  green: '#788c5d',       // Tertiary accent
} as const;

// Light theme colors
export const lightTheme = {
  // Base colors
  background: '#faf9f5',
  surface: 'rgba(255, 255, 255, 0.9)',
  surfaceSecondary: '#f5f4f0',
  border: 'rgba(176, 174, 165, 0.3)',

  // Text colors
  textPrimary: '#141413',
  textSecondary: '#6b6962',
  textMuted: '#b0aea5',

  // Status colors
  success: '#788c5d',
  warning: '#d97757',
  error: '#c45c4a',
  info: '#6a9bcc',

  // UI elements
  inputBackground: '#ffffff',
  cardBackground: 'rgba(255, 255, 255, 0.95)',
  tabBarBackground: '#faf9f5',

  // Brand accents
  ...brandColors,
} as const;

// Dark theme colors
export const darkTheme = {
  // Base colors
  background: '#141413',
  surface: 'rgba(40, 40, 38, 0.9)',
  surfaceSecondary: '#1f1f1e',
  border: 'rgba(176, 174, 165, 0.2)',

  // Text colors
  textPrimary: '#faf9f5',
  textSecondary: '#b0aea5',
  textMuted: '#6b6962',

  // Status colors
  success: '#8fa96d',     // Slightly brighter for dark mode
  warning: '#e08868',     // Slightly brighter
  error: '#d46b5a',       // Slightly brighter
  info: '#7aaad6',        // Slightly brighter

  // UI elements
  inputBackground: '#252524',
  cardBackground: 'rgba(45, 45, 43, 0.95)',
  tabBarBackground: '#1a1a19',

  // Brand accents (same for recognition)
  ...brandColors,
} as const;

export type ThemeColors = typeof lightTheme;
export type ColorScheme = 'light' | 'dark';

// Legacy export for backwards compatibility during migration
export const colors = {
  ...lightTheme,
  dark: '#141413',
  light: '#faf9f5',
  midGray: '#b0aea5',
  lightGray: '#e8e6dc',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

// Shadow factory that works with dark/light themes
export const createShadows = (isDark: boolean) => ({
  sm: {
    shadowColor: isDark ? '#000000' : '#141413',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: isDark ? 0.3 : 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: isDark ? '#000000' : '#141413',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.4 : 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: isDark ? '#000000' : '#141413',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.5 : 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
});

// Default shadows (light theme)
export const shadows = createShadows(false);

// Helper to get status color (works with any theme)
export function getStatusColor(status?: string, theme: ThemeColors = lightTheme): string {
  switch (status) {
    case 'completed':
      return theme.success;
    case 'failed':
      return theme.error;
    case 'running':
      return theme.warning;
    default:
      return theme.textMuted;
  }
}
