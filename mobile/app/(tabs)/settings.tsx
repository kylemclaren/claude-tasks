import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import { useState, useEffect } from 'react';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useSettings, useUpdateSettings } from '../../hooks/useSettings';
import { useUsage } from '../../hooks/useUsage';
import { getApiBase, setApiBase, getAuthToken, setAuthToken } from '../../lib/api';
import { UsageBar } from '../../components/UsageBar';
import { useTheme } from '../../lib/ThemeContext';
import { useToast } from '../../lib/ToastContext';
import { borderRadius } from '../../lib/theme';

const useGlass = Platform.OS === 'ios' && typeof isLiquidGlassAvailable === 'function' && isLiquidGlassAvailable();

export default function SettingsScreen() {
  const { data: settings } = useSettings();
  const { data: usage } = useUsage();
  const updateSettings = useUpdateSettings();
  const { colors, shadows, isDark } = useTheme();
  const { showToast } = useToast();

  const [threshold, setThreshold] = useState('80');
  const [apiUrl, setApiUrl] = useState('');
  const [authToken, setAuthTokenState] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [isEditingToken, setIsEditingToken] = useState(false);

  useEffect(() => {
    if (settings) {
      setThreshold(settings.usage_threshold.toString());
    }
  }, [settings]);

  useEffect(() => {
    getApiBase().then((url) => setApiUrl(url || ''));
    getAuthToken().then((token) => {
      setHasToken(!!token);
      // Don't expose the actual token value for security
    });
  }, []);

  const handleSaveThreshold = () => {
    const value = parseFloat(threshold);
    if (isNaN(value) || value < 0 || value > 100) {
      showToast('Threshold must be 0-100%', 'error');
      return;
    }
    updateSettings.mutate(
      { usage_threshold: value },
      {
        onSuccess: () => showToast('Threshold saved'),
        onError: () => showToast('Failed to save threshold', 'error'),
      }
    );
  };

  const handleSaveApiUrl = async () => {
    try {
      await setApiBase(apiUrl);
      setIsEditingUrl(false);
      showToast('API URL updated');
    } catch (error) {
      showToast('Failed to save API URL', 'error');
    }
  };

  const handleSaveToken = async () => {
    try {
      await setAuthToken(authToken);
      setHasToken(!!authToken);
      setIsEditingToken(false);
      setAuthTokenState('');
      showToast(authToken ? 'Auth token updated' : 'Auth token removed');
    } catch (error) {
      showToast('Failed to save auth token', 'error');
    }
  };

  const handleClearToken = async () => {
    try {
      await setAuthToken('');
      setHasToken(false);
      showToast('Auth token removed');
    } catch (error) {
      showToast('Failed to remove auth token', 'error');
    }
  };

  const CardWrapper = useGlass ? GlassView : View;
  const sectionStyle = useGlass
    ? styles.glassSection
    : [styles.section, { backgroundColor: colors.cardBackground }, shadows.md];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {usage && <UsageBar usage={usage} />}

      <CardWrapper style={sectionStyle} {...(useGlass && { glassEffectStyle: 'regular' })}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Usage Threshold</Text>
        <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
          Tasks will be skipped when API usage exceeds this percentage
        </Text>

        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, {
              borderColor: colors.border,
              backgroundColor: colors.inputBackground,
              color: colors.textPrimary
            }]}
            value={threshold}
            onChangeText={setThreshold}
            keyboardType="numeric"
            placeholder="80"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={[styles.suffix, { color: colors.textSecondary }]}>%</Text>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.orange },
              updateSettings.isPending && { backgroundColor: colors.textMuted },
              pressed && !updateSettings.isPending && { backgroundColor: '#c46648' }
            ]}
            onPress={handleSaveThreshold}
            disabled={updateSettings.isPending}
          >
            <Text style={styles.buttonText}>Save</Text>
          </Pressable>
        </View>
      </CardWrapper>

      <CardWrapper style={sectionStyle} {...(useGlass && { glassEffectStyle: 'regular' })}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>API Server</Text>
        <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
          The URL of your Claude Tasks server
        </Text>

        {isEditingUrl ? (
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.urlInput, {
                borderColor: colors.border,
                backgroundColor: colors.inputBackground,
                color: colors.textPrimary
              }]}
              value={apiUrl}
              onChangeText={setApiUrl}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="https://your-server.example.com"
              placeholderTextColor={colors.textMuted}
            />
            <Pressable
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.orange },
                pressed && { backgroundColor: '#c46648' }
              ]}
              onPress={handleSaveApiUrl}
            >
              <Text style={styles.buttonText}>Save</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.urlDisplay, { backgroundColor: colors.surfaceSecondary }]}
            onPress={() => setIsEditingUrl(true)}
          >
            <Text style={[styles.urlText, { color: colors.textSecondary }]} numberOfLines={1}>
              {apiUrl}
            </Text>
            <Text style={[styles.editText, { color: colors.orange }]}>Edit</Text>
          </Pressable>
        )}
      </CardWrapper>

      <CardWrapper style={sectionStyle} {...(useGlass && { glassEffectStyle: 'regular' })}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Auth Token</Text>
        <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
          Optional Bearer token for authentication
        </Text>

        {isEditingToken ? (
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.urlInput, {
                borderColor: colors.border,
                backgroundColor: colors.inputBackground,
                color: colors.textPrimary
              }]}
              value={authToken}
              onChangeText={setAuthTokenState}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder="Enter token"
              placeholderTextColor={colors.textMuted}
            />
            <Pressable
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.orange },
                pressed && { backgroundColor: '#c46648' }
              ]}
              onPress={handleSaveToken}
            >
              <Text style={styles.buttonText}>Save</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.urlDisplay, { backgroundColor: colors.surfaceSecondary }]}
            onPress={() => setIsEditingToken(true)}
          >
            <Text style={[styles.urlText, { color: colors.textSecondary }]}>
              {hasToken ? '••••••••••••' : 'Not configured'}
            </Text>
            <Text style={[styles.editText, { color: colors.orange }]}>
              {hasToken ? 'Change' : 'Add'}
            </Text>
          </Pressable>
        )}
        {hasToken && !isEditingToken && (
          <Pressable
            style={[styles.clearButton, { borderColor: colors.border }]}
            onPress={handleClearToken}
          >
            <Text style={[styles.clearButtonText, { color: colors.error }]}>Remove Token</Text>
          </Pressable>
        )}
      </CardWrapper>

      <CardWrapper style={sectionStyle} {...(useGlass && { glassEffectStyle: 'regular' })}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>About</Text>
        <View style={[styles.aboutRow, { borderBottomColor: colors.surfaceSecondary }]}>
          <Text style={[styles.aboutLabel, { color: colors.textSecondary }]}>App Version</Text>
          <Text style={[styles.aboutValue, { color: colors.textPrimary }]}>1.0.0</Text>
        </View>
        <View style={[styles.aboutRow, { borderBottomColor: colors.surfaceSecondary }]}>
          <Text style={[styles.aboutLabel, { color: colors.textSecondary }]}>Claude Tasks</Text>
          <Text style={[styles.aboutValue, { color: colors.textPrimary }]}>Mobile Client</Text>
        </View>
        <View style={[styles.aboutRow, { borderBottomColor: colors.surfaceSecondary }]}>
          <Text style={[styles.aboutLabel, { color: colors.textSecondary }]}>Theme</Text>
          <Text style={[styles.aboutValue, { color: colors.textPrimary }]}>
            {isDark ? 'Dark' : 'Light'} (System)
          </Text>
        </View>
        <View style={[styles.aboutRow, { borderBottomColor: colors.surfaceSecondary }]}>
          <Text style={[styles.aboutLabel, { color: colors.textSecondary }]}>Platform</Text>
          <Text style={[styles.aboutValue, { color: colors.textPrimary }]}>
            {Platform.OS} {Platform.Version}
          </Text>
        </View>
        <View style={[styles.aboutRow, styles.aboutRowLast]}>
          <Text style={[styles.aboutLabel, { color: colors.textSecondary }]}>Liquid Glass</Text>
          <Text style={[styles.aboutValue, { color: useGlass ? colors.success : colors.textMuted }]}>
            {useGlass ? 'Enabled' : 'Not Available'}
          </Text>
        </View>
      </CardWrapper>

      {/* Bottom spacer */}
      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  glassSection: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  section: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: borderRadius.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 13,
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  urlInput: {
    fontSize: 14,
  },
  suffix: {
    fontSize: 16,
    marginRight: 8,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
  },
  buttonText: {
    color: '#faf9f5',
    fontWeight: '600',
    fontSize: 14,
  },
  urlDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: borderRadius.sm,
  },
  urlText: {
    flex: 1,
    fontSize: 14,
    marginRight: 8,
  },
  editText: {
    fontSize: 14,
    fontWeight: '500',
  },
  clearButton: {
    marginTop: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  aboutRowLast: {
    borderBottomWidth: 0,
  },
  aboutLabel: {
    fontSize: 14,
  },
  aboutValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  bottomSpacer: {
    height: 32,
  },
});
