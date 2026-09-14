import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
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
  signIn,
} from "./src/lib/api";
import appConfig from "./app.json";
import type { Note, TreeItem, User } from "./src/lib/contracts";
import { Library } from "./src/screens/Library";
import { Editor, draftPrefix } from "./src/screens/Editor";
import { Chat } from "./src/screens/Chat";
import {
  Button,
  colors,
  ErrorBox,
  Field,
  IconButton,
  Loading,
  message,
  styles,
} from "./src/ui";

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    SourceSans3_400Regular,
    SourceSans3_600SemiBold,
    SourceSerif4_600SemiBold,
  });
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        {fontsLoaded || fontError ? <Workspace /> : <Loading />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Workspace() {
  const [user, setUser] = useState<User | null>(null);
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
            <Text style={styles.heading}>
              Android alpha · {appConfig.expo.version}
            </Text>
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
              quiet
              title="Download the latest version"
              onPress={() => {
                void Linking.openURL(`${origin}/downloads`).catch((e) =>
                  Alert.alert("Could not open downloads", message(e)),
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
          borderColor: colors.line,
          backgroundColor: colors.card,
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
              color={tab === item.id ? colors.green : colors.muted}
            />
            <Text
              style={[
                styles.muted,
                {
                  color: tab === item.id ? colors.green : colors.muted,
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

function Login({
  onLogin,
  notice,
}: {
  onLogin: (user: User) => void;
  notice: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const user = await signIn(email, password);
      setPassword("");
      onLogin(user);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
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
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            backgroundColor: colors.green,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="leaf-outline" size={32} color="#fff" />
        </View>
        <Text style={styles.label}>OGHMANOTES · ANDROID ALPHA</Text>
        <Text style={[styles.title, { fontSize: 42 }]}>
          A little space to think.
        </Text>
        <Text style={styles.text}>
          Pick up your notes and course material, wherever you are.
        </Text>
        {notice ? (
          <View style={styles.card}>
            <Text accessibilityLiveRegion="polite" style={styles.text}>
              {notice}
            </Text>
          </View>
        ) : null}
        <View style={{ gap: 12 }}>
          <Field
            accessibilityLabel="Email"
            placeholder="Email address"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            editable={!busy}
          />
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
          {error ? <ErrorBox message={error} /> : null}
          <Button
            title={busy ? "Signing in…" : "Sign in"}
            disabled={busy || !email.trim() || !password}
            onPress={() => void submit()}
          />
        </View>
        <Text style={styles.muted}>
          Use your existing email and password. Google and GitHub sign-in are
          not available in this alpha.
        </Text>
        <Button
          quiet
          title="Account help on the website"
          onPress={() => {
            void Linking.openURL(`${origin}/login`).catch((e) =>
              setError(message(e)),
            );
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
