export function extractProviderText(payload: any): string {
  return payload?.choices?.[0]?.delta?.content ?? "";
}
