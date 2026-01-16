import { View, Text, ScrollView, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTheme } from '../../lib/ThemeContext';
import { getStatusColor, borderRadius, spacing } from '../../lib/theme';
import { MarkdownViewer } from '../../components/MarkdownViewer';
import { useStreamingRun } from '../../hooks/useStreamingRun';
import type { TaskRun } from '../../lib/types';

const useGlass = Platform.OS === 'ios' && typeof isLiquidGlassAvailable === 'function' && isLiquidGlassAvailable();

export default function RunOutputScreen() {
  const params = useLocalSearchParams();
  const { colors, shadows } = useTheme();

  // Extract params with proper typing
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const taskId = typeof params.taskId === 'string' ? parseInt(params.taskId, 10) : 0;
  const taskName = typeof params.taskName === 'string' ? params.taskName : undefined;
  const initialStatus = (typeof params.status === 'string' ? params.status : 'completed') as TaskRun['status'];
  const initialOutput = typeof params.output === 'string' ? params.output : '';
  const initialError = typeof params.error === 'string' ? params.error : undefined;
  const started_at = typeof params.started_at === 'string' ? params.started_at : '';
  const ended_at = typeof params.ended_at === 'string' ? params.ended_at : undefined;
  const duration_ms = typeof params.duration_ms === 'string' ? parseInt(params.duration_ms, 10) : undefined;

  // Use streaming hook for running tasks
  const isRunning = initialStatus === 'running';
  const runId = parseInt(id, 10);
  const streamingResult = useStreamingRun({
    taskId,
    runId,
    enabled: isRunning && taskId > 0 && runId > 0,
  });

  // Use streaming data if available, otherwise use initial params
  const output = isRunning && streamingResult.output ? streamingResult.output : initialOutput;
  const status = isRunning ? streamingResult.status : initialStatus;
  const error = isRunning ? streamingResult.error : initialError;

  // Reconstruct run object from params/streaming
  const run: TaskRun | null = id ? {
    id: runId,
    task_id: taskId,
    status,
    output,
    error,
    started_at,
    ended_at,
    duration_ms,
  } : null;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const CardWrapper = useGlass ? GlassView : View;
  const glassSection = {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    overflow: 'hidden' as const,
  };
  const section = {
    backgroundColor: colors.cardBackground,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    ...shadows.md,
  };
  const sectionStyle = useGlass ? glassSection : section;

  if (!run) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>Run not found</Text>
      </View>
    );
  }

  const statusColor = getStatusColor(run.status, colors);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
    >
      {/* Run metadata header */}
      <CardWrapper style={sectionStyle} {...(useGlass && { glassEffectStyle: 'regular' })}>
        {taskName && (
          <Text style={[styles.taskName, { color: colors.textMuted }]}>{taskName}</Text>
        )}
        <View style={styles.metaRow}>
          <View style={styles.statusContainer}>
            {streamingResult.isStreaming ? (
              <ActivityIndicator size="small" color={statusColor} style={styles.streamingIndicator} />
            ) : (
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            )}
            <Text style={[styles.statusText, { color: statusColor }]}>
              {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
              {streamingResult.isStreaming && ' (streaming...)'}
            </Text>
          </View>
          <Text style={[styles.duration, { color: colors.textSecondary }]}>
            {run.status === 'running' ? 'In progress' : formatDuration(run.duration_ms)}
          </Text>
        </View>
        <Text style={[styles.date, { color: colors.textMuted }]}>
          {formatDate(run.started_at)}
          {run.ended_at && ` → ${formatDate(run.ended_at)}`}
        </Text>
      </CardWrapper>

      {/* Error display if present */}
      {run.error && (
        <CardWrapper
          style={[sectionStyle, !useGlass && { backgroundColor: `${colors.error}10` }]}
          {...(useGlass && { glassEffectStyle: 'regular' })}
        >
          <Text style={[styles.sectionTitle, { color: colors.error }]}>Error</Text>
          <Text style={[styles.errorOutput, { color: colors.error }]}>{run.error}</Text>
        </CardWrapper>
      )}

      {/* Main output with markdown rendering */}
      {run.output && (
        <CardWrapper style={sectionStyle} {...(useGlass && { glassEffectStyle: 'regular' })}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Output</Text>
          <View style={styles.markdownContainer}>
            <MarkdownViewer content={run.output} />
          </View>
        </CardWrapper>
      )}

      {/* Empty state */}
      {!run.output && !run.error && (
        <CardWrapper style={sectionStyle} {...(useGlass && { glassEffectStyle: 'regular' })}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No output recorded for this run
          </Text>
        </CardWrapper>
      )}

      {/* Bottom spacing */}
      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: spacing.xxl,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
  },
  taskName: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  streamingIndicator: {
    marginRight: spacing.sm,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  duration: {
    fontSize: 14,
    fontWeight: '500',
  },
  date: {
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  markdownContainer: {
    flex: 1,
  },
  errorOutput: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
