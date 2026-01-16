import { View, Text, ScrollView, Pressable, StyleSheet, Alert, RefreshControl, Platform, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTask, useTaskRuns, useToggleTask, useRunTask, useDeleteTask } from '../../hooks/useTasks';
import { useTheme } from '../../lib/ThemeContext';
import { useToast } from '../../lib/ToastContext';
import { getStatusColor, borderRadius } from '../../lib/theme';

const useGlass = Platform.OS === 'ios' && typeof isLiquidGlassAvailable === 'function' && isLiquidGlassAvailable();

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const taskId = parseInt(id, 10);
  const { colors, shadows } = useTheme();
  const { showToast } = useToast();

  const { data: task, isLoading: taskLoading, refetch: refetchTask } = useTask(taskId);
  const { data: runsData, isLoading: runsLoading, refetch: refetchRuns } = useTaskRuns(taskId);
  const toggleMutation = useToggleTask();
  const runMutation = useRunTask();
  const deleteMutation = useDeleteTask();

  const handleDelete = () => {
    Alert.alert(
      'Delete Task',
      `Are you sure you want to delete "${task?.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const taskName = task?.name;
            deleteMutation.mutate(taskId, {
              onSuccess: () => {
                showToast(`${taskName} deleted`);
                router.back();
              },
              onError: () => {
                showToast('Failed to delete task', 'error');
              },
            });
          },
        },
      ]
    );
  };

  const handleToggle = () => {
    if (!task) return;
    const willEnable = !task.enabled;
    toggleMutation.mutate(taskId, {
      onSuccess: () => {
        showToast(willEnable ? `${task.name} enabled` : `${task.name} disabled`);
      },
      onError: () => {
        showToast('Failed to update task', 'error');
      },
    });
  };

  const handleRun = () => {
    if (!task) return;
    runMutation.mutate(taskId, {
      onSuccess: () => {
        showToast(`Running ${task.name}...`);
      },
      onError: () => {
        showToast('Failed to run task', 'error');
      },
    });
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString();
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  const CardWrapper = useGlass ? GlassView : View;
  const glassSection = {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: borderRadius.lg,
    overflow: 'hidden' as const,
  };
  const section = {
    backgroundColor: colors.cardBackground,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: borderRadius.lg,
    ...shadows.md,
  };
  const sectionStyle = useGlass ? glassSection : section;

  if (taskLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading...</Text>
      </View>
    );
  }

  if (!task) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>Task not found</Text>
      </View>
    );
  }

  const enabledBgColor = task.enabled ? `${colors.success}25` : colors.surfaceSecondary;
  const enabledTextColor = task.enabled ? colors.success : colors.textMuted;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={
        <RefreshControl
          refreshing={taskLoading || runsLoading}
          onRefresh={() => {
            refetchTask();
            refetchRuns();
          }}
          tintColor={colors.textMuted}
        />
      }
    >
      <CardWrapper style={sectionStyle} {...(useGlass && { glassEffectStyle: 'regular' })}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{task.name}</Text>
          <View style={[styles.badge, { backgroundColor: enabledBgColor }]}>
            <Text style={[styles.badgeText, { color: enabledTextColor }]}>
              {task.enabled ? 'Enabled' : 'Disabled'}
            </Text>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Schedule</Text>
          <Text style={[styles.value, { color: colors.textPrimary }]}>
            {task.is_one_off
              ? task.scheduled_at
                ? `Once: ${new Date(task.scheduled_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                : task.last_run_at
                  ? 'One-off (completed)'
                  : 'One-off'
              : task.cron_expr}
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Working Directory</Text>
          <Text style={[styles.value, { color: colors.textPrimary }]}>{task.working_dir}</Text>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Prompt</Text>
          <Text style={[styles.promptValue, { color: colors.textPrimary }]}>{task.prompt}</Text>
        </View>

        {task.next_run_at && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textMuted }]}>Next Run</Text>
            <Text style={[styles.value, { color: colors.textPrimary }]}>{formatDate(task.next_run_at)}</Text>
          </View>
        )}
      </CardWrapper>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: colors.surfaceSecondary },
            pressed && { backgroundColor: colors.border }
          ]}
          onPress={() => router.push(`/task/edit/${taskId}`)}
        >
          <Text style={[styles.actionButtonText, { color: colors.textSecondary }]}>Edit</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: colors.surfaceSecondary },
            pressed && { backgroundColor: colors.border }
          ]}
          onPress={handleToggle}
        >
          <Text style={[styles.actionButtonText, { color: colors.textSecondary }]}>
            {task.enabled ? 'Disable' : 'Enable'}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: colors.orange },
            pressed && { backgroundColor: '#c46648' }
          ]}
          onPress={handleRun}
        >
          <Text style={styles.runButtonText}>Run</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: `${colors.error}15` },
            pressed && { backgroundColor: `${colors.error}30` }
          ]}
          onPress={handleDelete}
        >
          <Text style={[styles.deleteButtonText, { color: colors.error }]}>Delete</Text>
        </Pressable>
      </View>

      <CardWrapper style={sectionStyle} {...(useGlass && { glassEffectStyle: 'regular' })}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recent Runs</Text>

        {runsData?.runs && runsData.runs.length > 0 ? (
          runsData.runs.map((run, index) => (
            <TouchableOpacity
              key={run.id}
              activeOpacity={0.7}
              onPress={() => {
                router.push({
                  pathname: '/run/[id]',
                  params: {
                    id: run.id.toString(),
                    taskName: task.name,
                    status: run.status,
                    output: run.output,
                    error: run.error,
                    started_at: run.started_at,
                    ended_at: run.ended_at,
                    duration_ms: run.duration_ms?.toString(),
                  },
                });
              }}
              style={[styles.runItem, { borderBottomColor: colors.border }, index === runsData.runs.length - 1 && styles.runItemLast]}
            >
              <View style={styles.runHeader}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(run.status, colors) }]} />
                <Text style={[styles.runStatus, { color: colors.textSecondary }]}>{run.status}</Text>
                <Text style={[styles.runDuration, { color: colors.textMuted }]}>{formatDuration(run.duration_ms)}</Text>
              </View>
              <View style={styles.runMetaRow}>
                <Text style={[styles.runDate, { color: colors.textMuted }]}>{formatDate(run.started_at)}</Text>
                <Text style={[styles.viewMore, { color: colors.orange }]}>View Output →</Text>
              </View>
              {run.output && (
                <Text style={[styles.runOutput, { color: colors.textSecondary, backgroundColor: colors.surfaceSecondary }]} numberOfLines={3}>
                  {run.output}
                </Text>
              )}
              {run.error && (
                <Text style={[styles.runError, { color: colors.error, backgroundColor: `${colors.error}10` }]} numberOfLines={2}>
                  {run.error}
                </Text>
              )}
            </TouchableOpacity>
          ))
        ) : (
          <Text style={[styles.noRuns, { color: colors.textMuted }]}>No runs yet</Text>
        )}
      </CardWrapper>
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
  loadingText: {
    fontSize: 16,
  },
  errorText: {
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    flex: 1,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  field: {
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    marginBottom: 2,
  },
  value: {
    fontSize: 14,
    fontFamily: 'monospace',
  },
  promptValue: {
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  runButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#faf9f5',
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  runItem: {
    borderBottomWidth: 1,
    paddingBottom: 12,
    marginBottom: 12,
  },
  runItemLast: {
    borderBottomWidth: 0,
    marginBottom: 0,
    paddingBottom: 0,
  },
  runHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  runStatus: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  runDuration: {
    fontSize: 12,
  },
  runMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  runDate: {
    fontSize: 12,
  },
  viewMore: {
    fontSize: 12,
    fontWeight: '500',
  },
  runOutput: {
    fontSize: 12,
    padding: 8,
    borderRadius: borderRadius.sm,
    fontFamily: 'monospace',
  },
  runError: {
    fontSize: 12,
    padding: 8,
    borderRadius: borderRadius.sm,
  },
  noRuns: {
    fontSize: 14,
    textAlign: 'center',
    padding: 20,
  },
});
