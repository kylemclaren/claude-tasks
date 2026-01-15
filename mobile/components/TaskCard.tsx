import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { useToggleTask, useRunTask } from '../hooks/useTasks';
import type { Task } from '../lib/types';

interface Props {
  task: Task;
}

export function TaskCard({ task }: Props) {
  const toggleMutation = useToggleTask();
  const runMutation = useRunTask();

  const getStatusColor = () => {
    switch (task.last_run_status) {
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

  const formatRelativeTime = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const absDiff = Math.abs(diff);

    if (absDiff < 60000) return diff > 0 ? 'in < 1m' : '< 1m ago';
    if (absDiff < 3600000) {
      const mins = Math.round(absDiff / 60000);
      return diff > 0 ? `in ${mins}m` : `${mins}m ago`;
    }
    if (absDiff < 86400000) {
      const hours = Math.round(absDiff / 3600000);
      return diff > 0 ? `in ${hours}h` : `${hours}h ago`;
    }
    const days = Math.round(absDiff / 86400000);
    return diff > 0 ? `in ${days}d` : `${days}d ago`;
  };

  return (
    <Link href={`/task/${task.id}`} asChild>
      <Pressable style={styles.card}>
        <View style={styles.header}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
          <Text style={styles.name} numberOfLines={1}>
            {task.name}
          </Text>
          <View style={[styles.badge, { backgroundColor: task.enabled ? '#dcfce7' : '#f3f4f6' }]}>
            <Text style={[styles.badgeText, { color: task.enabled ? '#166534' : '#6b7280' }]}>
              {task.enabled ? 'Enabled' : 'Disabled'}
            </Text>
          </View>
        </View>

        <Text style={styles.cron}>{task.cron_expr}</Text>

        <View style={styles.footer}>
          <Text style={styles.nextRun}>
            {task.next_run_at ? `Next: ${formatRelativeTime(task.next_run_at)}` : 'Not scheduled'}
          </Text>

          <View style={styles.actions}>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                toggleMutation.mutate(task.id);
              }}
              style={styles.actionButton}
            >
              <Text style={styles.actionText}>{task.enabled ? 'Disable' : 'Enable'}</Text>
            </Pressable>

            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                runMutation.mutate(task.id);
              }}
              style={[styles.actionButton, styles.runButton]}
            >
              <Text style={[styles.actionText, styles.runText]}>Run</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  cron: {
    fontSize: 13,
    color: '#6b7280',
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nextRun: {
    fontSize: 12,
    color: '#9ca3af',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  runButton: {
    backgroundColor: '#dbeafe',
  },
  runText: {
    color: '#1d4ed8',
  },
});
