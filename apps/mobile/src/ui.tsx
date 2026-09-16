import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "./lib/theme";

export function Button({
  title,
  onPress,
  disabled,
  quiet = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  quiet?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        minHeight: 48,
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: disabled
          ? colors.surfaceElevated
          : pressed
            ? quiet
              ? colors.selected
              : colors.actionPressed
            : quiet
              ? colors.accentSoft
              : colors.action,
        borderWidth: quiet ? 1 : 0,
        borderColor: quiet ? colors.border : "transparent",
        opacity: disabled ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: "SourceSans3_600SemiBold",
          fontSize: 16,
          lineHeight: 22,
          textAlign: "center",
          color: disabled ? colors.muted : quiet ? colors.accent : colors.textOnAccent,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function IconButton({
  name,
  label,
  onPress,
  disabled = false,
}: {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        minWidth: 48,
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 24,
        backgroundColor: pressed && !disabled ? colors.accentSoft : "transparent",
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Ionicons name={name} size={24} color={colors.accent} />
    </Pressable>
  );
}
export function Field(props: TextInputProps) {
  const { colors, styles } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.faint}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}
export function ErrorBox({
  message: errorMessage,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  const { colors, styles } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.card,
        { borderColor: colors.error, backgroundColor: colors.errorSoft },
      ]}
    >
      <Text style={[styles.text, { color: colors.error }]}>{errorMessage}</Text>
      {retry && <Button quiet title="Try again" onPress={retry} />}
    </View>
  );
}
export function Loading() {
  const { colors, styles } = useTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading" style={{ alignItems: "center", gap: 12, padding: 32 }}>
      <ActivityIndicator accessibilityLabel="Loading" color={colors.accent} />
      <Text style={styles.muted}>Loading OghmaNotes</Text>
    </View>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { styles } = useTheme();
  return (
    <View style={[styles.card, { marginTop: 20 }]}>
      <Text style={styles.heading}>{title}</Text>
      <Text style={styles.muted}>{children}</Text>
    </View>
  );
}
export function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
