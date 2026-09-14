import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import { z } from "zod";
import { json } from "./api";
import { isCurrentThemeRequest } from "./theme-state";
import {
  createStyles,
  darkPalette,
  lightPalette,
  themePreferenceValues,
  type Palette,
  type ThemePreference,
  type UiStyles,
} from "./palette";

const settingsSchema = z
  .object({ theme: z.enum(themePreferenceValues).optional() })
  .passthrough();
const deviceThemeKey = (accountId: string | null) =>
  `oghma.theme.${accountId || "device"}`;
type ThemeContextValue = {
  colors: Palette;
  styles: UiStyles;
  isDark: boolean;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => Promise<void>;
  accountId: string | null;
  setAccountId: (accountId: string | null) => void;
  syncError: string;
  syncing: boolean;
  saving: boolean;
};
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [preference, setStoredPreference] = useState<ThemePreference>("system");
  const [syncError, setSyncError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveBusy = useRef(false);
  const accountRef = useRef(accountId);
  const interactionRef = useRef(0);
  useEffect(() => {
    accountRef.current = accountId;
  }, [accountId]);
  useEffect(() => {
    const selectedAccount = accountId;
    const loadVersion = interactionRef.current;
    let cancelled = false;
    setSyncError("");
    setSyncing(!!selectedAccount);
    setStoredPreference("system");
    void (async () => {
      try {
        const local = await AsyncStorage.getItem(
          deviceThemeKey(selectedAccount),
        );
        const parsed = z.enum(themePreferenceValues).safeParse(local);
        if (
          !cancelled &&
          isCurrentThemeRequest(
            accountRef.current,
            selectedAccount,
            interactionRef.current,
            loadVersion,
          ) &&
          parsed.success
        )
          setStoredPreference(parsed.data);
        if (!selectedAccount) return;
        const settings = await json("/api/settings", settingsSchema);
        if (
          !cancelled &&
          isCurrentThemeRequest(
            accountRef.current,
            selectedAccount,
            interactionRef.current,
            loadVersion,
          ) &&
          settings.theme
        ) {
          setStoredPreference(settings.theme);
          void AsyncStorage.setItem(
            deviceThemeKey(selectedAccount),
            settings.theme,
          ).catch(() => {
            if (
              isCurrentThemeRequest(
                accountRef.current,
                selectedAccount,
                interactionRef.current,
                loadVersion,
              )
            )
              setSyncError("Could not save this theme on your phone.");
          });
        }
      } catch (error) {
        if (!cancelled && accountRef.current === selectedAccount)
          setSyncError(
            error instanceof Error
              ? error.message
              : "Could not load your theme setting.",
          );
      } finally {
        if (!cancelled && accountRef.current === selectedAccount)
          setSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);
  const setPreference = useCallback(async (next: ThemePreference) => {
    if (saveBusy.current) return;
    const version = ++interactionRef.current;
    const selectedAccount = accountRef.current;
    setStoredPreference(next);
    setSyncError("");
    const deviceSave = AsyncStorage.setItem(
      deviceThemeKey(selectedAccount),
      next,
    );
    if (!selectedAccount) {
      try {
        await deviceSave;
      } catch {
        if (
          isCurrentThemeRequest(
            accountRef.current,
            selectedAccount,
            interactionRef.current,
            version,
          )
        )
          setSyncError("Could not save this theme on your phone.");
      }
      return;
    }
    saveBusy.current = true;
    setSaving(true);
    setSyncing(true);
    try {
      await Promise.all([
        deviceSave,
        json("/api/settings", settingsSchema, {
          method: "POST",
          body: JSON.stringify({ theme: next }),
        }),
      ]);
    } catch (error) {
      if (
        isCurrentThemeRequest(
          accountRef.current,
          selectedAccount,
          interactionRef.current,
          version,
        )
      )
        setSyncError(
          error instanceof Error
            ? error.message
            : "Could not save your theme setting.",
        );
    } finally {
      saveBusy.current = false;
      setSaving(false);
      if (
        isCurrentThemeRequest(
          accountRef.current,
          selectedAccount,
          interactionRef.current,
          version,
        )
      )
        setSyncing(false);
    }
  }, []);
  const isDark =
    preference === "dark" ||
    (preference === "system" && systemScheme === "dark");
  const colors = isDark ? darkPalette : lightPalette;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const value = useMemo(
    () => ({
      colors,
      styles,
      isDark,
      preference,
      setPreference,
      accountId,
      setAccountId,
      syncError,
      syncing,
      saving,
    }),
    [
      colors,
      styles,
      isDark,
      preference,
      setPreference,
      accountId,
      syncError,
      syncing,
      saving,
    ],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider.");
  return value;
}
