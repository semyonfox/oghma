import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as nativeUpdater from "../../modules/oghma-updater";
import { useTheme } from "../lib/theme";
import { downloadsUrl, fetchRelease } from "../lib/update-release";
import { UpdateController, type UpdateState } from "../lib/update-state";
import { Button, ErrorBox, IconButton, message } from "../ui";

const UpdatesContext = createContext<{
  controller: UpdateController;
  open: () => void;
} | null>(null);
export function useUpdates() {
  const value = useContext(UpdatesContext);
  if (!value) throw new Error("UpdatesProvider is missing.");
  const state = useSyncExternalStore(
    value.controller.subscribe,
    value.controller.getSnapshot,
  );
  return { ...value, state };
}
const sizeLabel = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function statusTitle(state: UpdateState) {
  switch (state.status) {
    case "checking":
      return "Checking for updates…";
    case "current":
      return "You're up to date";
    case "available":
      return `Version ${state.release?.version} is available`;
    case "downloading":
      return "Downloading update…";
    case "verifying":
      return "Checking the download…";
    case "cancelling":
      return "Cancelling download…";
    case "ready":
      return "Ready to install";
    case "permission":
      return "Allow updates from OghmaNotes";
    case "opening":
      return "Opening Android installer…";
    case "installer":
      return "Finish the update in Android";
    case "error":
      return "Update needs attention";
    default:
      return "App updates";
  }
}

export function UpdatesProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(
    () => new UpdateController({ ...nativeUpdater, fetchRelease }),
  );
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const progress = nativeUpdater.addDownloadProgressListener(
      controller.progress,
    );
    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active") controller.foreground();
    });
    void controller.check(true);
    return () => {
      progress.remove();
      foreground.remove();
      controller.cancel();
    };
  }, [controller]);
  return (
    <UpdatesContext.Provider
      value={{ controller, open: () => setVisible(true) }}
    >
      {children}
      <UpdateSheet visible={visible} close={() => setVisible(false)} />
    </UpdatesContext.Provider>
  );
}

export function AppUpdateCard() {
  const { styles } = useTheme();
  const { controller, state, open } = useUpdates();
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>App updates</Text>
      <Text style={styles.muted}>
        Android alpha · {controller.installed.version}
      </Text>
      <Text style={styles.text}>{statusTitle(state)}</Text>
      <Button
        quiet
        title={state.release ? "View update" : "Check for updates"}
        onPress={() => {
          open();
          if (!state.release) void controller.check();
        }}
      />
    </View>
  );
}

export function AppUpdateLink() {
  const { open } = useUpdates();
  const { colors, styles } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={open}
      style={{ minHeight: 48, justifyContent: "center", alignItems: "center" }}
    >
      <Text style={[styles.muted, { color: colors.accent }]}>App updates</Text>
    </Pressable>
  );
}

// Also shown on login, where a broken sign-in must not prevent updating the app.
export function UpdateBanner() {
  const { state, open } = useUpdates();
  const { colors, styles } = useTheme();
  const [dismissed, setDismissed] = useState<number | null>(null);
  const busy = ["downloading", "verifying", "cancelling", "opening"].includes(
    state.status,
  );
  if (!state.release || (dismissed === state.release.versionCode && !busy))
    return null;
  return (
    <View style={[styles.bar, { borderTopWidth: 1, borderBottomWidth: 0 }]}>
      <Pressable
        accessibilityRole="button"
        onPress={open}
        style={{ flex: 1, minHeight: 48, justifyContent: "center" }}
      >
        <Text style={[styles.muted, { color: colors.accent }]}>
          {state.status === "available"
            ? `Update to ${state.release.version}`
            : statusTitle(state)}
          {state.status === "downloading"
            ? ` ${Math.floor((state.receivedBytes / state.release.bytes) * 100)}%`
            : ""}
        </Text>
      </Pressable>
      {!busy && (
        <IconButton
          name="close"
          label="Dismiss update notice"
          onPress={() => setDismissed(state.release?.versionCode ?? null)}
        />
      )}
    </View>
  );
}

function UpdateSheet({
  visible,
  close,
}: {
  visible: boolean;
  close: () => void;
}) {
  const { state, controller } = useUpdates();
  const { colors, styles } = useTheme();
  const release = state.release;
  const percent = release
    ? Math.floor((state.receivedBytes / release.bytes) * 100)
    : 0;
  const busy = ["checking", "verifying", "cancelling", "opening"].includes(
    state.status,
  );
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={close}
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={styles.screen}>
        <View style={styles.bar}>
          <Text accessibilityRole="header" style={styles.heading}>
            App updates
          </Text>
          <IconButton name="close" label="Close app updates" onPress={close} />
        </View>
        <ScrollView contentContainerStyle={[styles.content, { flexGrow: 1 }]}>
          <Text style={styles.label}>OGHMANOTES ANDROID ALPHA</Text>
          <Text style={styles.muted}>
            Installed version {controller.installed.version}
          </Text>
          <View style={[styles.card, { padding: 24, gap: 18 }]}>
            <Ionicons
              name={
                state.status === "current"
                  ? "checkmark-circle-outline"
                  : "cloud-download-outline"
              }
              size={36}
              color={colors.accent}
            />
            <Text
              accessibilityRole="header"
              accessibilityLiveRegion="polite"
              style={styles.title}
            >
              {statusTitle(state)}
            </Text>
            {release && (
              <Text style={styles.muted}>
                Version {release.version} · {sizeLabel(release.bytes)}
              </Text>
            )}
            {busy && (
              <ActivityIndicator
                accessibilityLabel={statusTitle(state)}
                color={colors.accent}
              />
            )}
            {state.status === "current" && (
              <Text style={styles.text}>
                You have the latest available version of the Android alpha.
              </Text>
            )}
            {state.status === "available" && (
              <Text style={styles.text}>
                Download the update here, then confirm installation with
                Android. Your account and saved notes stay in place.
              </Text>
            )}
            {state.status === "downloading" && release && (
              <>
                <View
                  accessibilityRole="progressbar"
                  accessibilityLabel="Update download"
                  accessibilityValue={{ min: 0, max: 100, now: percent }}
                  style={{
                    height: 8,
                    backgroundColor: colors.surfaceElevated,
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      width: `${percent}%`,
                      height: 8,
                      backgroundColor: colors.action,
                    }}
                  />
                </View>
                <Text style={styles.muted}>
                  {sizeLabel(state.receivedBytes)} of {sizeLabel(release.bytes)}{" "}
                  · {percent}%
                </Text>
                <Text style={styles.muted}>
                  You can keep using OghmaNotes while it downloads.
                </Text>
              </>
            )}
            {state.status === "verifying" && (
              <Text style={styles.text}>
                Checking that this is a complete, signed OghmaNotes update.
              </Text>
            )}
            {state.status === "ready" && (
              <Text style={styles.text}>
                Finish any edits before continuing. Android will close
                OghmaNotes to install the update.
              </Text>
            )}
            {state.status === "permission" && (
              <>
                <Text style={styles.text}>
                  Android needs your permission the first time OghmaNotes
                  installs an update.
                </Text>
                <Text style={styles.text}>
                  Open settings, enable “Allow from this source”, then return
                  here and tap Install update.
                </Text>
              </>
            )}
            {state.status === "installer" && (
              <Text style={styles.text}>
                Confirm Update in the Android installer, then reopen OghmaNotes.
                If you cancelled, you can open the installer again.
              </Text>
            )}
            {state.status === "error" && (
              <ErrorBox
                message={state.error}
                retry={() => void controller.retry()}
              />
            )}
            {["idle", "current"].includes(state.status) && (
              <Button
                title="Check for updates"
                onPress={() => void controller.check()}
              />
            )}
            {state.status === "available" && (
              <Button
                title="Download update"
                onPress={() => void controller.download()}
              />
            )}
            {["downloading", "verifying"].includes(state.status) && (
              <Button
                quiet
                title="Cancel download"
                onPress={() => controller.cancel()}
              />
            )}
            {state.status === "ready" && (
              <Button
                title="Install update"
                onPress={() => void controller.install()}
              />
            )}
            {state.status === "permission" && (
              <Button
                title="Open Android settings"
                onPress={() => void controller.permission()}
              />
            )}
            {state.status === "installer" && (
              <Button
                title="Open installer again"
                onPress={() => void controller.install()}
              />
            )}
            {state.status === "error" && state.retry === "install" && (
              <Button
                quiet
                title="Download again"
                onPress={() => void controller.download()}
              />
            )}
            {state.status === "error" && state.retry === "download" && (
              <Button
                quiet
                title="Check for updates again"
                onPress={() => void controller.check()}
              />
            )}
          </View>
          {state.checkedAt && (
            <Text style={styles.muted}>
              Last checked {new Date(state.checkedAt).toLocaleString()}
            </Text>
          )}
          <View style={{ flex: 1 }} />
          <Text style={styles.muted}>
            Updates come from oghmanotes.ie. Android handles installation and
            may ask for confirmation.
          </Text>
          <Button
            quiet
            title="Open downloads on the website"
            onPress={() => {
              void Linking.openURL(downloadsUrl).catch((error) =>
                Alert.alert("Could not open downloads", message(error)),
              );
            }}
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
