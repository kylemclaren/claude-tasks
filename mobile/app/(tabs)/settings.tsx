import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import { useState, useEffect } from 'react';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { useSettings, useUpdateSettings } from '../../hooks/useSettings';
import { useUsage } from '../../hooks/useUsage';
import { getApiBase, setApiBase } from '../../lib/api';
import { UsageBar } from '../../components/UsageBar';

const useGlass = Platform.OS === 'ios' && isGlassEffectAPIAvailable();

export default function SettingsScreen() {
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { data: usage, isLoading: usageLoading } = useUsage();
  const updateSettings = useUpdateSettings();

  const [threshold, setThreshold] = useState('80');
  const [apiUrl, setApiUrl] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (settings) {
      setThreshold(settings.usage_threshold.toString());
    }
  }, [settings]);

  useEffect(() => {
    getApiBase().then(setApiUrl);
  }, []);

  const handleSaveThreshold = () => {
    const value = parseFloat(threshold);
    if (isNaN(value) || value < 0 || value > 100) {
      Alert.alert('Invalid Value', 'Threshold must be between 0 and 100');
      return;
    }
    updateSettings.mutate({ usage_threshold: value });
  };

  const handleSaveApiUrl = async () => {
    try {
      await setApiBase(apiUrl);
      setIsEditing(false);
      Alert.alert('Success', 'API URL updated');
    } catch (error) {
      Alert.alert('Error', 'Failed to save API URL');
    }
  };

  const CardWrapper = useGlass ? GlassView : View;
  const sectionStyle = useGlass ? styles.glassSection : styles.section;

  return (
    <ScrollView style={styles.container}>
      {usage && <UsageBar usage={usage} />}

      <CardWrapper style={sectionStyle} {...(useGlass && { glassEffectStyle: 'regular' })}>
        <Text style={styles.sectionTitle}>Usage Threshold</Text>
        <Text style={styles.sectionDescription}>
          Tasks will be skipped when API usage exceeds this percentage
        </Text>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={threshold}
            onChangeText={setThreshold}
            keyboardType="numeric"
            placeholder="80"
            placeholderTextColor="#9ca3af"
          />
          <Text style={styles.suffix}>%</Text>
          <Pressable
            style={[styles.button, updateSettings.isPending && styles.buttonDisabled]}
            onPress={handleSaveThreshold}
            disabled={updateSettings.isPending}
          >
            <Text style={styles.buttonText}>Save</Text>
          </Pressable>
        </View>
      </CardWrapper>

      <CardWrapper style={sectionStyle} {...(useGlass && { glassEffectStyle: 'regular' })}>
        <Text style={styles.sectionTitle}>API Server</Text>
        <Text style={styles.sectionDescription}>
          The Sprite URL for the Claude Tasks API
        </Text>

        {isEditing ? (
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.urlInput]}
              value={apiUrl}
              onChangeText={setApiUrl}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="https://your-sprite.sprites.app"
              placeholderTextColor="#9ca3af"
            />
            <Pressable style={styles.button} onPress={handleSaveApiUrl}>
              <Text style={styles.buttonText}>Save</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.urlDisplay} onPress={() => setIsEditing(true)}>
            <Text style={styles.urlText} numberOfLines={1}>
              {apiUrl}
            </Text>
            <Text style={styles.editText}>Edit</Text>
          </Pressable>
        )}
      </CardWrapper>

      <CardWrapper style={sectionStyle} {...(useGlass && { glassEffectStyle: 'regular' })}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>App Version</Text>
          <Text style={styles.aboutValue}>1.0.0</Text>
        </View>
        <View style={[styles.aboutRow, styles.aboutRowLast]}>
          <Text style={styles.aboutLabel}>Claude Tasks</Text>
          <Text style={styles.aboutValue}>Mobile Client</Text>
        </View>
      </CardWrapper>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e8e4df',
  },
  glassSection: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  section: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 13,
    color: '#6b7280',
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
    borderColor: 'rgba(209, 213, 219, 0.8)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    color: '#111827',
  },
  urlInput: {
    fontSize: 14,
  },
  suffix: {
    fontSize: 16,
    color: '#6b7280',
    marginRight: 8,
  },
  button: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  urlDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(243, 244, 246, 0.6)',
    padding: 12,
    borderRadius: 10,
  },
  urlText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    marginRight: 8,
  },
  editText: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '500',
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(243, 244, 246, 0.6)',
  },
  aboutRowLast: {
    borderBottomWidth: 0,
  },
  aboutLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  aboutValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
});
