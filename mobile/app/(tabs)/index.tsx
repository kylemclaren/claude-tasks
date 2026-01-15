import { useState, useMemo } from 'react';
import { View, FlatList, RefreshControl, StyleSheet, Pressable, Text } from 'react-native';
import { useTasks } from '../../hooks/useTasks';
import { useUsage } from '../../hooks/useUsage';
import { TaskCard } from '../../components/TaskCard';
import { UsageBar } from '../../components/UsageBar';
import { SearchFilterBar } from '../../components/SearchFilterBar';
import { useTheme } from '../../lib/ThemeContext';
import { borderRadius } from '../../lib/theme';

export default function TasksScreen() {
  const { data, isLoading, refetch, error } = useTasks();
  const { data: usage } = useUsage();
  const { colors } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTasks = useMemo(() => {
    const tasks = data?.tasks ?? [];
    if (!searchQuery.trim()) return tasks;
    const query = searchQuery.toLowerCase().trim();
    return tasks.filter(task =>
      task.name.toLowerCase().includes(query) ||
      task.cron_expr.toLowerCase().includes(query) ||
      task.prompt?.toLowerCase().includes(query)
    );
  }, [data?.tasks, searchQuery]);

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>Failed to load tasks</Text>
        <Text style={[styles.errorDetail, { color: colors.textSecondary }]}>{error.message}</Text>
        <Pressable
          style={({ pressed }) => [
            styles.retryButton,
            { backgroundColor: colors.orange },
            pressed && { backgroundColor: '#c46648' }
          ]}
          onPress={() => refetch()}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={filteredTasks}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <TaskCard task={item} />}
        ListHeaderComponent={
          <>
            {usage && <UsageBar usage={usage} />}
            <SearchFilterBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search tasks..."
            />
          </>
        }
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.textMuted} />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <View style={styles.emptyIconContainer}>
                <View style={[styles.emptyRing1, { borderColor: colors.surfaceSecondary }]} />
                <View style={[styles.emptyRing2, { borderColor: colors.textMuted }]} />
                <View style={[styles.emptyDot, { backgroundColor: colors.orange }]} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                {searchQuery ? 'No Results' : 'No Tasks'}
              </Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {searchQuery
                  ? `No tasks matching "${searchQuery}"`
                  : 'Create your first task to get started'}
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    paddingBottom: 140,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorDetail: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
  },
  retryText: {
    color: '#faf9f5',
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
    padding: 40,
    marginTop: 40,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyRing1: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
  },
  emptyRing2: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
  },
  emptyDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
  },
});
