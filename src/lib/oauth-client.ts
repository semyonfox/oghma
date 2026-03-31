type OAuthProviderMap = Record<string, unknown> | null | undefined;

export function isOAuthProviderConfigured(
  providerId: string,
  providers: OAuthProviderMap,
) {
  if (!providers) return false;
  return Object.prototype.hasOwnProperty.call(providers, providerId);
}

export function buildOAuthSignInOptions(callbackUrl = "/notes") {
  return { callbackUrl, redirect: true as const };
}
