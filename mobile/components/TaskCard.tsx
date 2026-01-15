import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Link } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useToggleTask, useRunTask } from '../hooks/useTasks';
import { useTheme } from '../lib/ThemeContext';
import { getStatusColor, borderRadius } from '../lib/theme';
import { cronToHuman } from '../lib/cronToHuman';
import type { Task } from '../lib/types';

interface Props {
  task: Task;
}

const useGlass = Platform.OS === 'ios' && typeof isLiquidGlassAvailable === 'function' && isLiquidGlassAvailable();

export function TaskCard({ task }: Props) {
  const toggleMutation = useToggleTask();
  const runMutation = useRunTask();
  const { colors, shadows } = useTheme();

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

  const CardWrapper = useGlass ? GlassView : View;
  const statusColor = getStatusColor(task.last_run_status, colors);
  const enabledBgColor = task.enabled
    ? `${colors.success}25`
    : colors.surfaceSecondary;
  const enabledTextColor = task.enabled
    ? colors.success
    : colors.textMuted;

  const content = (
    <>
      <View style={styles.header}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {task.name}
        </Text>
        <View style={[styles.badge, { backgroundColor: enabledBgColor }]}>
          <Text style={[styles.badgeText, { color: enabledTextColor }]}>
            {task.enabled ? 'Enabled' : 'Disabled'}
          </Text>
        </View>
      </View>

      <Text style={[styles.cron, { color: colors.textSecondary }]}>{cronToHuman(task.cron_expr)}</Text>

      <View style={styles.footer}>
        <Text style={[styles.nextRun, { color: colors.textMuted }]}>
          {task.next_run_at ? `Next: ${formatRelativeTime(task.next_run_at)}` : 'Not scheduled'}
        </Text>

        <View style={styles.actions}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              toggleMutation.mutate(task.id);
            }}
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: colors.surfaceSecondary },
              pressed && { backgroundColor: colors.border }
            ]}
          >
            <Text style={[styles.actionText, { color: colors.textSecondary }]}>
              {task.enabled ? 'Disable' : 'Enable'}
            </Text>
          </Pressable>

          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              runMutation.mutate(task.id);
            }}
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: `${colors.orange}20` },
              pressed && { backgroundColor: `${colors.orange}40` }
            ]}
          >
            <Text style={[styles.actionText, { color: colors.orange }]}>Run</Text>
          </Pressable>
        </View>
      </View>
    </>
  );

  const cardStyle = useGlass
    ? styles.glassCard
    : [styles.card, { backgroundColor: colors.cardBackground }, shadows.md];

  return (
    <Link href={`/task/${task.id}`} asChild>
      <Pressable>
        <CardWrapper style={cardStyle} {...(useGlass && { glassEffectStyle: 'regular' })}>
          {content}
        </CardWrapper>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  glassCard: {
    borderRadius: borderRadius.lg,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    overflow: 'hidden',
  },
  card: {
    borderRadius: borderRadius.lg,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
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
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  cron: {
    fontSize: 13,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nextRun: {
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
