import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextInputProps,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Android keyboard resizing is configured by softwareKeyboardLayoutMode in app.json.
// Screen-level KeyboardAvoidingView padding is reserved for iOS.
export const colors = {
  paper: "#f6f5ee",
  card: "#ffffff",
  ink: "#182e27",
  muted: "#61736a",
  green: "#225a43",
  line: "#dce3d9",
  pale: "#e5ecdf",
  error: "#a33131",
};
export const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 22, gap: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: {
    fontFamily: "SourceSerif4_600SemiBold",
    fontSize: 32,
    color: colors.ink,
  },
  heading: {
    fontFamily: "SourceSans3_600SemiBold",
    fontSize: 20,
    color: colors.ink,
  },
  text: {
    fontFamily: "SourceSans3_400Regular",
    fontSize: 17,
    lineHeight: 25,
    color: colors.ink,
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
    letterSpacing: 1.8,
    color: colors.green,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 14,
    minHeight: 52,
    fontFamily: "SourceSans3_400Regular",
    fontSize: 17,
    color: colors.ink,
  },
  card: {
    padding: 18,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 10,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: colors.line,
    gap: 8,
  },
});

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
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: quiet ? colors.pale : colors.green,
        opacity: disabled ? 0.6 : pressed ? 0.75 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: "SourceSans3_600SemiBold",
          fontSize: 16,
          color: quiet ? colors.green : "#fff",
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minWidth: 48,
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Ionicons name={name} size={24} color={colors.green} />
    </Pressable>
  );
}
export function Field(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}
export function ErrorBox({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.card, { borderColor: colors.error }]}
    >
      <Text style={[styles.text, { color: colors.error }]}>{message}</Text>
      {retry && <Button quiet title="Try again" onPress={retry} />}
    </View>
  );
}
export function Loading() {
  return (
    <View style={{ padding: 32 }}>
      <ActivityIndicator accessibilityLabel="Loading" color={colors.green} />
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
