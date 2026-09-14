import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  BackHandler,
  Keyboard,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useFonts,
  SourceSans3_400Regular,
  SourceSans3_600SemiBold,
} from "@expo-google-fonts/source-sans-3";
import { SourceSerif4_600SemiBold } from "@expo-google-fonts/source-serif-4";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, Paths } from "expo-file-system";
import {
  clearSession,
  onSessionExpired,
  origin,
  restoreSession,
} from "./src/lib/api";
import { ThemeProvider, useTheme } from "./src/lib/theme";
import { Login } from "./src/screens/Login";
import * as SystemUI from "expo-system-ui";
import {
  AppUpdateCard,
  UpdateBanner,
  UpdatesProvider,
} from "./src/components/AppUpdates";
import type { Note, TreeItem, User } from "./src/lib/contracts";
import { Library } from "./src/screens/Library";
import { Editor, draftPrefix } from "./src/screens/Editor";
import { Chat } from "./src/screens/Chat";
import { Button, ErrorBox, IconButton, Loading, message } from "./src/ui";

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    SourceSans3_400Regular,
    SourceSans3_600SemiBold,
    SourceSerif4_600SemiBold,
  });
  return (
    <ThemeProvider>
      <AppShell ready={!!(fontsLoaded || fontError)} />
    </ThemeProvider>
  );
}

function AppShell({ ready }: { ready: boolean }) {
  const { styles, colors, isDark } = useTheme();
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);
  return (
    <SafeAreaProvider>
      <UpdatesProvider>
        <SafeAreaView style={styles.screen}>
          <StatusBar style={isDark ? "light" : "dark"} />
          {ready ? <Workspace /> : <Loading />}
          {ready && <UpdateBanner />}
        </SafeAreaView>
      </UpdatesProvider>
    </SafeAreaProvider>
  );
}

function Workspace() {
  const {
    colors,
    styles,
    preference,
    setPreference,
    setAccountId,
    syncError,
    syncing,
    saving,
  } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    setAccountId(user?.user_id ?? null);
  }, [user?.user_id, setAccountId]);
  const [checking, setChecking] = useState(true);
  const [startupError, setStartupError] = useState("");
  const [tab, setTab] = useState<"notes" | "chat" | "account">("notes");
  const [folders, setFolders] = useState<TreeItem[]>([]);
  const [note, setNote] = useState<
    (TreeItem & { initialEditing?: boolean }) | null
  >(null);
  const [scope, setScope] = useState<Note>();
  const [chatKey, setChatKey] = useState(0);
  const [notice, setNotice] = useState("");
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const restore = useCallback(async () => {
    setChecking(true);
    setStartupError("");
    try {
      setUser(await restoreSession());
    } catch (e) {
      setStartupError(message(e));
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    void restore();
  }, [restore]);
  useEffect(
    () =>
      onSessionExpired(() => {
        // Expiry returns to login but preserves account-scoped unsynced drafts.
        setNotice(
          "Your session ended. Sign in again. Unsynced drafts are still on this phone.",
        );
        setUser(null);
        setNote(null);
        setFolders([]);
        setTab("notes");
        setScope(undefined);
      }),
    [],
  );
  useEffect(() => {
    if (note || tab === "chat") return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (tab !== "notes") {
          setTab("notes");
          return true;
        }
        if (folders.length) {
          setFolders((current) => current.slice(0, -1));
          return true;
        }
        return false;
      },
    );
    return () => subscription.remove();
  }, [folders.length, tab, note]);
  const clearScope = useCallback(() => setScope(undefined), []);
  const logout = async () => {
    try {
      await clearSession();
      const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
        key.startsWith(`${draftPrefix}${user?.user_id}.`),
      );
      await AsyncStorage.multiRemove(keys);
      if (user) {
        const files = new Directory(
          Paths.cache,
          "oghma-materials",
          user.user_id,
        );
        if (files.exists) files.delete();
      }
      setUser(null);
      setNote(null);
      setFolders([]);
      setTab("notes");
      setScope(undefined);
    } catch (e) {
      Alert.alert("Could not finish signing out", message(e));
    }
  };
  if (checking) return <Loading />;
  if (startupError)
    return (
      <View style={styles.content}>
        <Text style={styles.title}>Welcome back</Text>
        <ErrorBox message={startupError} retry={() => void restore()} />
        <Button
          quiet
          title="Sign in again"
          onPress={() => {
            setStartupError("");
            setUser(null);
          }}
        />
      </View>
    );
  if (!user)
    return (
      <Login
        notice={notice}
        onLogin={(nextUser) => {
          setUser(nextUser);
          setNotice("");
        }}
      />
    );
  if (note)
    return (
      <Editor
        key={note.id}
        id={note.id}
        initialEditing={note.initialEditing}
        userId={user.user_id}
        onBack={() => setNote(null)}
        onChat={(selected) => {
          setScope(selected);
          setChatKey((value) => value + 1);
          setNote(null);
          setTab("chat");
        }}
      />
    );
  return (
    <View style={styles.screen}>
      <View style={{ flex: 1 }}>
        {tab === "notes" ? (
          <>
            <View style={styles.bar}>
              {folders.length ? (
                <IconButton
                  name="arrow-back"
                  label="Parent folder"
                  onPress={() => setFolders((current) => current.slice(0, -1))}
                />
              ) : (
                <Text style={styles.heading}>OghmaNotes</Text>
              )}
              <Text style={styles.label}>ANDROID ALPHA</Text>
            </View>
            <Library
              key={folders.at(-1)?.id || "root"}
              parent={folders.at(-1)}
              onOpen={(item, initialEditing = false) =>
                item.isFolder
                  ? setFolders((current) => [...current, item])
                  : setNote({ ...item, initialEditing })
              }
            />
          </>
        ) : null}
        {tab === "chat" ? (
          <Chat
            key={chatKey}
            scope={scope}
            clearScope={clearScope}
            onExit={() => setTab("notes")}
          />
        ) : null}
        {tab === "account" ? (
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.label}>YOUR WORKSPACE</Text>
            <Text accessibilityRole="header" style={styles.title}>
              Account
            </Text>
            <View style={styles.card}>
              <Text style={styles.heading}>
                {user.displayName || "Welcome back"}
              </Text>
              <Text selectable style={styles.text}>
                {user.email}
              </Text>
              <Text style={styles.muted}>{new URL(origin).hostname}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.heading}>Appearance</Text>
              <Text style={styles.muted}>
                Uses the same theme preference as the website.
              </Text>
              <View style={styles.actions}>
                {(["system", "light", "dark"] as const).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{
                      checked: preference === value,
                      disabled: saving,
                    }}
                    disabled={saving}
                    onPress={() => void setPreference(value)}
                    style={{
                      minHeight: 48,
                      borderRadius: 6,
                      padding: 12,
                      backgroundColor:
                        preference === value
                          ? colors.accentSoft
                          : colors.surfaceElevated,
                      borderWidth: 1,
                      borderColor:
                        preference === value
                          ? colors.accent
                          : colors.borderSubtle,
                    }}
                  >
                    <Text
                      style={[
                        styles.text,
                        {
                          color:
                            preference === value ? colors.accent : colors.text,
                        },
                      ]}
                    >
                      {value === "system"
                        ? "System"
                        : value === "light"
                          ? "Light"
                          : "Dark"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {syncing || saving ? (
                <Text style={styles.muted}>Syncing appearance…</Text>
              ) : null}
              {syncError ? <ErrorBox message={syncError} /> : null}
            </View>
            <AppUpdateCard />
            <Text style={styles.text}>
              Notes and chat use the same account as the website. This first
              version supports Markdown editing and opens files through Android.
              Calendar, quizzes and rich editing are still on the website.
            </Text>
            <Button
              quiet
              title="Open website"
              onPress={() => {
                void Linking.openURL(origin).catch((e) =>
                  Alert.alert("Could not open website", message(e)),
                );
              }}
            />
            <Button
              title="Sign out"
              onPress={() =>
                Alert.alert(
                  "Sign out?",
                  "Unsynced drafts on this phone will be removed. Your saved notes stay in your account.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Sign out",
                      style: "destructive",
                      onPress: () => void logout(),
                    },
                  ],
                )
              }
            />
          </ScrollView>
        ) : null}
      </View>
      <View
        accessibilityRole="tablist"
        style={{
          display: keyboardVisible ? "none" : "flex",
          flexDirection: "row",
          borderTopWidth: 1,
          borderColor: colors.borderSubtle,
          backgroundColor: colors.surface,
        }}
      >
        {(
          [
            { id: "notes", label: "Notes", icon: "documents-outline" },
            { id: "chat", label: "Chat", icon: "chatbubble-ellipses-outline" },
            { id: "account", label: "Account", icon: "person-circle-outline" },
          ] as const
        ).map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === item.id }}
            onPress={() => setTab(item.id)}
            style={{
              flex: 1,
              minHeight: 68,
              justifyContent: "center",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Ionicons
              name={item.icon}
              size={24}
              color={tab === item.id ? colors.accent : colors.muted}
            />
            <Text
              style={[
                styles.muted,
                {
                  color: tab === item.id ? colors.accent : colors.muted,
                  fontFamily: "SourceSans3_600SemiBold",
                },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
