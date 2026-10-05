import type { ConfigContext, ExpoConfig } from "expo/config";

const productionOrigin = "https://oghmanotes.ie";
const projectId = "19f00fe9-7dc5-4dda-bc4a-d6bca738852f";

export default ({ config }: ConfigContext): ExpoConfig => {
  // keep builds for other website origins off the production update stream
  const configuredOrigin = process.env.EXPO_PUBLIC_API_URL;
  const channel =
    !configuredOrigin || new URL(configuredOrigin).origin === productionOrigin
      ? "production"
      : "preview";

  return {
    ...config,
    name: config.name ?? "OghmaNotes Alpha",
    slug: config.slug ?? "oghmanotes-alpha",
    owner: "foxscope",
    runtimeVersion: { policy: "appVersion" },
    updates: {
      url: `https://u.expo.dev/${projectId}`,
      requestHeaders: { "expo-channel-name": channel },
    },
    extra: { ...config.extra, eas: { projectId } },
  };
};
