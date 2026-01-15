import { useMemo } from 'react';
import { StyleSheet, Platform } from 'react-native';
import Markdown, { MarkdownIt } from 'react-native-markdown-display';
import { useTheme } from '../lib/ThemeContext';
import { borderRadius, spacing } from '../lib/theme';

interface MarkdownViewerProps {
  content: string;
}

export function MarkdownViewer({ content }: MarkdownViewerProps) {
  const { colors, isDark } = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    // Text styles
    body: {
      color: colors.textPrimary,
      fontSize: 15,
      lineHeight: 24,
    },
    heading1: {
      color: colors.textPrimary,
      fontSize: 28,
      fontWeight: '700',
      marginTop: spacing.xl,
      marginBottom: spacing.md,
      lineHeight: 36,
    },
    heading2: {
      color: colors.textPrimary,
      fontSize: 24,
      fontWeight: '600',
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      lineHeight: 32,
    },
    heading3: {
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: '600',
      marginTop: spacing.md,
      marginBottom: spacing.sm,
      lineHeight: 28,
    },
    heading4: {
      color: colors.textPrimary,
      fontSize: 17,
      fontWeight: '600',
      marginTop: spacing.md,
      marginBottom: spacing.xs,
      lineHeight: 24,
    },
    heading5: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '600',
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
      lineHeight: 22,
    },
    heading6: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
      lineHeight: 20,
    },
    paragraph: {
      color: colors.textPrimary,
      fontSize: 15,
      lineHeight: 24,
      marginTop: 0,
      marginBottom: spacing.md,
    },
    // Links
    link: {
      color: colors.info,
      textDecorationLine: 'underline' as const,
    },
    // Strong/bold
    strong: {
      fontWeight: '600' as const,
      color: colors.textPrimary,
    },
    // Emphasis/italic
    em: {
      fontStyle: 'italic' as const,
      color: colors.textPrimary,
    },
    // Strikethrough
    s: {
      textDecorationLine: 'line-through' as const,
      color: colors.textSecondary,
    },
    // Code blocks
    code_inline: {
      backgroundColor: colors.surfaceSecondary,
      color: colors.orange,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 13,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: borderRadius.sm / 2,
    },
    code_block: {
      backgroundColor: isDark ? '#1a1a19' : '#f0efea',
      color: colors.textPrimary,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 13,
      lineHeight: 20,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      marginVertical: spacing.sm,
      overflow: 'hidden' as const,
    },
    fence: {
      backgroundColor: isDark ? '#1a1a19' : '#f0efea',
      color: colors.textPrimary,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 13,
      lineHeight: 20,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      marginVertical: spacing.sm,
      overflow: 'hidden' as const,
    },
    // Blockquotes
    blockquote: {
      backgroundColor: colors.surfaceSecondary,
      borderLeftColor: colors.orange,
      borderLeftWidth: 4,
      paddingLeft: spacing.md,
      paddingVertical: spacing.sm,
      marginVertical: spacing.sm,
      borderRadius: borderRadius.sm,
    },
    // Lists
    bullet_list: {
      marginVertical: spacing.sm,
    },
    ordered_list: {
      marginVertical: spacing.sm,
    },
    list_item: {
      flexDirection: 'row' as const,
      marginBottom: spacing.xs,
    },
    bullet_list_icon: {
      color: colors.orange,
      fontSize: 15,
      lineHeight: 24,
      marginRight: spacing.sm,
    },
    bullet_list_content: {
      flex: 1,
    },
    ordered_list_icon: {
      color: colors.orange,
      fontSize: 15,
      lineHeight: 24,
      marginRight: spacing.sm,
      fontWeight: '500' as const,
    },
    ordered_list_content: {
      flex: 1,
    },
    // Horizontal rule
    hr: {
      backgroundColor: colors.border,
      height: 1,
      marginVertical: spacing.lg,
    },
    // Tables
    table: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.sm,
      marginVertical: spacing.sm,
    },
    thead: {
      backgroundColor: colors.surfaceSecondary,
    },
    tbody: {},
    th: {
      padding: spacing.sm,
      borderBottomWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.border,
      fontWeight: '600' as const,
    },
    tr: {
      flexDirection: 'row' as const,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    td: {
      padding: spacing.sm,
      borderRightWidth: 1,
      borderColor: colors.border,
      flex: 1,
    },
    // Images
    image: {
      marginVertical: spacing.sm,
      borderRadius: borderRadius.md,
    },
    // Task lists
    textgroup: {},
    hardbreak: {
      height: spacing.sm,
    },
    softbreak: {},
  }), [colors, isDark]);

  return (
    <Markdown style={styles}>
      {content}
    </Markdown>
  );
}
