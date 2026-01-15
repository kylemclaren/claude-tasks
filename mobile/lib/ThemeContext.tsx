import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme, createShadows, type ThemeColors, type ColorScheme } from './theme';

interface ThemeContextValue {
  colors: ThemeColors;
  shadows: ReturnType<typeof createShadows>;
  isDark: boolean;
  colorScheme: ColorScheme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const systemColorScheme = useColorScheme();
  const isDark = systemColorScheme === 'dark';

  const value = useMemo<ThemeContextValue>(() => ({
    colors: isDark ? darkTheme : lightTheme,
    shadows: createShadows(isDark),
    isDark,
    colorScheme: isDark ? 'dark' : 'light',
  }), [isDark]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Hook for just colors (convenience)
export function useColors(): ThemeColors {
  const { colors } = useTheme();
  return colors;
}

// Hook for checking dark mode
export function useIsDarkMode(): boolean {
  const { isDark } = useTheme();
  return isDark;
}
