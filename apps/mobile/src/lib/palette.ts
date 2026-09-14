export const themePreferenceValues = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof themePreferenceValues)[number];

import { StyleSheet } from "react-native";

export type Palette = {
  background: string;
  surface: string;
  surfaceElevated: string;
  input: string;
  text: string;
  muted: string;
  faint: string;
  textOnAccent: string;
  accent: string;
  action: string;
  accentHover: string;
  accentSoft: string;
  border: string;
  borderSubtle: string;
  selected: string;
  error: string;
  errorSoft: string;
  markdown: {
    heading1: string;
    heading2: string;
    heading3: string;
    link: string;
    quoteText: string;
    quoteBorder: string;
    quoteBackground: string;
    codeText: string;
    codeBackground: string;
    codeBorder: string;
  };
};

export const lightPalette: Palette = {
  background: "#f8fafc",
  surface: "#ffffff",
  surfaceElevated: "#f1f5f9",
  input: "#ffffff",
  text: "#0f172a",
  muted: "#334155",
  faint: "#475569",
  textOnAccent: "#ffffff",
  accent: "#4f46e5",
  action: "#4f46e5",
  accentHover: "#4338ca",
  accentSoft: "rgba(79, 70, 229, 0.12)",
  border: "rgba(0, 0, 0, 0.12)",
  borderSubtle: "rgba(0, 0, 0, 0.06)",
  selected: "rgba(79, 70, 229, 0.12)",
  error: "#dc2626",
  errorSoft: "#fef2f2",
  markdown: {
    heading1: "#4338ca",
    heading2: "#1d4ed8",
    heading3: "#0f766e",
    link: "#4f46e5",
    quoteText: "#334155",
    quoteBorder: "rgba(79, 70, 229, 0.5)",
    quoteBackground: "rgba(79, 70, 229, 0.055)",
    codeText: "#9a3412",
    codeBackground: "#f1f5f9",
    codeBorder: "rgba(15, 23, 42, 0.1)",
  },
};
export const darkPalette: Palette = {
  background: "#0f172a",
  surface: "#1e293b",
  surfaceElevated: "#334155",
  input: "rgba(255, 255, 255, 0.05)",
  text: "#f1f5f9",
  muted: "#cbd5e1",
  faint: "#94a3b8",
  textOnAccent: "#ffffff",
  accent: "#818cf8",
  action: "#4f46e5",
  accentHover: "#a5b4fc",
  accentSoft: "rgba(99, 102, 241, 0.18)",
  border: "rgba(255, 255, 255, 0.1)",
  borderSubtle: "rgba(255, 255, 255, 0.05)",
  selected: "rgba(99, 102, 241, 0.18)",
  error: "#f87171",
  errorSoft: "rgba(248, 113, 113, 0.12)",
  markdown: {
    heading1: "#c4b5fd",
    heading2: "#93c5fd",
    heading3: "#5eead4",
    link: "#818cf8",
    quoteText: "#cbd5e1",
    quoteBorder: "rgba(99, 102, 241, 0.72)",
    quoteBackground: "rgba(99, 102, 241, 0.07)",
    codeText: "#fbbf24",
    codeBackground: "rgba(15, 23, 42, 0.72)",
    codeBorder: "rgba(255, 255, 255, 0.08)",
  },
};

export function createStyles(colors: Palette) {
  return StyleSheet.create({
    actions: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 12,
    },
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: 22, gap: 16 },
    row: { flexDirection: "row", alignItems: "center", gap: 12 },
    title: {
      fontFamily: "SourceSerif4_600SemiBold",
      fontSize: 32,
      lineHeight: 38,
      color: colors.text,
    },
    heading: {
      fontFamily: "SourceSans3_600SemiBold",
      fontSize: 20,
      lineHeight: 26,
      color: colors.text,
    },
    text: {
      fontFamily: "SourceSans3_400Regular",
      fontSize: 17,
      lineHeight: 26,
      color: colors.text,
    },
    muted: {
      fontFamily: "SourceSans3_400Regular",
      fontSize: 15,
      lineHeight: 22,
      color: colors.muted,
    },
    label: {
      fontFamily: "SourceSans3_600SemiBold",
      fontSize: 12,
      lineHeight: 16,
      letterSpacing: 1.4,
      color: colors.accent,
    },
    input: {
      backgroundColor: colors.input,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 14,
      minHeight: 52,
      fontFamily: "SourceSans3_400Regular",
      fontSize: 17,
      color: colors.text,
    },
    card: {
      padding: 18,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10,
    },
    bar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: 8,
    },
  });
}
export type UiStyles = ReturnType<typeof createStyles>;
