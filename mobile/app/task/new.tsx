import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, Modal, FlatList } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { useCreateTask } from '../../hooks/useTasks';

const CRON_PRESETS = [
  { name: 'Every minute', expr: '0 * * * * *', desc: 'Runs at the start of every minute' },
  { name: 'Every 5 minutes', expr: '0 */5 * * * *', desc: 'Runs every 5 minutes' },
  { name: 'Every 15 minutes', expr: '0 */15 * * * *', desc: 'Runs every 15 minutes' },
  { name: 'Every hour', expr: '0 0 * * * *', desc: 'Runs at the start of every hour' },
  { name: 'Every 2 hours', expr: '0 0 */2 * * *', desc: 'Runs every 2 hours' },
  { name: 'Daily at 9am', expr: '0 0 9 * * *', desc: 'Runs once daily at 9:00 AM' },
  { name: 'Daily at midnight', expr: '0 0 0 * * *', desc: 'Runs once daily at midnight' },
  { name: 'Weekly on Monday', expr: '0 0 9 * * 1', desc: 'Runs every Monday at 9:00 AM' },
  { name: 'Monthly on 1st', expr: '0 0 9 1 * *', desc: 'Runs on the 1st of each month at 9:00 AM' },
];

export default function NewTaskScreen() {
  const createTask = useCreateTask();

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [cronExpr, setCronExpr] = useState('');
  const [workingDir, setWorkingDir] = useState('.');
  const [showCronPicker, setShowCronPicker] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }
    if (!prompt.trim()) {
      Alert.alert('Error', 'Prompt is required');
      return;
    }
    if (!cronExpr.trim()) {
      Alert.alert('Error', 'Schedule is required');
      return;
    }

    createTask.mutate(
      {
        name: name.trim(),
        prompt: prompt.trim(),
        cron_expr: cronExpr.trim(),
        working_dir: workingDir.trim() || '.',
        enabled: true,
      },
      {
        onSuccess: () => {
          router.back();
        },
        onError: (error) => {
          Alert.alert('Error', error.message);
        },
      }
    );
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Task name"
            autoFocus
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Prompt *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="What should Claude do?"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Schedule *</Text>
          <Pressable
            style={styles.cronInput}
            onPress={() => setShowCronPicker(true)}
          >
            <Text style={cronExpr ? styles.cronText : styles.cronPlaceholder}>
              {cronExpr || 'Select schedule...'}
            </Text>
          </Pressable>
          <Text style={styles.hint}>
            6-field cron: second minute hour day month weekday
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Working Directory</Text>
          <TextInput
            style={styles.input}
            value={workingDir}
            onChangeText={setWorkingDir}
            placeholder="."
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <Pressable
          style={[styles.submitButton, createTask.isPending && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={createTask.isPending}
        >
          <Text style={styles.submitButtonText}>
            {createTask.isPending ? 'Creating...' : 'Create Task'}
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={showCronPicker}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Schedule</Text>
            <Pressable onPress={() => setShowCronPicker(false)}>
              <Text style={styles.modalClose}>Done</Text>
            </Pressable>
          </View>

          <FlatList
            data={CRON_PRESETS}
            keyExtractor={(item) => item.expr}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setCronExpr(item.expr);
                  setShowCronPicker(false);
                }}
                style={[
                  styles.presetItem,
                  cronExpr === item.expr && styles.presetItemSelected,
                ]}
              >
                <Text style={styles.presetName}>{item.name}</Text>
                <Text style={styles.presetExpr}>{item.expr}</Text>
                <Text style={styles.presetDesc}>{item.desc}</Text>
              </Pressable>
            )}
          />

          <View style={styles.customCron}>
            <Text style={styles.customCronLabel}>Custom cron expression:</Text>
            <TextInput
              style={styles.input}
              value={cronExpr}
              onChangeText={setCronExpr}
              placeholder="0 * * * * *"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  form: {
    padding: 16,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  textArea: {
    minHeight: 100,
  },
  cronInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  cronText: {
    fontSize: 16,
    color: '#111827',
    fontFamily: 'monospace',
  },
  cronPlaceholder: {
    fontSize: 16,
    color: '#9ca3af',
  },
  hint: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  submitButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  modal: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalClose: {
    fontSize: 16,
    color: '#2563eb',
    fontWeight: '500',
  },
  presetItem: {
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  presetItemSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  presetName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  presetExpr: {
    fontSize: 14,
    color: '#6b7280',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  presetDesc: {
    fontSize: 12,
    color: '#9ca3af',
  },
  customCron: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  customCronLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
});
