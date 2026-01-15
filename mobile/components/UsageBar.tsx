import { View, Text, StyleSheet } from 'react-native';
import type { Usage } from '../lib/types';

interface Props {
  usage: Usage;
}

export function UsageBar({ usage }: Props) {
  const maxUtilization = Math.max(
    usage.five_hour.utilization,
    usage.seven_day.utilization
  );

  const getColor = (value: number) => {
    if (value >= 80) return '#ef4444';
    if (value >= 60) return '#f59e0b';
    return '#22c55e';
  };

  const formatResetTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date.getTime() - now.getTime();

    if (diff < 0) return 'now';

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);

    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>API Usage</Text>
        <Text style={[styles.percentage, { color: getColor(maxUtilization) }]}>
          {Math.round(maxUtilization)}%
        </Text>
      </View>

      <View style={styles.barContainer}>
        <View
          style={[
            styles.bar,
            {
              width: `${Math.min(maxUtilization, 100)}%`,
              backgroundColor: getColor(maxUtilization),
            },
          ]}
        />
      </View>

      <View style={styles.details}>
        <Text style={styles.detail}>
          5h: {Math.round(usage.five_hour.utilization)}% (resets in {formatResetTime(usage.five_hour.resets_at)})
        </Text>
        <Text style={styles.detail}>
          7d: {Math.round(usage.seven_day.utilization)}%
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  percentage: {
    fontSize: 16,
    fontWeight: '700',
  },
  barContainer: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  bar: {
    height: '100%',
    borderRadius: 4,
  },
  details: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detail: {
    fontSize: 11,
    color: '#9ca3af',
  },
});
