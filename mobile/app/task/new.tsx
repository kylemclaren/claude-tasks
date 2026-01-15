import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, Modal, FlatList } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { useCreateTask } from '../../hooks/useTasks';
import { useTheme } from '../../lib/ThemeContext';
import { borderRadius } from '../../lib/theme';

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
  const { colors, shadows } = useTheme();

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
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled">
      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Name *</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary }]}
            value={name}
            onChangeText={setName}
            placeholder="Task name"
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Prompt *</Text>
          <TextInput
            style={[styles.input, styles.textArea, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary }]}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="What should Claude do?"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Schedule *</Text>
          <Pressable
            style={({ pressed }) => [
              styles.cronInput,
              { borderColor: colors.border, backgroundColor: colors.surface },
              pressed && { backgroundColor: colors.surfaceSecondary }
            ]}
            onPress={() => setShowCronPicker(true)}
          >
            <Text style={cronExpr ? [styles.cronText, { color: colors.textPrimary }] : [styles.cronPlaceholder, { color: colors.textMuted }]}>
              {cronExpr || 'Select schedule...'}
            </Text>
          </Pressable>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            6-field cron: second minute hour day month weekday
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Working Directory</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary }]}
            value={workingDir}
            onChangeText={setWorkingDir}
            placeholder="."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.submitButton,
            { backgroundColor: colors.orange },
            createTask.isPending && { backgroundColor: colors.textMuted },
            pressed && !createTask.isPending && { backgroundColor: '#c46648' }
          ]}
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
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Select Schedule</Text>
            <Pressable onPress={() => setShowCronPicker(false)}>
              <Text style={[styles.modalClose, { color: colors.orange }]}>Done</Text>
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
                style={({ pressed }) => [
                  styles.presetItem,
                  { backgroundColor: colors.surface },
                  cronExpr === item.expr && { borderColor: colors.orange, backgroundColor: `${colors.orange}10` },
                  pressed && { backgroundColor: colors.surfaceSecondary }
                ]}
              >
                <Text style={[styles.presetName, { color: colors.textPrimary }]}>{item.name}</Text>
                <Text style={[styles.presetExpr, { color: colors.textSecondary }]}>{item.expr}</Text>
                <Text style={[styles.presetDesc, { color: colors.textMuted }]}>{item.desc}</Text>
              </Pressable>
            )}
          />

          <View style={[styles.customCron, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <Text style={[styles.customCronLabel, { color: colors.textSecondary }]}>Custom cron expression:</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]}
              value={cronExpr}
              onChangeText={setCronExpr}
              placeholder="0 * * * * *"
              placeholderTextColor={colors.textMuted}
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
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
  },
  cronInput: {
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  cronText: {
    fontSize: 16,
    fontFamily: 'monospace',
  },
  cronPlaceholder: {
    fontSize: 16,
  },
  hint: {
    fontSize: 12,
    marginTop: 4,
  },
  submitButton: {
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#faf9f5',
  },
  modal: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalClose: {
    fontSize: 16,
    fontWeight: '500',
  },
  presetItem: {
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  presetName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  presetExpr: {
    fontSize: 14,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  presetDesc: {
    fontSize: 12,
  },
  customCron: {
    padding: 16,
    borderTopWidth: 1,
  },
  customCronLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
});
