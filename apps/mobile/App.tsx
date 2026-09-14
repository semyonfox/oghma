import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, BackHandler, Linking, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
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
import { AppUpdateLink, UpdateBanner, UpdatesProvider, useUpdates } from "./src/components/AppUpdates";
import { Button, Loading, message } from "./src/ui";

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
          <AppShell ready={!!(fontsLoaded || fontError)} />
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

function Workspace() {
  const { colors, styles, setWebTheme } = useTheme();
  const { open: openUpdates } = useUpdates();
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
    }
  };
  const navigate = (url: string, newWindow = false) => {
    switch (navigationAction(url, origin)) {
      case "workspace":
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
    return (
      <View style={[styles.content, { flex: 1, justifyContent: "center" }]}>
        <Text style={styles.title}>Could not restore sign-in</Text>
        <Text style={styles.text}>{startupError}</Text>
        <Button title="Try again" onPress={() => void restore()} />
        <AppUpdateLink />
      </View>
    );
  }
  if (!ready) return <Loading />;
  return (
    <View style={styles.screen}>
      <WebView
        key={webViewVersion}
        ref={webView}
        source={source}
        style={{ flex: 1, backgroundColor: colors.background }}
        applicationNameForUserAgent="OghmaNotesAndroid/0.1.3"
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
        renderLoading={() => <View style={{ position: "absolute", inset: 0, backgroundColor: colors.background }}><Loading /></View>}
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
        <View style={[styles.content, { position: "absolute", inset: 0, justifyContent: "center", backgroundColor: colors.background }]}>
          <Text style={styles.title}>Could not load your workspace</Text>
          <Text style={styles.text}>{loadError}</Text>
          <Button title="Try again" onPress={() => { setLoadError(""); setWebViewVersion((value) => value + 1); }} />
          <AppUpdateLink />
        </View>
      ) : null}
    </View>
  );
}
