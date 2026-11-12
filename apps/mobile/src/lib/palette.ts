export const themePreferenceValues = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof themePreferenceValues)[number];

import { StyleSheet } from "react-native";

// Atlas design system. Values mirror the tokens at the top of src/app/globals.css.
export type Palette = {
  background: string;
  surface: string;
  surfaceElevated: string;
  sidebar: string;
  input: string;
  text: string;
  muted: string;
  faint: string;
  textOnAccent: string;
  accent: string;
  action: string;
  actionPressed: string;
  accentHover: string;
  accentSoft: string;
  border: string;
  borderSubtle: string;
  borderStrong: string;
  selected: string;
  success: string;
  successSoft: string;
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

// Geist for UI, Literata for titles and reading, Geist Mono for codes and metadata.
export const fonts = {
  ui: "Geist_400Regular",
  uiMedium: "Geist_500Medium",
  uiSemiBold: "Geist_600SemiBold",
  title: "Literata_600SemiBold",
  titleBold: "Literata_700Bold",
  reading: "Literata_400Regular",
  mono: "GeistMono_400Regular",
} as const;

export const lightPalette: Palette = {
  background: "#FBFBFC",
  surface: "#FFFFFF",
  surfaceElevated: "#F3F4F6",
  sidebar: "#F3F4F6",
  input: "#FFFFFF",
  text: "#15171C",
  muted: "#40444D",
  faint: "#575C66",
  textOnAccent: "#FFFFFF",
  accent: "#2453C6",
  action: "#2453C6",
  actionPressed: "#1C409C",
  accentHover: "#1C409C",
  accentSoft: "#E9EFFC",
  border: "#E3E5E8",
  borderSubtle: "#E9EBEE",
  borderStrong: "#CDD1D8",
  selected: "#FFFFFF",
  success: "#276F21",
  successSoft: "#F0F7EE",
  error: "#B42318",
  errorSoft: "#FEF2F2",
  markdown: {
    heading1: "#15171C",
    heading2: "#15171C",
    heading3: "#15171C",
    link: "#2453C6",
    quoteText: "#40444D",
    quoteBorder: "transparent",
    quoteBackground: "#F3F4F6",
    codeText: "#15171C",
    codeBackground: "#F0F1F4",
    codeBorder: "#E3E5E8",
  },
};
export const darkPalette: Palette = {
  background: "#111214",
  surface: "#16171A",
  surfaceElevated: "#1C1D21",
  sidebar: "#0E0F11",
  input: "#18191C",
  text: "#ECECEE",
  muted: "#C9CACF",
  faint: "#A3A5AC",
  // dark mode keeps primary buttons ink so the accent stays sparse
  textOnAccent: "#111214",
  accent: "#8EAEF6",
  action: "#ECECEE",
  actionPressed: "#FFFFFF",
  accentHover: "#B9CCF9",
  accentSoft: "#24262B",
  border: "#2A2C31",
  borderSubtle: "#222328",
  borderStrong: "#3A3D43",
  selected: "#24262B",
  success: "#8DBF84",
  successSoft: "rgba(141, 191, 132, 0.12)",
  error: "#F08A7E",
  errorSoft: "rgba(240, 138, 126, 0.12)",
  markdown: {
    heading1: "#ECECEE",
    heading2: "#ECECEE",
    heading3: "#ECECEE",
    link: "#8EAEF6",
    quoteText: "#C9CACF",
    quoteBorder: "transparent",
    quoteBackground: "#1C1D21",
    codeText: "#ECECEE",
    codeBackground: "#24262B",
    codeBorder: "#2A2C31",
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
    content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32, gap: 16 },
    row: { flexDirection: "row", alignItems: "center", gap: 12 },
    title: {
      fontFamily: fonts.title,
      fontSize: 30,
      lineHeight: 38,
      letterSpacing: -0.4,
      color: colors.text,
    },
    heading: {
      fontFamily: fonts.title,
      fontSize: 20,
      lineHeight: 26,
      color: colors.text,
    },
    text: {
      fontFamily: fonts.ui,
      fontSize: 17,
      lineHeight: 26,
      color: colors.text,
    },
    muted: {
      fontFamily: fonts.ui,
      fontSize: 15,
      lineHeight: 22,
      color: colors.muted,
    },
    // section label: quiet faint caption, never accent uppercase
    label: {
      fontFamily: fonts.uiMedium,
      fontSize: 12,
      lineHeight: 16,
      color: colors.faint,
    },
    mono: {
      fontFamily: fonts.mono,
      fontSize: 13,
      lineHeight: 18,
      color: colors.faint,
    },
    input: {
      backgroundColor: colors.input,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 14,
      minHeight: 52,
      fontFamily: fonts.ui,
      fontSize: 17,
      color: colors.text,
    },
    card: {
      padding: 18,
      backgroundColor: colors.surface,
      borderRadius: 14,
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
      minHeight: 56,
      borderBottomWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: 8,
    },
  });
}
export type UiStyles = ReturnType<typeof createStyles>;
