const { withAppBuildGradle } = require("expo/config-plugins");

// Credentials stay in the local build environment, never in generated source.
module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    const source = config.modResults.contents;
    if (source.includes("signingConfig signingConfigs.alpha")) return config;
    const marker = "signingConfig signingConfigs.debug";
    const releaseStart = source.indexOf(
      "release {",
      source.indexOf("buildTypes"),
    );
    const position = source.indexOf(marker, releaseStart);
    if (releaseStart < 0 || position < 0)
      throw new Error(
        "Android release signing template changed. Review the generated Gradle file.",
      );
    config.modResults.contents =
      source.slice(0, position) +
      "signingConfig signingConfigs.alpha" +
      source.slice(position + marker.length);
    config.modResults.contents = config.modResults.contents.replace(
      "signingConfigs {",
      `signingConfigs {
        alpha {
            storeFile file(System.getenv("OGHMA_ANDROID_KEYSTORE") ?: "missing-alpha.keystore")
            storePassword System.getenv("OGHMA_ANDROID_KEY_PASSWORD")
            keyAlias "oghma-alpha"
            keyPassword System.getenv("OGHMA_ANDROID_KEY_PASSWORD")
        }`,
    );
    return config;
  });
};
