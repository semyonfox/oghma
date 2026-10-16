import pupa from "pupa";
import {
  baseLocaleDictionary,
  type LocaleDictionary,
} from "@/lib/i18n/locale-data";

export type Translate = (
  key: string,
  params?: Record<string, unknown>,
) => string;

/**
 * Shared by the server renderer and the client provider so both resolve the
 * same text for the same key. A mismatch here is a hydration mismatch.
 * Missing translations fall back to English, then to the key itself, and a
 * placeholder without a value stays visible instead of throwing mid-render.
 */
export function translate(
  dictionary: LocaleDictionary,
  key: string,
  params: Record<string, unknown> = {},
): string {
  const template = Object.hasOwn(dictionary, key)
    ? dictionary[key]
    : Object.hasOwn(baseLocaleDictionary, key)
      ? baseLocaleDictionary[key]
      : key;
  return template.includes("{")
    ? pupa(template, params, { ignoreMissing: true })
    : template;
}
