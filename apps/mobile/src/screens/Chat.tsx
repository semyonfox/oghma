import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { z } from "zod";
import { json, readStream, request } from "../lib/api";
import {
  conversationSchema,
  generationSchema,
  sessionsSchema,
  type Conversation,
  type Note,
} from "../lib/contracts";
import {
  Button,
  Empty,
  ErrorBox,
  Field,
  IconButton,
  Loading,
  message,
} from "../ui";
import { useTheme } from "../lib/theme";

type Session = z.infer<typeof sessionsSchema>["sessions"][number];
export function Chat({
  scope,
  clearScope,
  onExit,
}: {
  scope?: Note;
  clearScope: () => void;
  onExit: () => void;
}) {
  const { colors, styles } = useTheme();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [composing, setComposing] = useState(!!scope);
  const [input, setInput] = useState("");
  const [generation, setGeneration] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reconnect, setReconnect] = useState(0);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const mounted = useRef(true);
  const scroll = useRef<ScrollView>(null);
  const followLatest = useRef(true);
  const [listing, setListing] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const list = useCallback(async () => {
    setListing(true);
    setError("");
    try {
      setSessions((await json("/api/chat/sessions", sessionsSchema)).sessions);
    } catch (e) {
      setError(message(e));
    } finally {
      setListing(false);
    }
  }, []);
  useEffect(() => {
    void list();
  }, [list]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => subscription.remove();
  }, []);
  const open = async (id: string) => {
    setBusy(true);
    setError("");
    setReply("");
    followLatest.current = true;
    try {
      const loaded = await json(`/api/chat/sessions/${id}`, conversationSchema);
      setConversation(loaded);
      setComposing(true);
      setGeneration(loaded.session.active_generation_id || null);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const back = useCallback(() => {
    if (busy) return;
    setComposing(false);
    setConversation(null);
    setGeneration(null);
    setReply("");
    setInput("");
    clearScope();
    void list();
  }, [busy, clearScope, list]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (composing) back();
        else onExit();
        return true;
      },
    );
    return () => subscription.remove();
  }, [back, composing, onExit]);

  const activeSessionId = conversation?.session.id;
  useEffect(() => {
    if (!generation || !activeSessionId || !foreground) return;
    const controller = new AbortController();
    const sessionId = activeSessionId;
    setReply("");
    setStatus("Thinking…");
    setError("");
    void (async () => {
      try {
        await readStream(generation, controller.signal, (event) => {
          if (controller.signal.aborted) return;
          if (event.event === "token") {
            const token = z.object({ text: z.string() }).parse(event.data);
            setReply((current) => current + token.text);
            setStatus("Writing…");
          }
          if (event.event === "tool-call")
            setStatus("Checking your study material…");
          if (event.event === "error") {
            const detail = z
              .object({ message: z.string() })
              .safeParse(event.data);
            setError(
              detail.success ? detail.data.message : "Generation failed.",
            );
          }
        });
        if (controller.signal.aborted) return;
        const updated = await json(
          `/api/chat/sessions/${sessionId}`,
          conversationSchema,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setConversation(updated);
        setGeneration(updated.session.active_generation_id || null);
        setReply("");
        setStatus("");
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(message(e));
          setStatus(
            "Connection interrupted. Your answer may still be running.",
          );
        }
      }
    })();
    return () => controller.abort();
    // Only the session identity matters here, not a refreshed history object.
  }, [generation, activeSessionId, foreground, reconnect]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy || generation) return;
    setBusy(true);
    setError("");
    try {
      const job = await json("/api/chat", generationSchema, {
        method: "POST",
        body: JSON.stringify({
          message: text,
          background: true,
          sessionId: conversation?.session.id,
          ...(scope && !conversation
            ? { noteId: scope.id, noteTitle: scope.title }
            : {}),
        }),
      });
      if (!mounted.current) return;
      followLatest.current = true;
      setInput("");
      // The queued worker may not have persisted the user message yet.
      setConversation((current) => ({
        session: current?.session || {
          id: job.sessionId,
          title: text,
          generation_status: "queued",
          active_generation_id: job.generationId,
        },
        messages: [
          ...(current?.messages || []),
          { id: `pending-${job.generationId}`, role: "user", content: text },
        ],
      }));
      setGeneration(job.generationId);
    } catch (e) {
      if (mounted.current)
        setError(
          `${message(e)} If the connection dropped while sending, check your conversations before retrying.`,
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const stop = async () => {
    if (!generation) return;
    setBusy(true);
    setError("");
    try {
      await request(`/api/chat/generations/${generation}/cancel`, {
        method: "POST",
      });
      setStatus("Stopping…");
      setReconnect((value) => value + 1);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  if (!composing)
    return (
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={listing}
            onRefresh={() => void list()}
            tintColor={colors.accent}
          />
        }
      >
        <Text style={styles.label}>A LITTLE HELP, WHEN YOU NEED IT</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Study chat
        </Text>
        <Text style={styles.muted}>
          Ask a question. Work through an idea. Come back to it later.
        </Text>
        <Button
          title="New conversation"
          disabled={busy}
          onPress={() => {
            clearScope();
            setConversation(null);
            setComposing(true);
            setError("");
          }}
        />
        {error ? <ErrorBox message={error} retry={() => void list()} /> : null}
        {(listing && sessions.length === 0) || busy ? (
          <Loading />
        ) : sessions.length === 0 ? (
          <Empty title="Start with a question">
            Your conversations will appear here and on the website.
          </Empty>
        ) : (
          sessions.map((session) => (
            <Pressable
              key={session.id}
              accessibilityRole="button"
              onPress={() => void open(session.id)}
              style={({ pressed }) => [
                styles.card,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={styles.heading}>
                {session.title || "Untitled conversation"}
              </Text>
              <Text style={styles.muted}>
                {["queued", "generating"].includes(session.generation_status)
                  ? "Answer in progress"
                  : "Continue conversation"}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    );
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.bar}>
        <IconButton
          name="arrow-back"
          label="All conversations"
          onPress={back}
        />
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[styles.heading, { flex: 1 }]}
        >
          {scope?.title || conversation?.session.title || "Study chat"}
        </Text>
      </View>
      <ScrollView
        ref={scroll}
        onContentSizeChange={() => {
          if (followLatest.current)
            scroll.current?.scrollToEnd({ animated: false });
        }}
        onScroll={({ nativeEvent }) => {
          const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
          followLatest.current =
            contentSize.height - contentOffset.y - layoutMeasurement.height <
            80;
        }}
        scrollEventThrottle={32}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {!conversation?.messages.length ? (
          <Empty
            title={scope ? "Ask about this note" : "What are you working on?"}
          >
            {scope
              ? "This conversation starts with the selected note as context."
              : "Ask about your course material or work through a study question."}
          </Empty>
        ) : (
          conversation.messages
            .filter((item) => item.role !== "system")
            .map((item) => (
              <View
                key={item.id}
                style={[
                  styles.card,
                  item.role === "user"
                    ? { backgroundColor: colors.selected, marginLeft: 24 }
                    : { marginRight: 8 },
                ]}
              >
                <Text style={styles.label}>
                  {item.role === "user" ? "YOU" : "OGHMA"}
                </Text>
                <Markdown
                  style={{
                    body: {
                      fontFamily: "SourceSans3_400Regular",
                      fontSize: 17,
                      lineHeight: 25,
                      color: colors.text,
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
                        setError("Could not open link."),
                      );
                    return false;
                  }}
                >
                  {item.content}
                </Markdown>
              </View>
            ))
        )}
        {generation ? (
          <View style={styles.card}>
            <Text accessibilityLiveRegion="polite" style={styles.muted}>
              {status}
            </Text>
            {reply ? (
              <Markdown
                style={{
                  body: {
                    fontFamily: "SourceSans3_400Regular",
                    fontSize: 17,
                    lineHeight: 25,
                    color: colors.text,
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
                onLinkPress={() => false}
              >
                {reply}
              </Markdown>
            ) : (
              <Loading />
            )}
          </View>
        ) : null}
        {error ? (
          <ErrorBox
            message={error}
            retry={
              generation ? () => setReconnect((value) => value + 1) : undefined
            }
          />
        ) : null}
      </ScrollView>
      <View
        style={[
          styles.row,
          {
            borderTopWidth: 1,
            borderColor: colors.border,
            padding: 10,
            alignItems: "flex-end",
          },
        ]}
      >
        <Field
          accessibilityLabel="Message"
          multiline
          value={input}
          onChangeText={setInput}
          placeholder="Ask Oghma…"
          maxLength={10000}
          style={{ flex: 1, maxHeight: 120 }}
        />
        <IconButton
          name={generation ? "stop-circle" : "send"}
          label={
            generation
              ? "Stop answer"
              : busy
                ? "Sending message"
                : "Send message"
          }
          disabled={busy || (!generation && !input.trim())}
          onPress={() => (generation ? void stop() : void send())}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
