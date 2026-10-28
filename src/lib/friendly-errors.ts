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

// first connect only. "reconnect" means nothing to someone who has never connected, and the
// server's reason says exactly what to fix
export const toFriendlyCanvasConnectError = (value: unknown) => {
  const message = normalize(value).toLowerCase();

  if (message.includes("invalid or expired canvas token")) {
    return "Canvas didn't accept that access token. In Canvas, go to Account, Settings, New access token, then copy and paste the whole token.";
  }
  if (message.includes("token and domain are required")) {
    return "Enter your Canvas address and access token.";
  }
  if (message.includes("token is too long")) {
    return "That doesn't look like a Canvas access token. Paste only the token Canvas generated.";
  }
  if (message.includes("valid https canvas address")) {
    return "Enter the address you use to log in to Canvas, for example universityofgalway.instructure.com.";
  }
  if (message.includes("canvas api error: 404")) {
    return "Canvas wasn't found at that address. Use the address you log in to Canvas with.";
  }
  if (message.includes("access restricted")) {
    return "Canvas wouldn't let this token list your courses. Ask your school's Canvas admin whether access tokens are allowed.";
  }

  return toFriendlyCanvasError(value);
};

export const toFriendlyCanvasLogMessage = (value: unknown, courseSection = false) => {
  const message = normalize(value).toLowerCase();

  if (!message) {
    return courseSection ? "This Canvas section could not be checked." : "This file could not be imported.";
  }

  if (/\b(404|410)\b|not found|unavailable/.test(message)) {
    return courseSection ? "Canvas did not make this section available to your account. Other material was still checked."
      : "Canvas did not make this file available to your account. Other files will continue.";
  }
  if (/rate limit|\b429\b/.test(message)) {
    return "Canvas is limiting requests. Try this item again later.";
  }
  if (message.includes("metadata")) {
    return "Canvas did not provide enough information to import this file. Try it again later.";
  }
  if (message.includes("discovery did not finish")) {
    return "The Canvas check stopped before this file was processed. Try this file again.";
  }
  if (courseSection) {
    return "This Canvas section could not be checked. Other material was still processed. Try checking for updates later.";
  }

  if (
    message.includes("marker") ||
    message.includes("cold start")
  ) {
    return "The document processor is still warming up.";
  }

  if (message.includes("timeout") || message.includes("timed out")) {
    return "This item took too long to process. Try it again later.";
  }

  if (
    message.includes("forbidden") ||
    message.includes("permission") ||
    message.includes("access denied") ||
    message.includes("restricted") ||
    message.includes("locked") ||
    message.includes("hidden")
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
