import { View, Text, StyleSheet, Platform, Pressable, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTheme } from '../lib/ThemeContext';
import { borderRadius, spacing } from '../lib/theme';
import { Spinner } from './Spinner';
import type { Task } from '../lib/types';

interface Props {
  tasks: Task[];
  onClose?: () => void;
}

const useGlass = Platform.OS === 'ios' && typeof isLiquidGlassAvailable === 'function' && isLiquidGlassAvailable();

export function RunningTasksCard({ tasks, onClose }: Props) {
  const { colors, shadows } = useTheme();

  const CardWrapper = useGlass ? GlassView : View;

  const containerStyle = useGlass
    ? styles.glassContainer
    : [styles.container, { backgroundColor: colors.cardBackground }, shadows.lg];

  const formatStartTime = (dateStr?: string) => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Just started';
    if (diff < 3600000) {
      const mins = Math.round(diff / 60000);
      return `${mins}m ago`;
    }
    const hours = Math.round(diff / 3600000);
    return `${hours}h ago`;
  };

  return (
    <CardWrapper style={containerStyle} {...(useGlass && { glassEffectStyle: 'regular' })}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Spinner size={18} color={colors.orange} strokeWidth={2.5} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Running Tasks
          </Text>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.countBadge, { backgroundColor: `${colors.orange}25` }]}>
            <Text style={[styles.countText, { color: colors.orange }]}>
              {tasks.length}
            </Text>
          </View>
          {onClose && (
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                { backgroundColor: colors.surfaceSecondary },
                pressed && { opacity: 0.7 }
              ]}
              hitSlop={8}
            >
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {tasks.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          No tasks currently running
        </Text>
      ) : (
        <ScrollView style={styles.taskList} showsVerticalScrollIndicator={false}>
          {tasks.map((task, index) => (
            <Link key={task.id} href={`/task/${task.id}`} asChild>
              <Pressable
                style={({ pressed }) => [
                  styles.taskItem,
                  { backgroundColor: pressed ? colors.surfaceSecondary : 'transparent' },
                  index < tasks.length - 1 && [styles.taskItemBorder, { borderBottomColor: colors.border }],
                ]}
                onPress={onClose}
              >
                <View style={styles.taskInfo}>
                  <Spinner size={12} color={colors.orange} strokeWidth={2} />
                  <Text style={[styles.taskName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {task.name}
                  </Text>
                </View>
                <Text style={[styles.taskTime, { color: colors.textMuted }]}>
                  {formatStartTime(task.last_run_at)}
                </Text>
              </Pressable>
            </Link>
          ))}
        </ScrollView>
      )}
    </CardWrapper>
  );
}

const styles = StyleSheet.create({
  glassContainer: {
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    maxHeight: 300,
  },
  container: {
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    maxHeight: 300,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  countBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    minWidth: 28,
    alignItems: 'center',
  },
  countText: {
    fontSize: 14,
    fontWeight: '700',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  taskList: {
    flexGrow: 0,
  },
  taskItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xs,
  },
  taskItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  taskInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  taskName: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  taskTime: {
    fontSize: 12,
    marginLeft: spacing.sm,
  },
});
