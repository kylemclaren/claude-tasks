import { useState, useCallback, useEffect } from 'react';
import { View, useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreenModule from 'expo-splash-screen';
import { SplashScreen } from '../components/SplashScreen';
import { ThemeProvider, useTheme } from '../lib/ThemeContext';

// Keep the native splash screen visible while we show our custom one
SplashScreenModule.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5000,
    },
  },
});

function RootLayoutContent() {
  const [showSplash, setShowSplash] = useState(true);
  const [appIsReady, setAppIsReady] = useState(false);
  const { colors, isDark } = useTheme();

  useEffect(() => {
    // Hide native splash screen immediately so we can show our custom one
    SplashScreenModule.hideAsync();
    setAppIsReady(true);
  }, []);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  if (!appIsReady) {
    return null;
  }

  return (
    <>
      <StatusBar style={showSplash ? 'light' : (isDark ? 'light' : 'dark')} />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: colors.background,
            },
            headerTintColor: colors.textPrimary,
            headerTitleStyle: {
              fontWeight: '600',
            },
            contentStyle: {
              backgroundColor: colors.background,
            },
          }}
        >
          <Stack.Screen
            name="(tabs)"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="task/[id]"
            options={{
              title: 'Task',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="task/new"
            options={{
              title: 'New Task',
              presentation: 'modal',
            }}
          />
        </Stack>
        {showSplash && <SplashScreen onAnimationComplete={handleSplashComplete} />}
      </View>
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RootLayoutContent />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
