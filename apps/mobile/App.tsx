import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, BackHandler, Linking, ScrollView, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import * as SystemUI from "expo-system-ui";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  useFonts,
  SourceSans3_400Regular,
  SourceSans3_600SemiBold,
} from "@expo-google-fonts/source-sans-3";
import { SourceSerif4_600SemiBold } from "@expo-google-fonts/source-serif-4";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { origin } from "./src/lib/api";
import { ThemeProvider, useTheme } from "./src/lib/theme";
import { restoreWebSession, resumeWebSignIn, signInToWeb } from "./src/lib/web-session";
import { navigationAction, parseWebMessage } from "./src/lib/web-navigation";
import { oauthReturnUrl } from "./src/lib/oauth-contracts";
import { AppUpdateLink, UpdateBanner, UpdatesProvider, useUpdates } from "./src/components/AppUpdates";
import { Button, Loading, message } from "./src/ui";
import { OfflineNotesProvider, useOfflineNotes } from "./src/components/OfflineNotes";

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    SourceSans3_400Regular,
    SourceSans3_600SemiBold,
    SourceSerif4_600SemiBold,
  });
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <UpdatesProvider>
          <OfflineNotesProvider>
          <AppShell ready={!!(fontsLoaded || fontError)} />
          </OfflineNotesProvider>
        </UpdatesProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

function AppShell({ ready }: { ready: boolean }) {
  const { styles, colors, isDark } = useTheme();
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style={isDark ? "light" : "dark"} />
      {ready ? <Workspace /> : <Loading />}
      {ready && <UpdateBanner />}
    </SafeAreaView>
  );
}

function RecoveryScreen({
  title,
  detail,
  retry,
  openOffline,
}: {
  title: string;
  detail: string;
  retry: () => void;
  openOffline: () => void;
}) {
  const { colors, styles } = useTheme();
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { flexGrow: 1, justifyContent: "center" }]}
    >
      <View style={{ width: "100%", maxWidth: 560, alignSelf: "center", gap: 16 }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.errorSoft,
          }}
        >
          <Ionicons name="cloud-offline-outline" size={27} color={colors.error} />
        </View>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text style={styles.text}>{detail}</Text>
        <Button title="Try again" onPress={retry} />
        <Button quiet title="Read offline notes" onPress={openOffline} />
        <AppUpdateLink />
      </View>
    </ScrollView>
  );
}

function Workspace() {
  const { colors, styles, setWebTheme } = useTheme();
  const { open: openUpdates } = useUpdates();
  const offline = useOfflineNotes();
  const webView = useRef<WebView>(null);
  const canGoBack = useRef(false);
  const signingIn = useRef(false);
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [webViewVersion, setWebViewVersion] = useState(0);
  const [source, setSource] = useState({ uri: `${origin}/notes` });

  const restore = useCallback(async () => {
    setStartupError("");
    try {
      await restoreWebSession();
      await resumeWebSignIn();
      setReady(true);
    } catch (error) {
      setStartupError(message(error));
    }
  }, []);
  useEffect(() => { void restore(); }, [restore]);
  useEffect(() => {
    const subscription = Linking.addEventListener("url", ({ url }) => {
      // openAuthSessionAsync handles the callback while its original call lives.
      if (signingIn.current || !url.startsWith(`${oauthReturnUrl}?`)) return;
      signingIn.current = true;
      void resumeWebSignIn(url)
        .then((signedIn) => {
          if (!signedIn) return;
          setStartupError("");
          setLoadError("");
          setSource({ uri: `${origin}/notes` });
          setWebViewVersion((value) => value + 1);
          setReady(true);
        })
        .catch((error) => Alert.alert("Could not sign in", message(error)))
        .finally(() => { signingIn.current = false; });
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack.current && !loadError) {
        webView.current?.goBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [loadError]);

  const signIn = async (provider: "google" | "github") => {
    if (signingIn.current) return;
    signingIn.current = true;
    try {
      if (await signInToWeb(provider)) {
        setLoadError("");
        setSource({ uri: `${origin}/notes` });
        setWebViewVersion((value) => value + 1);
      }
    } catch (error) {
      Alert.alert("Could not sign in", message(error));
    } finally {
      signingIn.current = false;
    }
  };
  const onMessage = (event: WebViewMessageEvent) => {
    const action = parseWebMessage(event.nativeEvent.data, event.nativeEvent.url, origin);
    if (!action) return;
    switch (action.type) {
      case "oghma:oauth": void signIn(action.provider); break;
      case "oghma:updates": openUpdates(); break;
      case "oghma:theme": setWebTheme(action.theme); break;
      case "oghma:offline-open": offline.open(); break;
      case "oghma:offline-account": offline.setAccount(action.ownerId); break;
      case "oghma:offline-save": offline.save(action.snapshot); break;
    }
  };
  const navigate = (url: string, newWindow = false) => {
    switch (navigationAction(url, origin)) {
      case "home": setSource({ uri: `${origin}/notes` }); return false;
      case "workspace":
        if (["/login", "/register"].includes(new URL(url).pathname)) offline.setAccount(null);
        if (newWindow) setSource({ uri: url });
        return !newWindow;
      case "update": openUpdates(); return false;
      case "external":
        void Linking.openURL(url).catch((error) => Alert.alert("Could not open link", message(error)));
        return false;
      default: return false;
    }
  };
  if (startupError) {
    return <RecoveryScreen title="Could not restore sign-in" detail={startupError} retry={() => void restore()} openOffline={offline.open} />;
  }
  if (!ready) {
    return (
      <View style={[styles.content, { flex: 1, justifyContent: "center" }]}>
        <View style={{ width: "100%", maxWidth: 560, alignSelf: "center", gap: 16 }}>
          <Loading />
          <Button quiet title="Read offline notes" onPress={offline.open} />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.screen}>
      <WebView
        key={webViewVersion}
        ref={webView}
        source={source}
        style={{ flex: 1, backgroundColor: colors.background }}
        applicationNameForUserAgent="OghmaNotesAndroid/0.1.4 OghmaNotesOffline/1"
        originWhitelist={["*"]}
        onShouldStartLoadWithRequest={(request) => navigate(request.url)}
        onOpenWindow={(event) => { navigate(event.nativeEvent.targetUrl, true); }}
        onMessage={onMessage}
        onNavigationStateChange={(navigation) => { canGoBack.current = navigation.canGoBack; }}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        javaScriptCanOpenWindowsAutomatically={false}
        setSupportMultipleWindows
        startInLoadingState
        renderLoading={() => (
          <View style={{ position: "absolute", inset: 0, backgroundColor: colors.background }}>
            <View style={[styles.content, { flex: 1, justifyContent: "center" }]}>
              <View style={{ width: "100%", maxWidth: 560, alignSelf: "center", gap: 16 }}>
                <Loading />
                <Button quiet title="Read offline notes" onPress={offline.open} />
              </View>
            </View>
          </View>
        )}
        onLoadStart={() => setLoadError("")}
        onError={() => setLoadError("OghmaNotes could not load. Check your connection and try again.")}
        onHttpError={(event) => {
          if (event.nativeEvent.url === source.uri && event.nativeEvent.statusCode >= 400) {
            setLoadError("OghmaNotes is temporarily unavailable. Please try again.");
          }
        }}
        onRenderProcessGone={() => setLoadError("Android paused this page to free memory. Reopen it to continue.")}
        renderError={() => <View />}
      />
      {loadError ? (
        <View style={{ position: "absolute", inset: 0, backgroundColor: colors.background }}>
          <RecoveryScreen
            title="Could not load your workspace"
            detail={loadError}
            retry={() => {
              setLoadError("");
              setWebViewVersion((value) => value + 1);
            }}
            openOffline={offline.open}
          />
        </View>
      ) : null}
    </View>
  );
}
