import { View, TextInput, StyleSheet, Platform, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTheme } from '../lib/ThemeContext';
import { borderRadius, spacing } from '../lib/theme';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

const useGlass = Platform.OS === 'ios' && typeof isLiquidGlassAvailable === 'function' && isLiquidGlassAvailable();

export function SearchFilterBar({ value, onChangeText, placeholder = 'Search tasks...' }: Props) {
  const { colors, shadows } = useTheme();

  const SearchWrapper = useGlass ? GlassView : View;

  const wrapperStyle = useGlass
    ? styles.glassContainer
    : [styles.container, { backgroundColor: colors.cardBackground }, shadows.sm];

  return (
    <View style={styles.outer}>
      <SearchWrapper style={wrapperStyle} {...(useGlass && { glassEffectStyle: 'regular' })}>
        <Ionicons name="search" size={20} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={[
            styles.input,
            { color: colors.textPrimary },
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        {value.length > 0 && Platform.OS !== 'ios' && (
          <Pressable
            onPress={() => onChangeText('')}
            style={({ pressed }) => [
              styles.clearButton,
              { backgroundColor: colors.surfaceSecondary },
              pressed && { opacity: 0.7 }
            ]}
            hitSlop={8}
          >
            <Ionicons name="close" size={14} color={colors.textMuted} />
          </Pressable>
        )}
      </SearchWrapper>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  glassContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    height: 44,
    overflow: 'hidden',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: '100%',
    paddingVertical: 0,
  },
  clearButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
});
