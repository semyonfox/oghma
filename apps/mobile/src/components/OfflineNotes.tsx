import { createContext, useContext, useState, type ReactNode } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Markdown from "react-native-markdown-display";
import { origin } from "../lib/api";
import {
  OfflineLibrary,
  type OfflineNote,
  type OfflineSnapshot,
} from "../lib/offline-state";
import { useTheme } from "../lib/theme";
import { Button, Field, IconButton, message } from "../ui";

interface OfflineActions {
  open(): void;
  setAccount(ownerId: string | null): void;
  save(snapshot: OfflineSnapshot): void;
}
const Context = createContext<OfflineActions | null>(null);
export function useOfflineNotes() {
  const value = useContext(Context);
  if (!value) throw new Error("Offline notes provider is missing");
  return value;
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
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const perform = async (operation: () => Promise<unknown>, success = "") => {
    setBusy(true);
    setStatus("");
    try {
      await operation();
      setStatus(success);
    } catch (error) {
      setStatus(message(error));
    } finally {
      setNotes([...library.notes]);
      setBusy(false);
    }
  };
  const close = () => {
    setVisible(false);
    setSelected(null);
  };
  const open = () => {
    setSelected(null);
    setQuery("");
    setVisible(true);
    void perform(() => library.read());
  };
  const actions: OfflineActions = {
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
  };
  const removeAll = () =>
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
          <View
            style={[
              styles.row,
              {
                paddingHorizontal: 12,
                borderBottomWidth: 1,
                borderColor: colors.border,
              },
            ]}
          >
            {selected && (
              <IconButton
                name="arrow-back"
                label="Back to offline notes"
                onPress={() => setSelected(null)}
              />
            )}
            <Text
              accessibilityRole="header"
              style={[styles.heading, { flex: 1 }]}
            >
              Offline notes
            </Text>
            <IconButton
              name="close"
              label="Close offline notes"
              onPress={close}
            />
          </View>
          {status ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.muted, { padding: 16 }]}
            >
              {status}
            </Text>
          ) : null}
          {selected ? (
            <ScrollView contentContainerStyle={styles.content}>
              <Text selectable style={styles.title}>
                {selected.title || "Untitled note"}
              </Text>
              <Text style={styles.muted}>
                Read-only copy · Synced{" "}
                {new Date(selected.savedAt).toLocaleString()}
              </Text>
              <Markdown
                onLinkPress={() => false}
                rules={{ image: () => null }}
                style={{
                  body: { color: colors.text, fontSize: 18, lineHeight: 28 },
                  code_inline: {
                    color: colors.text,
                    backgroundColor: colors.accentSoft,
                  },
                  fence: {
                    color: colors.text,
                    backgroundColor: colors.accentSoft,
                  },
                }}
              >
                {selected.content || "This note is empty."}
              </Markdown>
              <Button
                quiet
                title="Remove downloaded copy"
                disabled={busy}
                onPress={() => {
                  const id = selected.id;
                  setSelected(null);
                  void perform(
                    () => library.remove(id),
                    "Downloaded copy removed.",
                  );
                }}
              />
            </ScrollView>
          ) : (
            <FlatList
              data={notes.filter((note) =>
                note.title
                  .toLocaleLowerCase()
                  .includes(query.toLocaleLowerCase()),
              )}
              keyExtractor={(note) => note.id}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <View style={{ gap: 16 }}>
                  <Text style={styles.title}>Ready without Wi-Fi</Text>
                  <Text style={styles.muted}>
                    Keep notes you choose on this phone. To refresh a copy, open
                    the online note and save it offline again. Images and
                    attachments are not downloaded. Signing out removes these
                    copies.
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
                <Text style={[styles.muted, { paddingVertical: 24 }]}>
                  {busy
                    ? "Loading…"
                    : query
                      ? "No matching notes."
                      : "No downloaded notes yet. Open a note online and choose Save offline."}
                </Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSelected(item)}
                  style={({ pressed }) => [
                    styles.card,
                    { marginTop: 12, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={styles.heading}>
                    {item.title || "Untitled note"}
                  </Text>
                  <Text style={styles.muted}>
                    Synced {new Date(item.savedAt).toLocaleString()}
                  </Text>
                </Pressable>
              )}
              ListFooterComponent={
                <View style={{ marginTop: 24 }}>
                  <Button
                    quiet
                    title="Remove downloaded notes"
                    disabled={busy}
                    onPress={removeAll}
                  />
                </View>
              }
            />
          )}
        </SafeAreaView>
      </Modal>
    </Context.Provider>
  );
}
