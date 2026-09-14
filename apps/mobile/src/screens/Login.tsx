import { AppUpdateLink } from "../components/AppUpdates";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { origin, signIn } from "../lib/api";
import {
  getOAuthProviders,
  resumeOAuth,
  signInWithProvider,
} from "../lib/oauth";
import type { OAuthProvider } from "../lib/oauth-contracts";
import type { User } from "../lib/contracts";
import { useTheme } from "../lib/theme";
import { Button, ErrorBox, Field, message } from "../ui";

export function Login({
  onLogin,
  notice,
}: {
  onLogin: (user: User) => void;
  notice: string;
}) {
  const { colors, styles, isDark } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [providerError, setProviderError] = useState("");
  const [providersLoading, setProvidersLoading] = useState(true);
  const mounted = useRef(true);
  const onLoginRef = useRef(onLogin);
  onLoginRef.current = onLogin;
  const loadProviders = useCallback(async () => {
    setProvidersLoading(true);
    setProviderError("");
    try {
      const available = await getOAuthProviders();
      if (mounted.current) setProviders(available);
    } catch {
      if (mounted.current)
        setProviderError(
          "Could not load Google and GitHub sign-in. Check your connection and retry.",
        );
    } finally {
      if (mounted.current) setProvidersLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void loadProviders();
    setBusy(true);
    void resumeOAuth()
      .then((user) => {
        if (user && mounted.current) onLoginRef.current(user);
      })
      .catch((error: unknown) => {
        if (mounted.current) setError(message(error));
      })
      .finally(() => {
        if (mounted.current) setBusy(false);
      });
    return () => {
      mounted.current = false;
    };
  }, [loadProviders]);
  const submit = async (provider?: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const user = provider
        ? await signInWithProvider(provider)
        : await signIn(email, password);
      if (user && mounted.current) {
        setPassword("");
        onLogin(user);
      }
    } catch (error) {
      if (mounted.current) setError(message(error));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const open = (path: string) => {
    void Linking.openURL(`${origin}${path}`).catch((error: unknown) =>
      setError(message(error)),
    );
  };
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { flexGrow: 1, justifyContent: "center", gap: 24 },
        ]}
      >
        <View style={[styles.row, { justifyContent: "center" }]}>
          <Image
            source={
              isDark
                ? require("../../assets/brand-dark.png")
                : require("../../assets/brand-light.png")
            }
            style={{ width: 44, height: 44 }}
            accessible={false}
          />
          <Text style={styles.heading}>OghmaNotes</Text>
        </View>
        <Text
          accessibilityRole="header"
          style={[styles.title, { textAlign: "center" }]}
        >
          Sign in to your account
        </Text>
        {notice ? (
          <Text accessibilityLiveRegion="polite" style={styles.muted}>
            {notice}
          </Text>
        ) : null}
        <View style={styles.card}>
          <Text style={styles.text}>Email address</Text>
          <Field
            accessibilityLabel="Email address"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            editable={!busy}
          />
          <Text style={styles.text}>Password</Text>
          <Field
            accessibilityLabel="Password"
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            editable={!busy}
            onSubmitEditing={() => void submit()}
          />
          <Pressable
            accessibilityRole="link"
            onPress={() => open("/forgot-password")}
            style={{
              minHeight: 48,
              justifyContent: "center",
              alignSelf: "flex-end",
            }}
          >
            <Text style={[styles.muted, { color: colors.accent }]}>
              Forgot password?
            </Text>
          </Pressable>
          {error ? <ErrorBox message={error} /> : null}
          <Button
            title={busy ? "Signing in…" : "Sign in"}
            disabled={busy || !email.trim() || !password}
            onPress={() => void submit()}
          />
          <Text
            style={[styles.muted, { textAlign: "center", marginVertical: 8 }]}
          >
            Or continue with
          </Text>
          {providersLoading ? (
            <Text style={styles.muted}>Loading sign-in options…</Text>
          ) : null}
          {providerError ? (
            <ErrorBox
              message={providerError}
              retry={() => void loadProviders()}
            />
          ) : null}
          {providers.map((provider) => (
            <Pressable
              key={provider.id}
              accessibilityRole="button"
              accessibilityLabel={`Continue with ${provider.name}`}
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => void submit(provider.id)}
              style={({ pressed }) => ({
                minHeight: 52,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 6,
                padding: 12,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                backgroundColor: colors.surface,
                opacity: busy ? 0.5 : pressed ? 0.7 : 1,
              })}
            >
              <Ionicons
                name={
                  provider.id === "google"
                    ? "logo-google"
                    : provider.id === "github"
                      ? "logo-github"
                      : "log-in-outline"
                }
                size={22}
                color={colors.text}
              />
              <Text
                style={[styles.text, { fontFamily: "SourceSans3_600SemiBold" }]}
              >
                {provider.name}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="link"
          onPress={() => open("/register")}
          style={{ minHeight: 48, justifyContent: "center" }}
        >
          <Text style={[styles.muted, { textAlign: "center" }]}>
            Don’t have an account?{" "}
            <Text style={{ color: colors.accent }}>Create one</Text>
          </Text>
        </Pressable>
        <AppUpdateLink />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
