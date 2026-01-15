import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTheme } from '../lib/ThemeContext';
import { borderRadius, spacing } from '../lib/theme';
import type { Usage } from '../lib/types';

interface Props {
  usage: Usage;
  onClose?: () => void;
}

const useGlass = Platform.OS === 'ios' && typeof isLiquidGlassAvailable === 'function' && isLiquidGlassAvailable();

export function UsageCard({ usage, onClose }: Props) {
  const { colors, shadows } = useTheme();

  const maxUtilization = Math.max(
    usage.five_hour.utilization,
    usage.seven_day.utilization
  );

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
    : [styles.container, { backgroundColor: colors.cardBackground }, shadows.lg];

  return (
    <CardWrapper style={containerStyle} {...(useGlass && { glassEffectStyle: 'regular' })}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>API Usage</Text>
        <View style={styles.headerRight}>
          <Text style={[styles.percentage, { color: textColor }]}>
            {Math.round(maxUtilization)}%
          </Text>
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
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>5-hour limit</Text>
          <Text style={[styles.detailValue, { color: getTextColor(usage.five_hour.utilization) }]}>
            {Math.round(usage.five_hour.utilization)}%
          </Text>
        </View>
        <Text style={[styles.resetText, { color: colors.textMuted }]}>
          Resets in {formatResetTime(usage.five_hour.resets_at)}
        </Text>

        <View style={[styles.detailRow, { marginTop: spacing.sm }]}>
          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>7-day limit</Text>
          <Text style={[styles.detailValue, { color: getTextColor(usage.seven_day.utilization) }]}>
            {Math.round(usage.seven_day.utilization)}%
          </Text>
        </View>
      </View>
    </CardWrapper>
  );
}

const styles = StyleSheet.create({
  glassContainer: {
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  container: {
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
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
  percentage: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  barContainer: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  bar: {
    height: '100%',
    borderRadius: 5,
  },
  details: {
    gap: spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  resetText: {
    fontSize: 12,
  },
});
