# Upgrade audit: fork → upstream v1.8.0 (OpenCode 2 support)

Audit of `mixnetworks/opencode-litellm` (this fork, 6 commits ahead of fork point
`c930c4d`) against upstream `yuseferi/opencode-litellm` v1.8.0 (`a107a8f`, 25
commits ahead). Purpose: give the coder cards everything they need to port the
fork to OpenCode 2 without re-deriving the merge. This document does not change
any code on `main`; the merge was rehearsed in a throwaway clone only.

**How to read the citations**

- `path:line` on its own = this fork's tree (`wt/t_9363333a`, at `7737a7c`).
- `upstream <path>:<line>` = the file at `upstream/main` (`a107a8f`).
- `merged <path>:<line>` = the conflict-resolved merge rehearsal tree
  (`merge-trial-r2`, commit state described in §1).
- `command → output` = a command actually run during this audit and its result.

**Standing decisions (restated, not relitigated)**

- **D1** Base-URL precedence on both v1 and v2 paths: explicit
  `settings.baseURL` / `options.baseURL` → `LITELLM_BASE_URL` env → Mix proxy
  fallback `https://ai-proxy-lkd.whitelabelvoip.net`. Never probe localhost.
- **D2** The user's `~/.config/opencode` migrates to the native v2 shape and is
  verified live on opencode 2.1.3; the plugin keeps working for v1-shaped
  installs for other users.
- **D3** Nothing is pushed to origin; the reviewer merges locally and stops.

---

## 1. Merge rehearsal

Performed in a throwaway clone (now at
`~/.hermes/profiles/auditor/cache/scratch/merge-trial-r2-t9363333a`; cloned
from the local `main`, upstream remote re-fetched at `a107a8f`).

Command: `git merge upstream/main --no-edit` →

```
Auto-merging README.md
CONFLICT (content): Merge conflict in README.md
Auto-merging src/plugin/index.ts
Auto-merging src/utils/litellm-api.ts
CONFLICT (content): Merge conflict in src/utils/litellm-api.ts
Auto-merging src/plugin/v2.ts ...
Auto-merging test/litellm-api.test.ts
CONFLICT (content): Merge conflict in test/litellm-api.test.ts
Automatic merge failed; fix conflicts and then commit the result.
```

`MERGE_HEAD` = `a107a8fd5db640b6f1d3f53cd2093feba77a4aed` (v1.8.0). Exactly
three textual conflicts, matching the earlier rehearsal:

| File | Conflict hunks (marker lines in the merged tree) |
| --- | --- |
| `README.md` | `<<<<<<<` at 21 and 711 |
| `src/utils/litellm-api.ts` | `<<<<<<<` at 160 (one hunk, the `autoDetectLiteLLM` docstring + body) |
| `test/litellm-api.test.ts` | `<<<<<<<` at 2 (imports) and 18 (whole-body hunk, HEAD block lines 19, upstream block lines 21–297) |

### 1.1 Files that changed silently (auto-merged, no conflict)

`git status --short` during the merge, staged side (`A`/`M` = came in or
changed from upstream):

- Added: `.github/workflows/plugin-scan.yml`, `SECURITY.md`,
  `src/plugin/integration.ts`, `src/plugin/v2.ts`,
  `src/utils/model-compatibility.ts`, `src/utils/reasoning-efforts.ts`,
  `src/utils/transport.ts`, `test/model-compatibility.test.ts`,
  `test/plugin-integration.test.ts`, `test/plugin-v1.test.ts`,
  `test/plugin-v2.test.ts`, `test/transport.test.ts`.
- Modified: `.github/workflows/ci.yml`, `.github/workflows/release.yml`,
  `CHANGELOG.md`, `CONTRIBUTING.md`, `assets/architecture.svg`,
  `package-lock.json`, `package.json`, `src/index.ts`, `src/plugin/index.ts`,
  `src/types/index.ts`, `src/utils/format-model-name.ts`, `src/utils/index.ts`,
  `src/utils/model-cache.ts`, `test/model-cache.test.ts`,
  `test/to-config-model.test.ts`.

Two silent changes matter for the fork (details in §2):

- `package.json` gains `"@opencode/plugin": "^2.0.14"` (merged
  `package.json:42`) while keeping `"@opencode-ai/plugin": "^1.14.0"`
  (`package.json:41`).
- `src/index.ts` becomes `export { default } from './plugin/v2'` plus the v1
  named exports (merged `src/index.ts:1-3`): the package's **default export
  switches from the v1 plugin to the v2 definition**. Any install that loads
  `src/index.ts` on OpenCode 2 now runs the v2 code path — that is what drags
  every fork delta in `src/plugin/index.ts` onto the v2 path (§2).

### 1.2 Conflict-by-conflict resolution direction

**`README.md`** — fork wins, then re-add upstream's OpenCode 2 / Desktop
material.

- Hunk 1 (`README.md:21-28`): HEAD is the fork's install instructions (clone +
  symlink, mixnetworks clone URL, `sst/opencode#8763` warning); upstream's side
  is its marketing/features block. **Take HEAD**; splice upstream's
  feature-table rows that describe v2 behavior (Responses-API routing, prompt
  caching, `/connect`, Desktop) into the fork's feature list, reworded to the
  Mix-proxy reality (no localhost auto-detect).
- Hunk 2 (`README.md:711-729`): HEAD is `## Usage`; upstream's side is the
  `src/` directory-map block (which lists `plugin/v2.ts`,
  `model-compatibility.ts`, etc.). **Take HEAD** and add an updated directory
  map that includes the new v2 files after the merge.

**`src/utils/litellm-api.ts`** — the single hunk is `autoDetectLiteLLM`. Fork
side: health-check `DEFAULT_LITELLM_URL` (the Mix proxy) and return it when
healthy, else `null` — no localhost probing (fork `src/utils/litellm-api.ts:181-184`).
Upstream side: return `process.env.LITELLM_BASE_URL` first with no health
check, then probe localhost 4000/8000/8080 (upstream `src/utils/litellm-api.ts:181-195`).

Resolution implemented in the rehearsal (implements D1 exactly):

```ts
export async function autoDetectLiteLLM(apiKey?: string, customHeaders?: Record<string, string>): Promise<string | null> {
  const configuredBaseURL = process.env.LITELLM_BASE_URL?.trim()
  if (configuredBaseURL) return normalizeBaseURL(configuredBaseURL)   // upstream's env-first, no health check
  if (await checkLiteLLMHealth(DEFAULT_LITELLM_URL, apiKey, customHeaders)) {
    return DEFAULT_LITELLM_URL                                        // fork's Mix default
  }
  return null                                                          // no localhost ports, ever
}
```

i.e. upstream's env-first line adopted verbatim, fork's Mix health-check kept,
upstream's port loop deleted. Note the env branch inherits upstream's
"returned with no health check" behavior — consistent with D1 (an explicit env
value is deliberate config, same tier as `settings.baseURL`).

**`test/litellm-api.test.ts`** — fork tests win as the base, then re-add
upstream's new test sections with two adaptations:

- Hunk 1 (imports, lines 2-12): take HEAD's import list and add upstream's
  `discoverLiteLLMModelInfo` (used by upstream's new reasoning-effort tests).
- Hunk 2 (lines 18-298): HEAD side is the fork's whole file (incl. its
  autoDetect tests asserting the Mix default); upstream's side brings
  `describe('reasoning-effort discovery')`, `describe('restricted reasoning
  models')`, and the timeout/normalize/buildAPIURL suites
  (`upstream test/litellm-api.test.ts:11,181,287,305,325`). Re-add the
  upstream describes, then rewrite the two assertions that contradict the fork:
  `normalizeBaseURL ... defaults to localhost:4000`
  (`upstream test/litellm-api.test.ts:320`) must assert the Mix URL, and any
  auto-detect test must encode D1 (env short-circuit; healthy Mix proxy
  returned; unhealthy → `null`, never a localhost port).
- The `afterEach` conflict (`vi.restoreAllMocks()` vs `vi.unstubAllGlobals()`)
  resolves to whichever the re-added sections need — `unstubAllGlobals` where
  upstream tests stub `fetch` via `vi.stubGlobal`, `restoreAllMocks` for the
  fork's `vi.spyOn` tests; keeping both lines is safe.

---

## 2. Semantic break list (compiles-but-breaks / breaks at runtime after merge)

All items below were verified in the rehearsal tree after resolving the three
conflicts as in §1.2 (`npm install` then the gate).

**B1 — `isLiteLLMProvider` arity break (verified by tsc).**
Fork signature is 3-arg `(providerId, npm, options)` (fork
`src/plugin/index.ts:128-132`); upstream changed it to 2-arg
`(providerId, options)` (upstream `src/plugin/index.ts:132-134`) and its v1
call site followed (upstream `src/plugin/index.ts:735`:
`isLiteLLMProvider(id, options)`). Git auto-merged `src/plugin/index.ts` with
**the fork's 3-arg signature surviving** (merged `src/plugin/index.ts:148`,
fork call site at merged `:758` still 3-arg) — but upstream's new
`src/plugin/v2.ts` calls it with 2 args (merged `src/plugin/v2.ts:620`:
`isLiteLLMProvider(provider.id, asRecord(provider.settings))`).

- Compile: `npm run typecheck` on the resolved rehearsal tree →
  `src/plugin/v2.ts(620,7): error TS2554: Expected 3 arguments, but got 2.`
  (the only tsc error).
- Runtime (if TS were bypassed): `npm` receives the settings record and
  `options` is `undefined`, so `options.litellm` at fork
  `src/plugin/index.ts:137` throws `TypeError: Cannot read properties of
  undefined`. The v2 host would fail every provider pass.
- Reproduction: resolve conflicts per §1.2, run `npm run typecheck`.

**B2 — structural provider match can never fire on v2 (the `ai-proxy-lkd`
silently-ignored bug returns).**
The fork's structural match keys on `npm ∈ {'@ai-sdk/openai-compatible',
'@ai-sdk/openai'}` (fork `src/plugin/index.ts:117`, checked at `:152-155`).
On OpenCode 2 a provider declares `package` and `settings`, not `npm`/`options`
(v2 docs: `providers.<id>.package = "@opencode/ai/providers/openai-compatible"`
+ `settings.baseURL` — https://opencode.ai/v2/docs/providers §Custom; upstream
v2 code uses the same shape, merged `src/plugin/v2.ts:41`
`OPENAI_COMPATIBLE_PACKAGE = '@opencode/ai/providers/openai-compatible'`, and
`v2.ts:423` `provider?.package || OPENAI_COMPATIBLE_PACKAGE`). No v2 provider
ever carries an `npm` field, so `isOpenAICompatible` is always false and the
only surviving matches are the name/flag ones. The user's provider
`ai-proxy-lkd` (arbitrary id, no `litellm` prefix) is then invisible to
`listMatchingProviders` (merged `src/plugin/v2.ts:616-626`) and gets no
discovered models — the exact bug the fork exists to fix, back on v2.
Reproduction: static — read the two field names side by side; no test can
currently catch it because B1 blocks compilation first.

**B3 — localhost auto-detect returns with the merge unless D1 is re-asserted
(verified by test failure).**
Upstream's `autoDetectLiteLLM` probes localhost 4000/8000/8080 (upstream
`src/utils/litellm-api.ts:186-194`), and upstream's new
`test/plugin-integration.test.ts` depends on that behavior. With the D1
resolution of §1.2 in place: `npm test` on the rehearsal tree →
`Test Files 1 failed | 11 passed (12)`, `Tests 1 failed | 134 passed (135)`:

```
FAIL test/plugin-integration.test.ts > connect dialog integration >
  replaces a keyless auto-detected fallback when the first credential is
  connected mid-session
AssertionError: expected [] to have a length of 1 but got +0
 ❯ test/plugin-integration.test.ts:518:24
    expect(registered).toHaveLength(1)
```

The test expects a keyless fallback provider registered at
`http://localhost:4000` via auto-detection; under D1 auto-detect returns
`null` when the Mix proxy is unreachable, so nothing is registered and the
host's own log line confirms it (`No LiteLLM proxy found. Configure
providers.litellm.settings.baseURL or start LiteLLM on port 4000/8000/8080.`).
The coder card must rewrite this test to D1 semantics (stub the Mix health
check to succeed → fallback registered at the Mix URL; stub it to fail → no
fallback).

**B4 — `DEFAULT_LITELLM_URL` / `normalizeBaseURL` default divergence vs
upstream (verified by reading both trees).**
Fork: `DEFAULT_LITELLM_URL = 'https://ai-proxy-lkd.whitelabelvoip.net'` (fork
`src/utils/litellm-api.ts:4`) and `normalizeBaseURL(baseURL =
DEFAULT_LITELLM_URL)` (fork `:34`). Upstream:
`DEFAULT_LITELLM_URL = 'http://localhost:4000'` (upstream
`src/utils/litellm-api.ts:5`). The auto-merge keeps the fork's default
(verified: merged `src/utils/litellm-api.ts:4,34`), which is what we want —
but it means upstream's `defaults to localhost:4000` test assertion
(`upstream test/litellm-api.test.ts:320`) cannot be re-added verbatim (§1.2).
D1 keeps the fork's default; the only action is the test adaptation.

**B5 — `LITELLM_BASE_URL` env is unread on the fork's v1 path today (functional
gap vs upstream, fixed by the §1.2 resolution).**
Fork `autoDetectLiteLLM` never reads the env var (fork
`src/utils/litellm-api.ts:181-184`); upstream returns it first with no health
check (upstream `:182-184`). The §1.2 resolution adopts upstream's line, which
also gives the v2 path its env tier: the v2 base-URL chain is
`settings.baseURL` (plugin options merged in at `src/plugin/v2.ts:326`) →
dialog `connected.baseURL` → `autoDetectLiteLLM` (merged `src/plugin/v2.ts:369-376`),
so D1's full precedence (explicit → env → Mix) lands on v2 through the shared
util. Verified statically: `src/plugin/v2.ts:27` imports `autoDetectLiteLLM`
from `../utils/litellm-api`, and `:376` is the only detection call on the v2
path.

**B6 — cosmetic: stale log copy on v2.**
`src/plugin/v2.ts:746-748` logs "start LiteLLM on port 4000/8000/8080" — wrong
advice under D1 (the coder card that touches v2 copy should reword it to
"configure `providers.<id>.settings.baseURL` or set `LITELLM_BASE_URL`").
No behavioral effect.

**B7 — double-load risk of the current local install form on v2 (needs live
verify — flagged for the tester card, not resolvable statically).**
The user's install is a full clone at
`~/.config/opencode/plugins/opencode-litellm/` plus a flat symlink
`~/.config/opencode/plugins/opencode-litellm.ts → …/src/index.ts` (verified:
`ls -la ~/.config/opencode/plugins/`). OpenCode v2 docs say the plugins
directory loads "direct `.ts` and `.js` files and immediate plugin package
directories" (https://opencode.ai/v2/docs/plugins §Discover). The symlink
file loads as before, but the clone subdirectory may now *also* be discovered
as a plugin package directory — same plugin id from two sources. The v2 docs'
duplicate rule covers "npm packages with the same name and version", not a
file + directory pair. Live check required: `opencode plugin list` after the
upgrade must show the plugin once. If doubled, drop the symlink and point
`plugins` at the directory (paths must be directories;
https://opencode.ai/v2/docs/plugins §Configure).

**B8 — config-directory dependency pin.**
`~/.config/opencode/package.json` currently pins only
`"@opencode-ai/plugin": "1.18.21"` (the v1 API). After the upgrade the plugin
imports `@opencode/plugin` (v2). Resolution walks up from the plugin file's
real location (`~/.config/opencode/plugins/opencode-litellm/node_modules`,
populated by the repo's own `npm install`, which now includes
`@opencode/plugin ^2.0.14`), so the config-dir pin does not block loading —
but if the plugin ever moves out of the repo dir, the config-dir
`package.json` needs `@opencode/plugin` added (v2 plugins docs §Dependencies:
local plugins resolve deps from the config directory's `package.json`).

**Gate on the rehearsal tree (the "merged-but-resolved" state, per §1.2):**

- `npm run typecheck` → 1 error: `src/plugin/v2.ts(620,7): error TS2554:
  Expected 3 arguments, but got 2.`
- `npm test` → 135 tests / 12 files: 134 passed, 1 failed (B3).

That is the complete post-merge repair surface: one compile error, one test to
re-home, plus the B2 functional gap that compiles clean and must be fixed by
design (§5).

---

## 3. v2 host contract

All claims cite the OpenCode 2 docs (https://opencode.ai/v2/docs/…) or
upstream code, not memory.

1. **Entry shape.** A V2 plugin default-exports `Plugin.define({ id, async
   setup(ctx) { … } })`; `setup` registers hooks/transforms/subscriptions via
   the context, and a stable `id` scopes storage and diagnostics
   (https://opencode.ai/v2/docs/build/plugins/migrate-v1 §Replace the
   entrypoint). Upstream's v2 definition: `Plugin.define({ id:
   'opencode-litellm', async setup(context) { … } })` (merged
   `src/plugin/v2.ts:714-715`), guarding `if (!context.provider) return` for
   hosts without the provider domain (`:721-723`).
2. **Dual v1+v2 from one package is officially supported.** "A package can
   temporarily expose both implementations from one default export. V1 calls
   `server()` and V2 calls `setup()`"; V1 object entrypoints are supported in
   OpenCode ≥ 1.18.29 (https://opencode.ai/v2/docs/build/plugins/migrate-v1 §
   Support V1 and V2 from one package). Upstream `src/index.ts` does exactly
   this: default = v2 definition, named exports = v1 `LiteLLMPlugin` /
   `LiteLLMResponsesPlugin` (merged `src/index.ts:1-3`).
3. **Dependency pin.** `@opencode/plugin ^2.0.14` (merged `package.json:42`),
   alongside the retained `@opencode-ai/plugin ^1.14.0` for the v1 entry
   (`package.json:41`). The migration guide says published plugins should
   depend on "a version of `@opencode/plugin` compatible with the OpenCode
   release they target" — pin what upstream pinned; do not drift.
4. **Config keys.** v2 renames `plugin` → `plugins` and `provider` →
   `providers`, with `providers.<id>.package` + `settings` replacing
   `npm` + `options` (https://opencode.ai/v2/docs/migrate-v1 §Plugins and
   §Providers; the v2 spec states the singular keys are *not* preserved as
   keys — github.com/anomalyco/opencode `specs/v2/config.md`). However:
   **V1 config remains supported** — "It normalizes supported V1 and native
   V2 fields in memory without rewriting the source file… you do not need to
   convert it" (migrate-v1 §Use your existing configuration). So v1-shaped
   installs of this plugin keep working on 2.1.3, which is D2's "keep working
   for others" clause. The user's own config should still convert (D2), per
   §6.
5. **Local install form.** OpenCode 2 auto-loads direct `.ts`/`.js` files and
   immediate plugin package directories from `~/.config/opencode/plugins/`
   (global) and `.opencode/plugins/` (project)
   (https://opencode.ai/v2/docs/plugins §Discover). Explicitly configured
   local paths **must be directories** — "A path to a single file is skipped
   with a warning" (§Configure; migrate-v1 §Plugins). Consequence for the
   fork's README install (clone into `~/.config/opencode/plugins/opencode-litellm`
   + symlink `opencode-litellm.ts` → `src/index.ts`, fork `README.md:24-31`):
   the symlink-file part still loads on v2; the `plugins: ["<path>"]` config
   form would have to reference the directory. See B7 for the double-load
   caveat.
6. **npm install path.** `opencode plugin add opencode-plugin-litellm`
   installs from npm (plugins docs §Manage) — but upstream notes OpenCode 2
   support is not yet in the published npm package (`upstream README.md:61-63`
   "RFC status"), so until upstream publishes, npm installs get the old v1
   release. The fork's local install remains the supported form; do not
   advertise `plugin add` for the v2 build.
7. **`/connect` integration.** Upstream registers a LiteLLM integration for
   the connect-provider dialog (`registerLiteLLMIntegration`, merged
   `src/plugin/integration.ts:50`, called at `src/plugin/v2.ts:735-737`); a
   credential saved via `/connect` is applied through `integrationID` on the
   provider source (`src/plugin/v2.ts:800-802`) so the key never lands in
   config (upstream README auth section). This comes for free with the merge.

---

## 4. Fork delta status matrix

The fork's 6 commits (`git log --oneline c930c4d..main`):

| # | Commit | What | v1 path | v2 path | Survives the upgrade how |
| - | --- | --- | --- | --- | --- |
| 1 | `0b8b2c3` | Design doc + `AGENTS.md` | docs | docs | Keep as-is; add the v2 decisions (D1 on v2 via shared `autoDetectLiteLLM`, §5 recommendation) to `docs/DESIGN.md`. |
| 2 | `eaa9666` | Structural provider match (`isLiteLLMProvider` 3-arg + `OPENAI_COMPATIBLE_NPM`) | ✅ active (call site fork `src/plugin/index.ts:549`) | ❌ broken (B1 arity + B2 `package`-vs-`npm`) | Keep the 3-arg signature; point the v2 call site at it with `provider.package` as the `npm` argument and extend the package list (§5 recommendation (a)). New tests in `test/provider-matching.test.ts` for the v2 package names. |
| 3 | `da315a9` | Mix default + drop localhost probing | ✅ active (fork `src/utils/litellm-api.ts:4,181-184`) | ✅ active once the conflict is resolved (shared util, `src/plugin/v2.ts:27,376`) | Resolve the `litellm-api.ts` hunk per §1.2 (env-first + Mix health check, no ports). Rewrite upstream's localhost-dependent tests (B3, B4). |
| 4 | `e112448` | README rewrite | docs | docs | Fork wins both hunks; re-add upstream's v2/Desktop feature notes reworded for Mix (§1.2). |
| 5 | `832c063` | `docs/LIVE-VERIFY.md` | docs | docs | Keep; append v2 live-verify steps (§6.3). |
| 6 | `7737a7c` | Clone-URL fix | docs | docs | Inside README conflict hunk 1 — preserved by "fork wins". |

Nothing the fork added is obsolete; everything either survives textually (1,
4, 5, 6) or needs one targeted adaptation (2, 3).

---

## 5. Mechanism options for arbitrary-provider recognition on v2

The problem: `listMatchingProviders` (merged `src/plugin/v2.ts:616-626`) must
recognize `providers.ai-proxy-lkd` (arbitrary id, openai-compatible package,
`settings.baseURL`) so the plugin attaches discovered models to it.

### Option (a): extend the structural match to v2 `package` + `settings.baseURL`

Change the one upstream call site to keep the fork's 3-arg signature and feed
it the v2 fields:

```ts
// src/plugin/v2.ts, listMatchingProviders
return providers.filter((provider) =>
  isLiteLLMProvider(provider.id, provider.package, asRecord(provider.settings)),
)
```

and extend the package list:

```ts
const OPENAI_COMPATIBLE_NPM = [
  '@ai-sdk/openai-compatible',        // v1 npm field
  '@ai-sdk/openai',                   // v1 npm field
  '@opencode/ai/providers/openai-compatible', // v2 package field
] as const
```

The v2 `ProviderInfo` carries `package` (used at `src/plugin/v2.ts:423` and
written at `:761`), so no type change is needed. The structural predicate
itself (`npm != null && list.includes(npm) && typeof options.baseURL ===
'string'`) is unchanged — the fork's `test/provider-matching.test.ts` suite
keeps passing plus new cases for the v2 package string.

- Trade-offs: config stays the single source of truth (one `providers` block
  per provider, mirroring the v1 behavior the fork already ships); touches
  one line of upstream code + one constant → small merge surface for future
  upstream syncs. Risk: upstream may later rename/re-home the predicate, and
  the fork keeps carrying a signature divergence (as it already does today vs
  upstream's 2-arg form).
- Effort: ~5 lines + tests.

### Option (b): honor plugin-option `providerID` / `baseURL` (no predicate change)

Upstream's v2 fallback path already builds a source from plugin options alone
(`src/plugin/v2.ts:342-343` `id = provider?.id ?? pluginOptions.providerID …`;
settings merge `:326`; `:743` fallback when `sources.size === 0`). The user
would declare:

```jsonc
{ "plugins": [
  { "package": "~/.config/opencode/plugins/opencode-litellm",
    "options": { "providerID": "ai-proxy-lkd",
                 "baseURL": "https://ai-proxy-lkd.whitelabelvoip.net/v1" } }
] }
```

With no matched provider, the fallback publishes a source with id
`ai-proxy-lkd`, and the provider transform's `editor.update(source.id, …)`
attaches discovery to the host-registered provider of that id. Zero plugin
code beyond the B1 arity fix (which is required regardless — without it
`listMatchingProviders` throws on every pass).

- Trade-offs: no fork divergence in the matching predicate at all. But the
  baseURL/key are declared twice (provider `settings` + plugin `options`) or
  the provider block is dropped entirely and the plugin owns the definition;
  the fallback only runs when *no* provider matched, so a second LiteLLM
  provider added later silently changes which path serves `ai-proxy-lkd`;
  and upstream closed the PR that tried to formalize plugin-options provider
  declarations (#48), so this is an undocumented corner that could change
  under us. Also unverified at runtime (statically traced only; the
  reconcile-keeps-fallback interaction on later `provider.updated` events is
  not covered by any rehearsal test).
- Effort: config-only, but fragile.

### Recommendation

**(a)**, with (b) documented as an emergency no-code workaround. (a) restores
the fork's established contract ("any openai-compatible provider with an
explicit baseURL is a candidate" — commit `eaa9666`) uniformly on both host
versions, keeps a single config source, and its whole diff is one call site +
one constant, which keeps future upstream merges cheap. The coder card for
(a) should also add the `@opencode/ai/providers/openai-compatible` case to
`test/provider-matching.test.ts` so B2 is regression-caught.

---

## 6. Config migration plan for `~/.config/opencode/opencode.json`

Current state (verified by reading the file; no key material shown):

```jsonc
{
  "plugin": [ "@tarquinen/opencode-dcp@latest" ],          // line 3
  "provider": {                                            // line 6
    "ai-proxy-lkd": {
      "npm": "@ai-sdk/openai-compatible",                  // line 8
      "options": {
        "baseURL": "https://ai-proxy-lkd.whitelabelvoip.net/v1",  // line 10
        "apiKey": "{file:~/.secrets/ai-proxy-lkd.txt}"            // line 11
      }
    }
  }
  // plus v1-shaped agent/permission/mcp blocks (lines 16-86), out of scope
  // for the plugin cards — v2 normalizes them in memory (migrate-v1).
}
```

### 6.1 Target v2 shape

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [ "@tarquinen/opencode-dcp@latest" ],         // plugin → plugins
  "providers": {                                           // provider → providers
    "ai-proxy-lkd": {
      "name": "Mix proxy (LiteLLM)",
      "package": "@opencode/ai/providers/openai-compatible",  // npm → package
      "settings": {                                        // options → settings
        "baseURL": "https://ai-proxy-lkd.whitelabelvoip.net/v1",
        "apiKey": "{file:~/.secrets/ai-proxy-lkd.txt}"
      }
    }
  }
  // agent/permission/mcp blocks unchanged in this card's scope
}
```

Field mapping authority: `providers.<id>.package` / `settings` /
`headers` / `body` / `models` are the documented v2 provider fields
(https://opencode.ai/v2/docs/providers §Custom). OpenCode can perform the
migration itself ("Migrate my OpenCode configuration … from the V1 format to
the native V2 format" — migrate-v1 §Ask OpenCode to migrate), which is the
recommended way to also convert the agent/permission/mcp blocks in one pass.

### 6.2 `{file:}` substitution on v2

Still supported, documented for exactly this use:
https://opencode.ai/v2/docs/config §Variables / §Files shows
`providers.openai.settings.apiKey: "{file:~/.secrets/openai-key}"`, with paths
relative to the config file, absolute, or `~/`-prefixed, and a missing file
substituting to an empty string. So `{file:~/.secrets/ai-proxy-lkd.txt}` moves
into `settings.apiKey` unchanged. (One caution from the issue tracker:
`{env:...}` inside custom-provider options has known issues while `{file:...}`
works — anomalyco/opencode#19946 — which is why the `{file:}` form is kept.)

### 6.3 Live-verify steps (tester card; extends `docs/LIVE-VERIFY.md`)

1. `opencode --version` → 2.1.3.
2. With the upgraded plugin installed and the migrated config:
   `opencode plugin list` → `opencode-litellm` listed **once** (B7 check).
3. `opencode` TUI → `/models` → models discovered under `ai-proxy-lkd/…`
   (proves the §5 mechanism recognized the arbitrary id).
4. One interactive prompt round-trip through the proxy (proves
   `{file:}`-substituted credential works on v2).
5. One-shot caveat: a cold-cache `opencode run` can fail with
   `Model unavailable: …` before discovery lands — upstream documented this
   host ordering as expected behavior, fixed by a second run or warm cache
   (`upstream README.md:594-596`, upstream #51). Do not treat the first
   one-shot failure as a plugin regression; re-run before diagnosing.
6. Negative test: rename the secret file, restart → discovery must fail
   loudly (401/403 in the plugin log), not silently show an empty provider.

---

## 7. Coder-ready task list

Ordered; each item is one card. "Gate" = `npm test && npm run typecheck`.

1. **Card C1 — Land the merge with the §1.2 resolutions (D1, D3).**
   Files: `README.md`, `src/utils/litellm-api.ts`, `test/litellm-api.test.ts`
   (the only three with conflicts). Direction: §1.2. Acceptance: `git merge
   upstream/main` completes with zero conflicts remaining;
   `npm run typecheck` reports exactly one error (`v2.ts(620) TS2554`) and
   `npm test` fails only `plugin-integration.test.ts` > "replaces a keyless
   auto-detected fallback…" — the known B1/B3 surface.
2. **Card C2 — Fix the v2 arity call site + extend the package list (D1
   untouched; implements §5(a)).**
   Files: `src/plugin/v2.ts` (`listMatchingProviders` filter at `:620` → pass
   `provider.package` as the 2nd arg), `src/plugin/index.ts`
   (`OPENAI_COMPATIBLE_NPM` at `:117` += `'@opencode/ai/providers/openai-compatible'`),
   `test/provider-matching.test.ts` (new cases: v2 package string with
   `settings.baseURL` matches; v2 package without baseURL doesn't; `litellm`
   id still matches). Acceptance: gate green; new test names
   `matches a v2 openai-compatible provider by package` (and companions) pass.
3. **Card C3 — Re-home the upstream tests to D1.**
   Files: `test/plugin-integration.test.ts` (rewrite the localhost-fallback
   test: healthy-stub → fallback at the Mix URL; unhealthy-stub → no
   fallback), `test/litellm-api.test.ts` (re-add upstream describes per
   §1.2; `normalizeBaseURL` default assertion → Mix URL). Acceptance: `npm
   test` = 12 files / all green, including the re-added
   `reasoning-effort discovery` and `restricted reasoning models` suites.
4. **Card C4 — README + docs for the v2 era.**
   Files: `README.md` (merge upstream's v2 feature notes reworded for Mix,
   add the new-src-map block, drop any localhost auto-detect claims),
   `docs/DESIGN.md` (record §5(a) as the recognition mechanism and the D1
   env tier), `docs/LIVE-VERIFY.md` (append §6.3). Acceptance: grep for
   `localhost:4000` in README/docs returns only the historical-notes context;
   gate stays green (docs-only).
5. **Card C5 — User config migration + live verify (D2; tester, needs the
   VPN).**
   Files: user's `~/.config/opencode/opencode.json` per §6.1 (ideally via
   OpenCode's own migration prompt per §6.1 note), keep
   `{file:~/.secrets/ai-proxy-lkd.txt}`. Verify per §6.3, including the
   single-load check (B7) and the cold-cache one-shot caveat. Acceptance:
   §6.3 steps 1-6 pass and are recorded in the card.

Dependencies: C1 → C2 → C3 → C4; C5 needs C1-C4 on the user's machine but no
further code. C2 is the only card implementing a *decision* (§5(a)); C1/C3
implement D1 mechanically.

---

## Appendix: commands and raw outputs backing this document

- `git log --oneline -12` on the fork → 6 fork commits above fork point
  `c930c4d` (listed in §4).
- `git rev-list --count main..upstream/main` → `25`;
  `git rev-list --count upstream/main..main` → `6`; `git merge-base` →
  `c930c4d`.
- `git merge upstream/main --no-edit` in `merge-trial-r2` → 3 conflicts
  (verbatim output in §1).
- `grep -n -E '^(<<<<<<<|=======|>>>>>>>)' <3 files>` → hunk line numbers in §1.
- `npm run typecheck` (resolved rehearsal tree) →
  `src/plugin/v2.ts(620,7): error TS2554: Expected 3 arguments, but got 2.`
- `npm test` (resolved rehearsal tree) → `Test Files 1 failed | 11 passed
  (12)`, `Tests 1 failed | 134 passed (135)`, failure at
  `test/plugin-integration.test.ts:518`.
- `grep -n '@opencode/plugin' package.json` (merged) →
  `42:    "@opencode/plugin": "^2.0.14"`.
- Live install state: `ls -la ~/.config/opencode/plugins/` → clone dir +
  `opencode-litellm.ts` symlink; `~/.config/opencode/package.json` →
  `@opencode-ai/plugin 1.18.21` only.
- Doc citations fetched during this audit: opencode.ai/v2/docs/plugins,
  /v2/docs/config, /v2/docs/providers, /v2/docs/migrate-v1,
  /v2/docs/build/plugins/migrate-v1.
