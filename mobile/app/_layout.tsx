import { useState, useCallback, useEffect } from 'react';
import { View, useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreenModule from 'expo-splash-screen';
import { SplashScreen } from '../components/SplashScreen';
import { SetupScreen } from '../components/SetupScreen';
import { ThemeProvider, useTheme } from '../lib/ThemeContext';
import { ToastProvider } from '../lib/ToastContext';
import { isApiConfigured } from '../lib/api';

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
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const { colors, isDark } = useTheme();

  useEffect(() => {
    async function checkConfig() {
      const configured = await isApiConfigured();
      setNeedsSetup(!configured);
      // Hide native splash screen immediately so we can show our custom one
      SplashScreenModule.hideAsync();
      setAppIsReady(true);
    }
    checkConfig();
  }, []);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  const handleSetupComplete = useCallback(() => {
    setNeedsSetup(false);
  }, []);

  if (!appIsReady || needsSetup === null) {
    return null;
  }

  if (needsSetup && !showSplash) {
    return (
      <>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <SetupScreen onComplete={handleSetupComplete} />
      </>
    );
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
          <Stack.Screen
            name="run/[id]"
            options={{
              title: 'Run Output',
              headerBackTitle: 'Back',
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ToastProvider>
            <RootLayoutContent />
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
