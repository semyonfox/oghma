import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Markdown from "react-native-markdown-display";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as IntentLauncher from "expo-intent-launcher";
import { getContentUriAsync } from "expo-file-system/legacy";
import { z } from "zod";
import { json, request } from "../lib/api";
import { draftToPersist, noteSchema, type Note } from "../lib/contracts";
import { Button, ErrorBox, Field, IconButton, Loading, message } from "../ui";
import { useTheme } from "../lib/theme";

const draftSchema = z.object({ title: z.string(), content: z.string() });
export const draftPrefix = "oghma.draft.";

export function Editor({
  id,
  userId,
  onBack,
  onChat,
  initialEditing = false,
}: {
  id: string;
  userId: string;
  onBack: () => void;
  onChat: (note: Note) => void;
  initialEditing?: boolean;
}) {
  const { colors, styles } = useTheme();
  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState(initialEditing);
  const [recoveryResolved, setRecoveryResolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const key = `${draftPrefix}${userId}.${id}`;
  const draftWrites = useRef(Promise.resolve());
  const draftFailed = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const dirty =
    !!note && (title !== note.title || content !== (note.content || ""));
  const load = useCallback(async () => {
    setError("");
    setRecoveryResolved(false);
    try {
      const loaded = await json(`/api/notes/${id}`, noteSchema);
      if (!mounted.current) return;
      setNote(loaded);
      setTitle(loaded.title);
      setContent(loaded.content || "");
      const saved = await AsyncStorage.getItem(key);
      if (!mounted.current) return;
      if (saved && !loaded.s3Key) {
        const draft = draftSchema.safeParse(JSON.parse(saved));
        if (
          draft.success &&
          (draft.data.title !== loaded.title ||
            draft.data.content !== (loaded.content || ""))
        ) {
          Alert.alert(
            "Restore your draft?",
            "This phone has unsaved changes. Restoring replaces the text in this editor. Saving the restored draft will overwrite the loaded server copy.",
            [
              {
                text: "Use server copy",
                onPress: () => {
                  if (!mounted.current) return;
                  setRecoveryResolved(true);
                },
              },
              {
                text: "Restore draft",
                onPress: () => {
                  if (!mounted.current) return;
                  setTitle(draft.data.title);
                  setContent(draft.data.content);
                  setEditing(true);
                  setRecoveryResolved(true);
                },
              },
            ],
          );
          return;
        }
      }
      setRecoveryResolved(true);
    } catch (e) {
      setError(message(e));
    }
  }, [id, key]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const update = draftToPersist(note, { title, content }, recoveryResolved);
    if (update === undefined) return;
    // Recovery must finish before a matching server copy can clear a draft.
    draftWrites.current = draftWrites.current
      .then(() =>
        update === null
          ? AsyncStorage.removeItem(key)
          : AsyncStorage.setItem(key, update),
      )
      .then(() => {
        draftFailed.current = false;
      })
      .catch(() => {
        draftFailed.current = true;
        setStatus(
          "Could not save the draft on this phone. Keep this screen open.",
        );
      });
  }, [title, content, note, recoveryResolved, key]);
  const leave = useCallback(() => {
    if (busy) return;
    const finishLeave = async () => {
      await draftWrites.current;
      if (dirty && draftFailed.current) {
        Alert.alert(
          "Draft could not be kept",
          "Save to your account before leaving, or discard these unsynced changes.",
          [
            { text: "Keep editing", style: "cancel" },
            { text: "Discard changes", style: "destructive", onPress: onBack },
          ],
        );
      } else onBack();
    };
    if (!dirty) {
      void finishLeave();
      return;
    }
    Alert.alert(
      "Leave without syncing?",
      "Your draft stays on this phone. Save to update the website too.",
      [
        { text: "Keep editing", style: "cancel" },
        { text: "Leave", onPress: () => void finishLeave() },
      ],
    );
  }, [busy, dirty, onBack]);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      leave();
      return true;
    });
    return () => sub.remove();
  }, [leave]);
  const save = async () => {
    if (!note || busy) return;
    setBusy(true);
    setError("");
    try {
      const latest = await json(`/api/notes/${id}`, noteSchema);
      if (latest.title !== note.title || latest.content !== note.content)
        throw new Error(
          "This note changed on another device. Your draft is kept here. Reopen the note to review the latest copy before saving.",
        );
      const updated = await json(`/api/notes/${id}`, noteSchema, {
        method: "PUT",
        body: JSON.stringify({ title, content }),
      });
      await draftWrites.current;
      await AsyncStorage.removeItem(key);
      setNote(updated);
      setTitle(updated.title);
      setContent(updated.content || "");
      setStatus("Saved to OghmaNotes");
      setEditing(false);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const openFile = async () => {
    if (!note?.s3Key) return;
    setBusy(true);
    setError("");
    let downloaded: File | undefined;
    try {
      const response = await request(
        `/api/upload?path=${encodeURIComponent(note.s3Key)}&stream=1`,
        { signal: AbortSignal.timeout(120_000) },
      );
      if (!response.body) throw new Error("The file download was empty.");
      const directory = new Directory(Paths.cache, "oghma-materials", userId);
      directory.create({ intermediates: true, idempotent: true });
      downloaded = new File(
        directory,
        `${id}.${note.mimeType === "application/pdf" ? "pdf" : "bin"}`,
      );
      downloaded.create({ overwrite: true });
      try {
        await response.body.pipeTo(downloaded.writableStream());
      } catch (error) {
        if (downloaded.exists) downloaded.delete();
        throw error;
      }
      if (Platform.OS === "android") {
        try {
          await IntentLauncher.startActivityAsync(
            "android.intent.action.VIEW",
            {
              data: await getContentUriAsync(downloaded.uri),
              flags: 1,
              type: note.mimeType || "application/octet-stream",
            },
          );
        } catch {
          if (!(await Sharing.isAvailableAsync()))
            throw new Error(
              "Install a compatible file viewer to open this material.",
            );
          await Sharing.shareAsync(downloaded.uri, {
            mimeType: note.mimeType || undefined,
            dialogTitle: "Share course material",
          });
        }
      } else {
        await Sharing.shareAsync(downloaded.uri, {
          mimeType: note.mimeType || undefined,
        });
      }
      // Android's chooser can return before the receiving viewer opens the file.
      // Keep it in our cache until logout rather than deleting its content URI.
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
      <View style={styles.bar}>
        <IconButton name="arrow-back" label="Back to notes" onPress={leave} />
        <Text
          accessibilityLiveRegion="polite"
          numberOfLines={1}
          style={[styles.muted, { flex: 1 }]}
        >
          {dirty ? "Unsaved changes" : "Note"}
        </Text>
        {!note?.s3Key && (
          <Button
            title={busy ? "Saving…" : editing ? "Save" : "Edit"}
            disabled={busy || !note || !recoveryResolved}
            onPress={() => (editing ? void save() : setEditing(true))}
          />
        )}
      </View>
      {!note ? (
        <View style={styles.content}>
          {error ? (
            <ErrorBox message={error} retry={() => void load()} />
          ) : (
            <Loading />
          )}
        </View>
      ) : editing ? (
        <View
          style={[styles.content, { flex: 1, paddingVertical: 12, gap: 10 }]}
        >
          {error ? <ErrorBox message={error} /> : null}
          <Field
            accessibilityLabel="Note title"
            value={title}
            maxLength={500}
            editable={!busy && recoveryResolved}
            autoFocus={initialEditing}
            selectTextOnFocus
            onChangeText={(value) => {
              setTitle(value);
              setStatus("");
            }}
          />
          <Text style={styles.muted}>
            Markdown · save to sync with your account
          </Text>
          <Field
            accessibilityLabel="Note content"
            multiline
            textAlignVertical="top"
            scrollEnabled
            value={content}
            editable={!busy && recoveryResolved}
            onChangeText={(value) => {
              setContent(value);
              setStatus("");
            }}
            style={{
              flex: 1,
              minHeight: 100,
              fontFamily: "monospace",
              lineHeight: 25,
            }}
          />
          {status ? (
            <Text accessibilityLiveRegion="polite" style={styles.muted}>
              {status}
            </Text>
          ) : null}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {error ? <ErrorBox message={error} /> : null}
          <Text accessibilityRole="header" selectable style={styles.title}>
            {title}
          </Text>
          <View style={styles.actions}>
            <Button
              quiet
              title="Ask about this note"
              disabled={dirty || busy}
              onPress={() => onChat(note)}
            />
            {note.s3Key ? (
              <Button
                title={busy ? "Opening…" : "Open file"}
                disabled={busy}
                onPress={() => void openFile()}
              />
            ) : null}
          </View>
          {dirty ? (
            <Text style={styles.muted}>
              Save first to ask about your latest changes.
            </Text>
          ) : null}
          {status ? (
            <Text accessibilityLiveRegion="polite" style={styles.muted}>
              {status}
            </Text>
          ) : null}
          <Markdown
            style={{
              body: {
                color: colors.text,
                fontFamily: "SourceSans3_400Regular",
                fontSize: 18,
                lineHeight: 28,
              },
              heading1: {
                color: colors.markdown.heading1,
                fontFamily: "SourceSerif4_600SemiBold",
              },
              heading2: {
                color: colors.markdown.heading2,
                fontFamily: "SourceSans3_600SemiBold",
              },
              heading3: {
                color: colors.markdown.heading3,
                fontFamily: "SourceSans3_600SemiBold",
              },
              link: { color: colors.markdown.link },
              blockquote: {
                color: colors.markdown.quoteText,
                borderLeftColor: colors.markdown.quoteBorder,
                backgroundColor: colors.markdown.quoteBackground,
                paddingHorizontal: 12,
              },
              code_inline: {
                color: colors.markdown.codeText,
                backgroundColor: colors.markdown.codeBackground,
                borderColor: colors.markdown.codeBorder,
                borderWidth: 1,
                borderRadius: 4,
              },
              fence: {
                color: colors.markdown.codeText,
                backgroundColor: colors.markdown.codeBackground,
                borderColor: colors.markdown.codeBorder,
                borderWidth: 1,
                borderRadius: 6,
              },
            }}
            onLinkPress={(url) => {
              if (/^https?:\/\//i.test(url))
                void Linking.openURL(url).catch(() =>
                  setError("Could not open this link."),
                );
              return false;
            }}
          >
            {content ||
              (note.s3Key
                ? "Open the original file to read this course material."
                : "This note is waiting for your first idea.")}
          </Markdown>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}
