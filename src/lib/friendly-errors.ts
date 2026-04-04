const normalize = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export const toFriendlyCanvasError = (value: unknown) => {
  const message = normalize(value).toLowerCase();

  if (!message) {
    return "We could not reach Canvas right now. Please try again.";
  }

  if (
    message.includes("token") ||
    message.includes("invalid") ||
    message.includes("unauthorized") ||
    message.includes("forbidden")
  ) {
    return "Canvas access needs to be reconnected. Please reconnect Canvas and try again.";
  }

  if (message.includes("timeout") || message.includes("network")) {
    return "Canvas is taking longer than expected. Please try again in a moment.";
  }

  return "Canvas sync hit an issue. Please try again.";
};

export const toFriendlyCanvasLogMessage = (value: unknown) => {
  const message = normalize(value).toLowerCase();

  if (!message) {
    return "This file could not be imported.";
  }

  if (
    message.includes("marker") ||
    message.includes("cold start") ||
    message.includes("timeout")
  ) {
    return "The document processor is still warming up.";
  }

  if (
    message.includes("forbidden") ||
    message.includes("permission") ||
    message.includes("access denied")
  ) {
    return "Canvas says this file is restricted for your account.";
  }

  return "This file could not be imported.";
};

export const toFriendlyChatError = (value: unknown) => {
  const message = normalize(value).toLowerCase();

  if (!message) {
    return "Something went wrong. Please try again.";
  }

  if (
    message.includes("failed to generate") ||
    message.includes("llm") ||
    message.includes("api key") ||
    message.includes("timeout") ||
    message.includes("502") ||
    message.includes("aborted")
  ) {
    return "AI is temporarily unavailable. Please try again in a minute.";
  }

  return "Something went wrong. Please try again.";
};
