import { View, Text, ScrollView, Pressable, StyleSheet, Alert, RefreshControl } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useTask, useTaskRuns, useToggleTask, useRunTask, useDeleteTask } from '../../hooks/useTasks';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const taskId = parseInt(id, 10);

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
            deleteMutation.mutate(taskId, {
              onSuccess: () => router.back(),
            });
          },
        },
      ]
    );
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'completed':
        return '#22c55e';
      case 'failed':
        return '#ef4444';
      case 'running':
        return '#f59e0b';
      default:
        return '#6b7280';
    }
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

  if (taskLoading) {
    return (
      <View style={styles.centered}>
        <Text>Loading...</Text>
      </View>
    );
  }

  if (!task) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Task not found</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={taskLoading || runsLoading}
          onRefresh={() => {
            refetchTask();
            refetchRuns();
          }}
        />
      }
    >
      <View style={styles.section}>
        <View style={styles.header}>
          <Text style={styles.title}>{task.name}</Text>
          <View style={[styles.badge, { backgroundColor: task.enabled ? '#dcfce7' : '#f3f4f6' }]}>
            <Text style={[styles.badgeText, { color: task.enabled ? '#166534' : '#6b7280' }]}>
              {task.enabled ? 'Enabled' : 'Disabled'}
            </Text>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Schedule</Text>
          <Text style={styles.value}>{task.cron_expr}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Working Directory</Text>
          <Text style={styles.value}>{task.working_dir}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Prompt</Text>
          <Text style={styles.promptValue}>{task.prompt}</Text>
        </View>

        {task.next_run_at && (
          <View style={styles.field}>
            <Text style={styles.label}>Next Run</Text>
            <Text style={styles.value}>{formatDate(task.next_run_at)}</Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.actionButton, styles.toggleButton]}
          onPress={() => toggleMutation.mutate(taskId)}
        >
          <Text style={styles.actionButtonText}>
            {task.enabled ? 'Disable' : 'Enable'}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.actionButton, styles.runButton]}
          onPress={() => runMutation.mutate(taskId)}
        >
          <Text style={styles.runButtonText}>Run Now</Text>
        </Pressable>

        <Pressable
          style={[styles.actionButton, styles.deleteButton]}
          onPress={handleDelete}
        >
          <Text style={styles.deleteButtonText}>Delete</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Runs</Text>

        {runsData?.runs && runsData.runs.length > 0 ? (
          runsData.runs.map((run) => (
            <View key={run.id} style={styles.runItem}>
              <View style={styles.runHeader}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(run.status) }]} />
                <Text style={styles.runStatus}>{run.status}</Text>
                <Text style={styles.runDuration}>{formatDuration(run.duration_ms)}</Text>
              </View>
              <Text style={styles.runDate}>{formatDate(run.started_at)}</Text>
              {run.output && (
                <Text style={styles.runOutput} numberOfLines={5}>
                  {run.output}
                </Text>
              )}
              {run.error && (
                <Text style={styles.runError} numberOfLines={3}>
                  {run.error}
                </Text>
              )}
            </View>
          ))
        ) : (
          <Text style={styles.noRuns}>No runs yet</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
  },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
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
    color: '#111827',
    flex: 1,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
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
    color: '#6b7280',
    marginBottom: 2,
  },
  value: {
    fontSize: 14,
    color: '#111827',
    fontFamily: 'monospace',
  },
  promptValue: {
    fontSize: 14,
    color: '#111827',
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
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleButton: {
    backgroundColor: '#f3f4f6',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  runButton: {
    backgroundColor: '#2563eb',
  },
  runButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  deleteButton: {
    backgroundColor: '#fef2f2',
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  runItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingBottom: 12,
    marginBottom: 12,
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
    color: '#374151',
    flex: 1,
  },
  runDuration: {
    fontSize: 12,
    color: '#6b7280',
  },
  runDate: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 8,
  },
  runOutput: {
    fontSize: 12,
    color: '#374151',
    backgroundColor: '#f9fafb',
    padding: 8,
    borderRadius: 4,
    fontFamily: 'monospace',
  },
  runError: {
    fontSize: 12,
    color: '#ef4444',
    backgroundColor: '#fef2f2',
    padding: 8,
    borderRadius: 4,
  },
  noRuns: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    padding: 20,
  },
});
