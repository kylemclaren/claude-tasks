import { View, Text, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTheme } from '../lib/ThemeContext';
import { borderRadius } from '../lib/theme';
import type { Usage } from '../lib/types';

interface Props {
  usage: Usage;
}

const useGlass = Platform.OS === 'ios' && typeof isLiquidGlassAvailable === 'function' && isLiquidGlassAvailable();

export function UsageBar({ usage }: Props) {
  const { colors, shadows } = useTheme();

  const maxUtilization = Math.max(
    usage.five_hour.utilization,
    usage.seven_day.utilization
  );

  // Get gradient end color based on percentage (green -> yellow -> red)
  const getGradientEndColor = (pct: number) => {
    const t = pct / 100;
    const r = Math.round(255 * t);
    const g = Math.round(255 * (1 - t));
    return `rgb(${r}, ${g}, 0)`;
  };

  const getTextColor = (value: number) => {
    if (value >= 80) return colors.error;
    if (value >= 60) return colors.orange;
    return colors.success;
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

  const CardWrapper = useGlass ? GlassView : View;
  const textColor = getTextColor(maxUtilization);
  const gradientEndColor = getGradientEndColor(maxUtilization);

  const containerStyle = useGlass
    ? styles.glassContainer
    : [styles.container, { backgroundColor: colors.cardBackground }, shadows.md];

  return (
    <CardWrapper style={containerStyle} {...(useGlass && { glassEffectStyle: 'regular' })}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textSecondary }]}>API Usage</Text>
        <Text style={[styles.percentage, { color: textColor }]}>
          {Math.round(maxUtilization)}%
        </Text>
      </View>

      <View style={[styles.barContainer, { backgroundColor: colors.surfaceSecondary }]}>
        <LinearGradient
          colors={['#00ff00', gradientEndColor]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.bar,
            { width: `${Math.min(maxUtilization, 100)}%` },
          ]}
        />
      </View>

      <View style={styles.details}>
        <Text style={[styles.detail, { color: colors.textMuted }]}>
          5h: {Math.round(usage.five_hour.utilization)}% (resets in {formatResetTime(usage.five_hour.resets_at)})
        </Text>
        <Text style={[styles.detail, { color: colors.textMuted }]}>
          7d: {Math.round(usage.seven_day.utilization)}%
        </Text>
      </View>
    </CardWrapper>
  );
}

const styles = StyleSheet.create({
  glassContainer: {
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  container: {
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: borderRadius.lg,
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
  },
  percentage: {
    fontSize: 16,
    fontWeight: '700',
  },
  barContainer: {
    height: 8,
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
  },
});
