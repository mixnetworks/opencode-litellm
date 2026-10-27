# opencode-litellm (Mix Networks fork) — Design

## Goal

Fork of `yuseferi/opencode-litellm` (MIT) that makes the Mix Networks LiteLLM
proxy (`https://ai-proxy-lkd.whitelabelvoip.net`, VPN-only, no secrets in this
repo) the zero-config default for OpenCode at Mix Networks, and fixes the
upstream friction points we hit: arbitrary provider IDs are ignored, and the
default endpoint assumes a localhost LiteLLM.

## Acceptance

1. A provider block in `opencode.json` with **any** id (e.g. `ai-proxy-lkd`)
   whose `options.baseURL` points at a LiteLLM proxy gets models
   auto-discovered into the picker — no rename to `litellm` required.
2. With NO provider block at all, the plugin defaults to
   `https://ai-proxy-lkd.whitelabelvoip.net` (not localhost probing) and
   auto-creates the provider entry.
3. `npm test` + `npm run typecheck` pass on main.
4. Live verification (human-run): with the example config from README §Usage,
   `opencode run --print-logs 'say OK'` on the VPN shows discovered models in
   the picker and completes a chat request through the proxy.
5. README documents Mix install steps in ≤40 lines, including the
   `{file:~/.secrets/ai-proxy-lkd.txt}` API-key pattern.

## Post-upgrade state (v2)

2026-10: the fork merged upstream v1.8.0 and now supports OpenCode 1 and
OpenCode 2 from one package — `src/index.ts` default-exports the v2
`Plugin.define({ id: 'opencode-litellm', … })` and keeps the v1
`LiteLLMPlugin` / `LiteLLMResponsesPlugin` named exports. Decisions carried
into the v2 era:

- **Recognition of arbitrary ids works on both host versions** (structural
  match, upgrade audit §5(a)): `listMatchingProviders` (`src/plugin/v2.ts`)
  passes `provider.package` — the v2 field — into the fork's 3-arg
  `isLiteLLMProvider` (v1 callers pass the `npm` field), and
  `OPENAI_COMPATIBLE_NPM` (`src/plugin/index.ts`) now lists
  `@opencode/ai/providers/openai-compatible` alongside
  `@ai-sdk/openai-compatible` / `@ai-sdk/openai`. The rule is unchanged:
  an openai-compatible package with an explicit `baseURL` string is a
  LiteLLM candidate, so `ai-proxy-lkd` is discovered the same way on 1.x
  and 2.x.
- **Base-URL precedence (D1), three tiers, both paths**: explicit
  `providers.<id>.settings.baseURL` (or plugin `options.baseURL`) →
  `LITELLM_BASE_URL` (returned as configured, no health check) → the
  health-checked Mix proxy default `https://ai-proxy-lkd.whitelabelvoip.net`.
  `autoDetectLiteLLM` never probes localhost.
- **Plugin-option `providerID` / `baseURL` fallback is a
  documented-in-docs-only workaround.** On v2, when no configured provider
  matches, the plugin builds a provider source from plugin options alone.
  The recommended mechanism is the structural match above; the fallback
  path is fragile (upstream closed the PR that tried to formalize
  plugin-options provider declarations, and the reconcile interaction is
  only statically traced) — treat it as an emergency no-code escape hatch.
- **Double-load on v2** (upgrade audit B7): a clone directory plus a flat
  `.ts` symlink in `~/.config/opencode/plugins/` can both be discovered on
  2.x. Operator check: `opencode plugin list` must show the plugin once;
  if doubled, drop the symlink and declare the directory under `plugins`
  (explicit plugin paths must be directories). Documented in
  README §Install and verified in docs/LIVE-VERIFY.md.

The **Task Breakdown** table below is historical: it described the v1-era
project. The v2 upgrade plan and its task list live in
`docs/UPGRADE-2.0.md`.

## Verified facts (2026-09-25, do not re-derive)

- The Mix proxy serves BOTH `/v1/models` and `/v1/model/info` (HTTP 200, and
  `/model/info` at root too). **No endpoint-path changes are needed** for the
  Mix proxy itself.
- Upstream provider matching (`src/plugin/index.ts:isLiteLLMProvider`) only
  accepts id `litellm`, prefix `litellm-`/`litellm_`, or an options flag
  (`litellm`, `litellmCompatible`, `litellm-compatible`, `litellm_compatible`
  = true). A provider named `ai-proxy-lkd` with no flag is silently ignored —
  this was the likely cause of "doesn't work" at Mix.
- Upstream default when no baseURL is configured: probe localhost
  4000/8000/8080 (`src/utils/litellm-api.ts:autoDetectLiteLLM`,
  `DEFAULT_LITELLM_URL = http://localhost:4000`).
- OpenCode substitutes `{env:VAR}` and `{file:PATH}` in config values. Whether
  substitution happens BEFORE the plugin's `config` hook sees
  `options.apiKey` is UNVERIFIED — card 4 is a live spike that gates any code
  change. Note the plugin already writes the resolved key back into
  `actualOptions.apiKey`, so an unresolved literal `{file:...}` string would
  leak through to the AI SDK client and break chat — that's the failure mode
  to check for.

## Task Breakdown (card graph — historical, v1-era project)

| # | Title | Assignee | Parents |
|---|-------|----------|---------|
| 1 | Provider matching: accept any provider with openai-compatible npm + baseURL | coder | — |
| 2 | Verify endpoint paths against live Mix proxy (no code change expected) | tester | — |
| 3 | Default to Mix proxy; drop localhost auto-detect | coder | 1 |
| 4 | Spike: does `{file:}` resolve before the config hook? Add file support if not | coder | 1 |
| 5 | README rewrite: Mix Networks quickstart, trim upstream noise | writer | 1,3,4 |
| 6 | Review + merge all to main, full gate, live-verify instructions | reviewer | 1,2,3,4,5 |

Cards 1 and 2 are independent (seed first). 3 and 4 both touch files card 1
touches, so they chain after it (serial per worktree discipline). 5 documents
what 1/3/4 built. 6 gates everything and merges.

## Architecture / key decisions

- **Matching rule change (card 1):** keep all existing matches; ADD: a
  provider whose `npm` is `@ai-sdk/openai-compatible` (or
  `@ai-sdk/openai`) AND whose `options.baseURL` is a string is treated as a
  LiteLLM candidate. If discovery then fails (non-LiteLLM upstream), the
  plugin must log a warn and leave that provider untouched — never throw.
- **Default URL (card 3):** `DEFAULT_LITELLM_URL =
  'https://ai-proxy-lkd.whitelabelvoip.net'`. `autoDetectLiteLLM` returns the
  default when healthy, else null. No localhost probing anywhere. Update the
  warn message in `plugin/index.ts` accordingly.
- **API key from file (card 4):** ONLY if the spike shows `{file:}` arrives
  unresolved: add a resolver in the config hook — if `options.apiKey` matches
  /^\{file:(.+)\}$/, read that file (expand leading `~/`), trim, use contents.
  If the spike shows it arrives resolved, the card closes with a comment and
  no code change.
- Cache, merge, enrichment, SWR logic: unchanged from upstream.

## Conventions

- Repo: `/home/mmealman/Projects/opencode-plugins/opencode-litellm`
  (public GitHub repo `mixnetworks/opencode-litellm` — **never commit
  secrets, VPN hostnames beyond the already-public proxy URL, or internal
  infra details**).
- Gate: `npm test && npm run typecheck` (must pass before any card completes).
- Install deps first: `npm install`.
- TypeScript strict, no new runtime dependencies (only `@opencode-ai/plugin`).
- Tests: vitest, pure-logic style in `test/` mirroring upstream.
- Never log API keys or key-file contents.

## Out of scope

- OpenCode Desktop picker (upstream known limitation, issue #5).
- Publishing to npm (distribution is via git URL / local plugin dir).
- Upstreaming PRs (maybe later, tracked separately).
- `includeModels` splitting, Cloudflare Access headers — already upstream;
  keep working, don't extend.
