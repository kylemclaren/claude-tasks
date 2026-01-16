import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, Modal, FlatList, Platform, ActivityIndicator } from 'react-native';
import { useState, useMemo, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTask, useUpdateTask } from '../../../hooks/useTasks';
import { useTheme } from '../../../lib/ThemeContext';
import { useToast } from '../../../lib/ToastContext';
import { borderRadius } from '../../../lib/theme';

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

export default function EditTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const taskId = parseInt(id, 10);
  const { data: task, isLoading } = useTask(taskId);
  const updateTask = useUpdateTask();
  const { colors } = useTheme();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [cronExpr, setCronExpr] = useState('');
  const [workingDir, setWorkingDir] = useState('.');
  const [showCronPicker, setShowCronPicker] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // One-off task state
  const [isOneOff, setIsOneOff] = useState(false);
  const [runNow, setRunNow] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(() => {
    const date = new Date();
    date.setHours(date.getHours() + 1);
    date.setMinutes(Math.ceil(date.getMinutes() / 5) * 5, 0, 0);
    return date;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());

  // Initialize form with task data
  useEffect(() => {
    if (task && !initialized) {
      setName(task.name);
      setPrompt(task.prompt);
      setCronExpr(task.cron_expr);
      setWorkingDir(task.working_dir);
      setIsOneOff(task.is_one_off);
      if (task.scheduled_at) {
        setScheduledDate(new Date(task.scheduled_at));
        setRunNow(false);
      } else {
        setRunNow(true);
      }
      setInitialized(true);
    }
  }, [task, initialized]);

  const formattedDateTime = useMemo(() => {
    return scheduledDate.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [scheduledDate]);

  const handleSubmit = () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }
    if (!prompt.trim()) {
      Alert.alert('Error', 'Prompt is required');
      return;
    }
    if (!isOneOff && !cronExpr.trim()) {
      Alert.alert('Error', 'Schedule is required for recurring tasks');
      return;
    }

    const request: Parameters<typeof updateTask.mutate>[0]['task'] = {
      name: name.trim(),
      prompt: prompt.trim(),
      cron_expr: isOneOff ? '' : cronExpr.trim(),
      working_dir: workingDir.trim() || '.',
      enabled: task?.enabled ?? true,
    };

    // Add scheduled_at for one-off tasks that aren't "run now"
    if (isOneOff && !runNow) {
      request.scheduled_at = scheduledDate.toISOString();
    }

    updateTask.mutate(
      { id: taskId, task: request },
      {
        onSuccess: () => {
          showToast(`${name.trim()} updated`);
          router.back();
        },
        onError: (error) => {
          showToast(error.message || 'Failed to update task', 'error');
        },
      }
    );
  };

  if (isLoading || !initialized) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.orange} />
      </View>
    );
  }

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
          <Text style={[styles.label, { color: colors.textSecondary }]}>Task Type</Text>
          <View style={[styles.segmentedControl, { backgroundColor: colors.surfaceSecondary }]}>
            <Pressable
              style={[
                styles.segment,
                !isOneOff && [styles.segmentActive, { backgroundColor: colors.surface }],
              ]}
              onPress={() => setIsOneOff(false)}
            >
              <Text
                style={[
                  styles.segmentText,
                  { color: !isOneOff ? colors.textPrimary : colors.textMuted },
                ]}
              >
                Recurring
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.segment,
                isOneOff && [styles.segmentActive, { backgroundColor: colors.surface }],
              ]}
              onPress={() => setIsOneOff(true)}
            >
              <Text
                style={[
                  styles.segmentText,
                  { color: isOneOff ? colors.textPrimary : colors.textMuted },
                ]}
              >
                One-off
              </Text>
            </Pressable>
          </View>
        </View>

        {!isOneOff ? (
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
        ) : (
          <>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>When to Run</Text>
              <View style={[styles.segmentedControl, { backgroundColor: colors.surfaceSecondary }]}>
                <Pressable
                  style={[
                    styles.segment,
                    runNow && [styles.segmentActive, { backgroundColor: colors.surface }],
                  ]}
                  onPress={() => setRunNow(true)}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: runNow ? colors.textPrimary : colors.textMuted },
                    ]}
                  >
                    Run Now
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.segment,
                    !runNow && [styles.segmentActive, { backgroundColor: colors.surface }],
                  ]}
                  onPress={() => setRunNow(false)}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: !runNow ? colors.textPrimary : colors.textMuted },
                    ]}
                  >
                    Schedule
                  </Text>
                </Pressable>
              </View>
            </View>

            {!runNow && (
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Run At</Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.cronInput,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                    pressed && { backgroundColor: colors.surfaceSecondary }
                  ]}
                  onPress={() => {
                    setTempDate(scheduledDate);
                    setShowDatePicker(true);
                  }}
                >
                  <Text style={[styles.cronText, { color: colors.textPrimary }]}>
                    {formattedDateTime}
                  </Text>
                </Pressable>
              </View>
            )}
          </>
        )}

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
            updateTask.isPending && { backgroundColor: colors.textMuted },
            pressed && !updateTask.isPending && { backgroundColor: '#c46648' }
          ]}
          onPress={handleSubmit}
          disabled={updateTask.isPending}
        >
          <Text style={styles.submitButtonText}>
            {updateTask.isPending ? 'Saving...' : 'Save Changes'}
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

      {/* Date/Time Picker for one-off scheduled tasks */}
      {Platform.OS === 'ios' ? (
        <Modal
          visible={showDatePicker}
          animationType="slide"
          presentationStyle="pageSheet"
        >
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              <Pressable onPress={() => setShowDatePicker(false)}>
                <Text style={[styles.modalClose, { color: colors.textMuted }]}>Cancel</Text>
              </Pressable>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Select Date & Time</Text>
              <Pressable onPress={() => {
                setScheduledDate(tempDate);
                setShowDatePicker(false);
              }}>
                <Text style={[styles.modalClose, { color: colors.orange }]}>Done</Text>
              </Pressable>
            </View>
            <View style={styles.datePickerContainer}>
              <DateTimePicker
                value={tempDate}
                mode="datetime"
                display="spinner"
                minimumDate={new Date()}
                onChange={(_, date) => date && setTempDate(date)}
              />
            </View>
          </View>
        </Modal>
      ) : (
        <>
          {showDatePicker && (
            <DateTimePicker
              value={scheduledDate}
              mode="date"
              display="default"
              minimumDate={new Date()}
              onChange={(_, date) => {
                setShowDatePicker(false);
                if (date) {
                  const newDate = new Date(date);
                  newDate.setHours(scheduledDate.getHours());
                  newDate.setMinutes(scheduledDate.getMinutes());
                  setScheduledDate(newDate);
                  setTimeout(() => setShowTimePicker(true), 100);
                }
              }}
            />
          )}
          {showTimePicker && (
            <DateTimePicker
              value={scheduledDate}
              mode="time"
              display="default"
              onChange={(_, date) => {
                setShowTimePicker(false);
                if (date) {
                  setScheduledDate(date);
                }
              }}
            />
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: borderRadius.sm,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: borderRadius.sm - 2,
  },
  segmentActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
  },
  datePickerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
});
