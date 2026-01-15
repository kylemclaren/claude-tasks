import { View, FlatList, RefreshControl, StyleSheet, Pressable, Text, Platform, ImageBackground } from 'react-native';
import { Link } from 'expo-router';
import { GlassContainer, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { useTasks } from '../../hooks/useTasks';
import { useUsage } from '../../hooks/useUsage';
import { TaskCard } from '../../components/TaskCard';
import { UsageBar } from '../../components/UsageBar';

const useGlass = Platform.OS === 'ios' && isGlassEffectAPIAvailable();

export default function TasksScreen() {
  const { data, isLoading, refetch, error } = useTasks();
  const { data: usage } = useUsage();

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load tasks</Text>
        <Text style={styles.errorDetail}>{error.message}</Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const ListWrapper = useGlass ? GlassContainer : View;

  const listContent = (
    <FlatList
      data={data?.tasks ?? []}
      keyExtractor={(item) => item.id.toString()}
      renderItem={({ item }) => <TaskCard task={item} />}
      ListHeaderComponent={usage ? <UsageBar usage={usage} /> : null}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#6b7280" />
      }
      ListEmptyComponent={
        !isLoading ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>&#128203;</Text>
            <Text style={styles.emptyTitle}>No Tasks</Text>
            <Text style={styles.emptyText}>Create your first task to get started</Text>
          </View>
        ) : null
      }
      contentContainerStyle={styles.list}
    />
  );

  return (
    <View style={styles.container}>
      {useGlass ? (
        <ListWrapper style={styles.glassWrapper} spacing={20}>
          {listContent}
        </ListWrapper>
      ) : (
        listContent
      )}

      <Link href="/task/new" asChild>
        <Pressable style={styles.fab}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e8e4df',
  },
  glassWrapper: {
    flex: 1,
  },
  list: {
    paddingBottom: 100,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#e8e4df',
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ef4444',
    marginBottom: 8,
  },
  errorDetail: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
    padding: 40,
    marginTop: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  fabText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '300',
    marginTop: -2,
  },
});
