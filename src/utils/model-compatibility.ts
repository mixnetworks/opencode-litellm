import type { ModelHints } from './model-cache'

/**
 * Values `cacheFormat` accepts. Validated here because OpenCode validates
 * plugin-registered models only when it serializes them, where one bad
 * value fails the whole model list.
 */
const CACHE_FORMATS: ReadonlySet<string> = new Set(['anthropic', 'alibaba'])

/** `null` removes the `cacheFormat` the plugin inferred. */
export interface CompatibilityOverride {
  cacheFormat: string | null
}

/** Per-model compatibility overrides keyed by exact model id. */
export type ModelCompatibility = Record<string, CompatibilityOverride>

/**
 * Defensively parse the `modelCompatibility` provider option. Non-object
 * input, non-object per-model values and values outside the accepted set
 * are dropped; `null` is kept.
 */
export function parseModelCompatibility(raw: unknown): ModelCompatibility {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: ModelCompatibility = {}
  for (const [modelId, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const { cacheFormat } = entry as Record<string, unknown>
    if (cacheFormat === null || (typeof cacheFormat === 'string' && CACHE_FORMATS.has(cacheFormat))) {
      out[modelId] = { cacheFormat }
    }
  }
  return out
}

/**
 * Compatibility OpenCode 2 needs for a discovered model, from what the
 * proxy reported about its upstream. Only the Chat Completions runtimes
 * read `cacheFormat`: Anthropic Messages adds its own cache breakpoints
 * and the Responses runtimes do not use the setting.
 */
export function inferCompatibility(
  hints: ModelHints | undefined,
  chatCompletions: boolean,
): Record<string, string> {
  if (chatCompletions && hints?.acceptsCacheControl) return { cacheFormat: 'anthropic' }
  return {}
}

/**
 * Overlay a user override on inferred compatibility. `null` deletes the
 * key. Returns `undefined` when nothing remains so callers can leave
 * `compatibility` unset.
 */
export function resolveCompatibility(
  inferred: Record<string, string>,
  override?: CompatibilityOverride,
): Record<string, string> | undefined {
  const out: Record<string, string> = { ...inferred }
  if (override) {
    if (override.cacheFormat === null) delete out.cacheFormat
    else out.cacheFormat = override.cacheFormat
  }
  return Object.keys(out).length > 0 ? out : undefined
}
