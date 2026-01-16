import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useState } from 'react';
import { setApiBase, setAuthToken } from '../lib/api';
import { useTheme } from '../lib/ThemeContext';
import { borderRadius, spacing } from '../lib/theme';

interface SetupScreenProps {
  onComplete: () => void;
}

export function SetupScreen({ onComplete }: SetupScreenProps) {
  const { colors, shadows } = useTheme();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      setError('Please enter an API URL');
      return;
    }

    // Basic URL validation
    try {
      new URL(trimmedUrl);
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      await setApiBase(trimmedUrl);
      await setAuthToken(token.trim());
      onComplete();
    } catch (err) {
      setError('Failed to save configuration');
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        {/* Logo/Header */}
        <View style={styles.header}>
          <Text style={[styles.logo, { color: colors.orange }]}>▀▄█▄▀</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Claude Tasks</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Connect to your Claude Tasks server
          </Text>
        </View>

        {/* Form */}
        <View style={[styles.form, { backgroundColor: colors.cardBackground }, shadows.md]}>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>API URL</Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              The URL of your Claude Tasks server
            </Text>
            <TextInput
              style={[styles.input, {
                borderColor: error && !url ? colors.error : colors.border,
                backgroundColor: colors.inputBackground,
                color: colors.textPrimary,
              }]}
              value={url}
              onChangeText={(text) => {
                setUrl(text);
                setError('');
              }}
              placeholder="https://your-server.example.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>Auth Token</Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              Optional Bearer token for authentication
            </Text>
            <TextInput
              style={[styles.input, {
                borderColor: colors.border,
                backgroundColor: colors.inputBackground,
                color: colors.textPrimary,
              }]}
              value={token}
              onChangeText={setToken}
              placeholder="Optional"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          </View>

          {error ? (
            <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.orange },
              isSaving && { backgroundColor: colors.textMuted },
              pressed && !isSaving && { backgroundColor: '#c46648' },
            ]}
            onPress={handleSave}
            disabled={isSaving}
          >
            <Text style={styles.buttonText}>
              {isSaving ? 'Connecting...' : 'Connect'}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logo: {
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  form: {
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
  },
  field: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  hint: {
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  error: {
    fontSize: 14,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  button: {
    paddingVertical: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonText: {
    color: '#faf9f5',
    fontSize: 16,
    fontWeight: '600',
  },
});
