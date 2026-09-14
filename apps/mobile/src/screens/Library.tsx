import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, Text, View, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { z } from "zod";
import { json } from "../lib/api";
import { noteSchema, treeSchema, type TreeItem } from "../lib/contracts";
import { Button, Empty, ErrorBox, Field, Loading, message } from "../ui";
import { useTheme } from "../lib/theme";

export function Library({
  parent,
  onOpen,
}: {
  parent?: TreeItem;
  onOpen: (item: TreeItem, initialEditing?: boolean) => void;
}) {
  const { colors, styles } = useTheme();
  const [items, setItems] = useState<TreeItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(
        (
          await json(
            `/api/tree/children${parent ? `?parent_id=${parent.id}` : ""}`,
            treeSchema,
          )
        ).items,
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [parent]);
  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const note = await json("/api/notes", noteSchema, {
        method: "POST",
        body: JSON.stringify({
          title: "Untitled note",
          content: "",
          pid: parent?.id,
        }),
      });
      if (mounted.current) onOpen({ ...note, isFolder: false }, true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const upload = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "text/plain", "text/markdown"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const file = new File(asset.uri);
      try {
        const form = new FormData();
        form.append("file", file, asset.name);
        await json("/api/upload", z.object({ noteId: z.string().uuid() }), {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(120_000),
        });
        Alert.alert(
          "File uploaded",
          parent
            ? "Your file is in the root of Notes, not this folder. Text extraction continues in the background."
            : "Your file is in the root of Notes. Text extraction continues in the background.",
        );
        await load();
      } finally {
        if (file.exists) file.delete();
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const filtered = items.filter((item) =>
    item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshing={loading && items.length > 0}
      onRefresh={() => void load()}
      ListHeaderComponent={
        <View style={{ gap: 16 }}>
          <Text style={styles.label}>YOUR STUDY LIBRARY</Text>
          <Text accessibilityRole="header" style={styles.title}>
            {parent?.title || "Notes"}
          </Text>
          {!parent && (
            <Text style={styles.muted}>
              Your courses and notes, ready to pick up.
            </Text>
          )}
          <View style={styles.actions}>
            <Button
              title={busy ? "Working…" : "New note"}
              disabled={busy}
              onPress={() => void create()}
            />
            <Button
              quiet
              title="Upload file"
              disabled={busy}
              onPress={() => void upload()}
            />
          </View>
          <Field
            accessibilityLabel="Filter this folder"
            placeholder="Find in this folder"
            value={query}
            onChangeText={setQuery}
          />
          {error ? (
            <ErrorBox message={error} retry={() => void load()} />
          ) : null}
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <Loading />
        ) : error ? null : (
          <Empty
            title={query ? "No matching notes" : "Room for your next idea"}
          >
            {query
              ? "Try a different title."
              : "Create a note or upload course material to get started."}
          </Empty>
        )
      }
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.isFolder ? "Open folder" : "Open note"} ${item.title}`}
          onPress={() => onOpen(item)}
          style={({ pressed }) => [
            styles.card,
            styles.row,
            { marginTop: 8, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <View
            style={{
              padding: 12,
              backgroundColor: colors.accentSoft,
              borderRadius: 12,
            }}
          >
            <Ionicons
              name={
                item.isFolder
                  ? "folder-outline"
                  : item.s3Key
                    ? "document-attach-outline"
                    : "document-text-outline"
              }
              color={colors.accent}
              size={24}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={2} style={styles.heading}>
              {item.title || "Untitled"}
            </Text>
            <Text style={styles.muted}>
              {item.isFolder
                ? "Folder"
                : item.s3Key
                  ? "Course material"
                  : "Note"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      )}
    />
  );
}
