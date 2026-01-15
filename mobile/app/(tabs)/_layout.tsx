import { Tabs, router } from 'expo-router';
import { View, StyleSheet, Platform, Pressable, Text, Animated } from 'react-native';
import { useRef, useEffect } from 'react';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTheme } from '../../lib/ThemeContext';
import { useUsage } from '../../hooks/useUsage';
import { UsageBatteryIndicator } from '../../components/UsageBatteryIndicator';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const useGlass = Platform.OS === 'ios' && typeof isLiquidGlassAvailable === 'function' && isLiquidGlassAvailable();

function TasksIcon({ focused, color }: { focused: boolean; color: string }) {
  return (
    <View style={styles.iconContainer}>
      <View style={styles.taskIcon}>
        <View style={[styles.taskLine, { backgroundColor: color }]} />
        <View style={[styles.taskLine, { backgroundColor: color }]} />
        <View style={[styles.taskLine, styles.taskLineShort, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

function SettingsIcon({ focused, color }: { focused: boolean; color: string }) {
  return (
    <View style={styles.iconContainer}>
      <View style={styles.settingsIcon}>
        <View style={[styles.settingsDot, { backgroundColor: color }]} />
        <View style={[styles.settingsRing, { borderColor: color }]} />
      </View>
    </View>
  );
}

function TasksHeaderRight() {
  const { data: usage } = useUsage();
  if (!usage) return null;
  return <UsageBatteryIndicator usage={usage} />;
}

function FloatingTabBar({ state, descriptors, navigation, colors }: BottomTabBarProps & { colors: any }) {
  const tabs = state.routes.filter(route => route.name !== 'add');

  return (
    <View style={styles.floatingBarContainer}>
      {useGlass ? (
        <GlassView style={styles.floatingBar} glassEffectStyle="regular">
          <FloatingTabBarContent
            tabs={tabs}
            state={state}
            descriptors={descriptors}
            navigation={navigation}
            colors={colors}
          />
        </GlassView>
      ) : (
        <View style={[styles.floatingBar, styles.floatingBarSolid, { backgroundColor: colors.surface }]}>
          <FloatingTabBarContent
            tabs={tabs}
            state={state}
            descriptors={descriptors}
            navigation={navigation}
            colors={colors}
          />
        </View>
      )}

      {/* Center Add Button */}
      <Pressable
        onPress={() => router.push('/task/new')}
        style={({ pressed }) => [
          styles.addButtonWrapper,
          pressed && { transform: [{ scale: 0.92 }] }
        ]}
      >
        <View style={[styles.addButton, { backgroundColor: colors.orange }]}>
          {useGlass && (
            <GlassView style={styles.addButtonGlassOverlay} glassEffectStyle="regular" />
          )}
          {/* Custom + drawn with Views for perfect centering */}
          <View style={styles.plusIcon}>
            <View style={styles.plusHorizontal} />
            <View style={styles.plusVertical} />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

function AnimatedTabItem({ route, isFocused, colors, onPress, label, Icon }: any) {
  const scaleAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const opacityAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: isFocused ? 1 : 0,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }),
      Animated.timing(opacityAnim, {
        toValue: isFocused ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isFocused]);

  const color = isFocused ? colors.orange : colors.textMuted;

  return (
    <Pressable onPress={onPress} style={styles.tabItem}>
      <Animated.View
        style={[
          styles.tabHighlight,
          { backgroundColor: `${colors.orange}25` },
          {
            opacity: opacityAnim,
            transform: [
              {
                scale: scaleAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.8, 1],
                }),
              },
            ],
          },
        ]}
      />
      <Icon focused={isFocused} color={color} />
      <Text style={[styles.tabLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

function FloatingTabBarContent({ tabs, state, descriptors, navigation, colors }: any) {
  return (
    <View style={styles.tabsRow}>
      {tabs.map((route: any, index: number) => {
        const realIndex = state.routes.findIndex((r: any) => r.key === route.key);
        const isFocused = state.index === realIndex;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const label = route.name === 'index' ? 'Tasks' : 'Settings';
        const Icon = route.name === 'index' ? TasksIcon : SettingsIcon;

        return (
          <AnimatedTabItem
            key={route.key}
            route={route}
            isFocused={isFocused}
            colors={colors}
            onPress={onPress}
            label={label}
            Icon={Icon}
          />
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  const { colors, isDark } = useTheme();

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} colors={colors} />}
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: {
          fontWeight: '600',
          color: colors.textPrimary,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tasks',
          headerRight: () => <TasksHeaderRight />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings' }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  floatingBarContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  floatingBar: {
    flexDirection: 'row',
    borderRadius: 28,
    paddingVertical: 8,
    paddingHorizontal: 8,
    minHeight: 56,
    width: '100%',
  },
  floatingBarSolid: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  tabsRow: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 20,
    borderRadius: 20,
    position: 'relative',
  },
  tabHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  iconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskIcon: {
    width: 18,
    height: 14,
    justifyContent: 'space-between',
  },
  taskLine: {
    height: 2.5,
    borderRadius: 1.5,
  },
  taskLineShort: {
    width: '70%',
  },
  settingsIcon: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  settingsRing: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  addButtonWrapper: {
    position: 'absolute',
    top: -24,
    alignSelf: 'center',
  },
  addButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#d97757',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  addButtonGlassOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  plusIcon: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusHorizontal: {
    position: 'absolute',
    width: 28,
    height: 4,
    backgroundColor: '#faf9f5',
    borderRadius: 2,
  },
  plusVertical: {
    position: 'absolute',
    width: 4,
    height: 28,
    backgroundColor: '#faf9f5',
    borderRadius: 2,
  },
});
