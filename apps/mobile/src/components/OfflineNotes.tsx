import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Markdown from "react-native-markdown-display";
import { origin } from "../lib/api";
import {
  OfflineLibrary,
  type OfflineNote,
  type OfflineSnapshot,
} from "../lib/offline-state";
import { useTheme } from "../lib/theme";
import { Empty, ErrorBox, Field, IconButton, Loading, message } from "../ui";

interface OfflineActions {
  open(): void;
  setAccount(ownerId: string | null): void;
  save(snapshot: OfflineSnapshot): void;
}

type Notice = { kind: "success" | "error"; text: string };

const Context = createContext<OfflineActions | null>(null);

export function useOfflineNotes() {
  const value = useContext(Context);
  if (!value) throw new Error("Offline notes provider is missing");
  return value;
}

function savedAt(note: OfflineNote) {
  return new Date(note.savedAt).toLocaleString();
}

export function OfflineNotesProvider({ children }: { children: ReactNode }) {
  const { colors, styles } = useTheme();
  const [library] = useState(() => {
    const key = `oghma.offline.v1.${new URL(origin).hostname}`;
    return new OfflineLibrary({
      read: () => AsyncStorage.getItem(key),
      write: (value) => AsyncStorage.setItem(key, value),
    });
  });
  const [visible, setVisible] = useState(false);
  const [notes, setNotes] = useState<OfflineNote[]>([]);
  const [selected, setSelected] = useState<OfflineNote | null>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  const perform = useCallback(
    async (operation: () => Promise<unknown>, success?: string) => {
      setBusy(true);
      setNotice(null);
      try {
        await operation();
        if (success) setNotice({ kind: "success", text: success });
      } catch (error) {
        setNotice({ kind: "error", text: message(error) });
      } finally {
        setNotes([...library.notes]);
        setBusy(false);
      }
    },
    [library],
  );
  const close = useCallback(() => {
    setVisible(false);
    setSelected(null);
    setNotice(null);
  }, []);
  const open = useCallback(() => {
    setSelected(null);
    setQuery("");
    setVisible(true);
    void perform(() => library.read());
  }, [library, perform]);
  const actions = useMemo<OfflineActions>(
    () => ({
      open,
      setAccount: (ownerId) => {
        if (!ownerId || library.ownerId !== ownerId) {
          setSelected(null);
          setNotes([]);
        }
        void perform(() => library.setAccount(ownerId));
      },
      save: (snapshot) => {
        setSelected(null);
        setQuery("");
        setVisible(true);
        void perform(() => library.save(snapshot), "Saved for offline reading.");
      },
    }),
    [library, open, perform],
  );
  const removeAll = useCallback(
    () =>
      Alert.alert(
        "Remove offline notes?",
        "This removes downloaded copies from this phone. Your online notes stay saved.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove downloads",
            style: "destructive",
            onPress: () => {
              setSelected(null);
              void perform(() => library.clear(), "Downloaded notes removed.");
            },
          },
        ],
      ),
    [library, perform],
  );
  const removeSelected = useCallback(() => {
    if (!selected) return;
    const id = selected.id;
    setSelected(null);
    void perform(() => library.remove(id), "Downloaded copy removed.");
  }, [library, perform, selected]);
  const filteredNotes = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return term
      ? notes.filter((note) => note.title.toLocaleLowerCase().includes(term))
      : notes;
  }, [notes, query]);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<OfflineNote>) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open downloaded note: ${item.title || "Untitled note"}`}
        accessibilityHint="Opens this read-only copy"
        onPress={() => setSelected(item)}
        style={({ pressed }) => [
          styles.card,
          {
            minHeight: 78,
            marginTop: 12,
            backgroundColor: pressed ? colors.surfaceElevated : colors.surface,
          },
        ]}
      >
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Text numberOfLines={2} style={[styles.heading, { flex: 1 }]}>
            {item.title || "Untitled note"}
          </Text>
          <Ionicons name="chevron-forward" size={20} color={colors.faint} />
        </View>
        <Text style={styles.muted}>Downloaded {savedAt(item)}</Text>
      </Pressable>
    ),
    [colors.faint, colors.surface, colors.surfaceElevated, styles.card, styles.heading, styles.muted, styles.row],
  );

  return (
    <Context.Provider value={actions}>
      {children}
      <Modal
        visible={visible}
        animationType="slide"
        onRequestClose={() => (selected ? setSelected(null) : close())}
      >
        <SafeAreaView style={styles.screen}>
          <View style={styles.bar}>
            {selected ? (
              <IconButton
                name="arrow-back"
                label="Back to offline notes"
                onPress={() => setSelected(null)}
              />
            ) : null}
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              style={[styles.heading, { flex: 1 }]}
            >
              {selected?.title || (selected ? "Untitled note" : "Offline notes")}
            </Text>
            {selected ? (
              <IconButton
                disabled={busy}
                name="trash-outline"
                label="Remove downloaded copy"
                onPress={removeSelected}
              />
            ) : notes.length ? (
              <IconButton
                disabled={busy}
                name="trash-outline"
                label="Remove all downloaded notes"
                onPress={removeAll}
              />
            ) : null}
            <IconButton name="close" label="Close offline notes" onPress={close} />
          </View>
          {notice?.kind === "error" ? (
            <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
              <ErrorBox message={notice.text} />
            </View>
          ) : notice ? (
            <View
              accessibilityLiveRegion="polite"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 20,
                paddingVertical: 12,
                backgroundColor: colors.accentSoft,
              }}
            >
              <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
              <Text style={[styles.muted, { flex: 1 }]}>{notice.text}</Text>
            </View>
          ) : null}
          {selected ? (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
              <View style={[styles.card, { gap: 6 }]}>
                <Text style={styles.label}>OFFLINE COPY</Text>
                <Text style={styles.muted}>Downloaded {savedAt(selected)} · Read-only</Text>
              </View>
              <Markdown
                onLinkPress={() => false}
                rules={{ image: () => null }}
                style={{
                  body: {
                    color: colors.text,
                    fontFamily: "SourceSans3_400Regular",
                    fontSize: 18,
                    lineHeight: 29,
                  },
                  heading1: { color: colors.markdown.heading1, fontFamily: "SourceSerif4_600SemiBold" },
                  heading2: { color: colors.markdown.heading2, fontFamily: "SourceSans3_600SemiBold" },
                  heading3: { color: colors.markdown.heading3, fontFamily: "SourceSans3_600SemiBold" },
                  code_inline: { color: colors.text, backgroundColor: colors.accentSoft },
                  fence: { color: colors.text, backgroundColor: colors.accentSoft },
                }}
              >
                {selected.content || "This note is empty."}
              </Markdown>
            </ScrollView>
          ) : (
            <FlatList
              data={filteredNotes}
              keyExtractor={(note) => note.id}
              renderItem={renderItem}
              contentContainerStyle={[styles.content, { flexGrow: 1 }]}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <View style={{ gap: 12 }}>
                  <Text style={styles.label}>OFFLINE LIBRARY</Text>
                  <Text style={styles.title}>Notes saved to this phone</Text>
                  <Text style={styles.muted}>
                    These copies stay available without a connection. Refresh one from its online note.
                  </Text>
                  <Field
                    accessibilityLabel="Find an offline note"
                    placeholder="Find a downloaded note"
                    value={query}
                    onChangeText={setQuery}
                  />
                </View>
              }
              ListEmptyComponent={
                busy ? (
                  <Loading />
                ) : query ? (
                  <Empty title="No matching notes">Try a different title.</Empty>
                ) : (
                  <Empty title="Nothing saved offline">
                    Save a note from the online editor to read it here without a connection.
                  </Empty>
                )
              }
            />
          )}
        </SafeAreaView>
      </Modal>
    </Context.Provider>
  );
}
