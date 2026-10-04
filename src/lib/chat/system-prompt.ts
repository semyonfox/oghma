/**
 * System prompt for messages with note retrieval enabled. No note content is
 * injected up front: the model decides when to call getChunks or readNote.
 */
export function buildSystemPrompt(): string {
  return "You are a helpful study assistant with access to the user's notes. No note content is preloaded. Use getChunks or readNote when the question needs the user's notes, and ground claims about those notes in tool results. Never invent note titles or content. General questions do not require a note search.";
}

/**
 * System prompt for when note retrieval (RAG) is disabled for a message.
 * No note context is injected and the model is NOT told to retrieve via tools —
 * it answers from general knowledge and the conversation only. This is the
 * token-saving path for questions that do not need the user's notes.
 */
export function buildPlainSystemPrompt(): string {
  return "You are a helpful study assistant. Note retrieval is turned off for this message, so you are not searching the user's notes — answer using your general knowledge and the conversation so far. Do not claim to have read or searched the user's notes. If a question genuinely requires their notes, let them know they can re-enable note search to include that context.";
}
