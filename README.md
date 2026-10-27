# opencode-litellm — Mix Networks fork

OpenCode plugin that auto-discovers every model served by the Mix Networks
LiteLLM proxy and registers them in the model picker — no `models` block to
maintain, no restarts when models change. Fork of
[yuseferi/opencode-litellm](https://github.com/yuseferi/opencode-litellm)
(MIT), retargeted at the Mix proxy. Licensed MIT — see
[LICENSE](./LICENSE).

Runs on OpenCode 1 (1.18.29+, legacy `server()` entrypoint) and OpenCode 2
(native `Plugin.define`, provider-registry discovery, in-process refresh) from
one package.

## Requirements

- [OpenCode](https://opencode.ai) 1.18.29+ or 2.0.19+ (CLI; Desktop through the
  OpenCode 2 host). On the OpenCode 1 path discovered models appear in the CLI
  only — the Desktop picker does not reflect plugin-added models (upstream
  limitation, yuseferi/opencode-litellm#5). OpenCode 2 registers models through
  its provider registry, so Desktop sees them there.
- Access to the Mix proxy at `https://ai-proxy-lkd.whitelabelvoip.net`.
  The endpoint is only reachable from the Mix VPN.
- An API key for the proxy.

## Features

| | |
|---|---|
| 🔍 **Base-URL resolution** | Explicit `providers.<id>.settings.baseURL` (or plugin `baseURL`) wins, then `LITELLM_BASE_URL`, then the Mix proxy default. Nothing is probed on `localhost`: with nothing configured the plugin health-checks the Mix proxy and gives up quietly when the VPN is down. |
| 📡 **Dynamic discovery** | Queries `/v1/models` so the OpenCode model picker always reflects the proxy's live `model_list`. |
| ⚡ **Stale-while-revalidate** | A warm disk cache supplies models without a network request. New sessions trigger a background refresh, and cache entries expire after 7 days. |
| 🏷️ **Smart formatting** | Turns `anthropic/claude-3-5-sonnet` into `Claude 3.5 Sonnet` in the picker — handles versions, sizes, quantizations, and brand-cased names like `gpt-4o`. Set `formatModelNames: false` to keep the raw LiteLLM ids instead. |
| 🧠 **Modality-aware** | Enriches `/v1/models` entries with `/v1/model/info` (`mode`, token limits, capability flags) and hides embedding / image / audio models from the picker. Declares `temperature` support only for models whose `supported_openai_params` lists it. |
| 💵 **Real pricing** | Maps `input_cost_per_token` / `output_cost_per_token` (and cache read/write costs) from `/v1/model/info` into OpenCode's `cost` field, so the picker and `/cost` show what the proxy actually bills instead of `$0.00`. Models LiteLLM has no price for are left unpriced, not falsely marked free. |
| 🧩 **Reasoning-effort variants** | When LiteLLM reports per-model effort support (`supports_low_reasoning_effort`, …), each level is surfaced as a picker variant automatically. |
| 🧭 **Responses-API routing** | Models LiteLLM reports with `mode: "responses"` are invoked through `/v1/responses` instead of `/v1/chat/completions`, with no extra configuration. OpenCode 2 overrides the runtime package per model; OpenCode 1 gets a `<provider>-responses` sibling. |
| 🔐 **Auth-aware** | Honours the provider's `apiKey`, OpenCode `/connect` credentials, and `LITELLM_API_KEY` / `LITELLM_MASTER_KEY` on both the OpenCode 1 server path and the OpenCode 2 plugin host; on OpenCode 2 a **LiteLLM** entry in the connect dialog (key plus optional base URL) connects the Mix proxy entirely from the web UI. A saved credential beats the environment key. |
| 🌐 **Gateway-friendly** | Supports provider `headers` (and the legacy `customHeaders` option) for proxies behind Cloudflare Access or other API gateways. |
| 🧩 **Splittable catalog** | `includeModels` / `excludeModels` (glob patterns) let one proxy be divided into several OpenCode providers — e.g. by naming prefix — without hand-maintaining a model list. |
| 🎚️ **Capability overrides** | `modelCapabilities` forces or retracts per-model capability flags (`supports_vision`, `supports_function_calling`, …) when `/v1/model/info` is unavailable or disagrees with the deployment. |
| 💾 **Prompt caching (OpenCode 2.0.28+)** | Chat models whose deployment accepts Anthropic `cache_control` markers are registered with `compatibility.cacheFormat: "anthropic"`, so OpenCode 2 places cache breakpoints as it does for a native Anthropic provider. `modelCompatibility` corrects this per model. |
| ⏱️ **Bounded startup** | Health checks fail fast (3 s); discovery fetches are capped at **15 s** (configurable via `LITELLM_REQUEST_TIMEOUT_MS`) for a slow or distant proxy. OpenCode 2 model refresh runs in the background. |
| 🤝 **Non-destructive merge** | Only adds models you don't already have configured. Hand-curated entries are preserved verbatim and always win over discovered ones. |
| 🔌 **OpenCode 1 + 2** | Supports OpenCode 2's native `Plugin.define`, provider transforms, event subscription, and live model refresh, plus the OpenCode 1.18.29+ legacy `server()` entrypoint. |

## Install

Clone the plugin and expose its entry file in OpenCode's global plugin
directory (OpenCode auto-loads every plugin file found there):

```bash
git clone git@github.com:mixnetworks/opencode-litellm.git ~/.config/opencode/plugins/opencode-litellm
cd ~/.config/opencode/plugins/opencode-litellm
npm install
ln -s ~/.config/opencode/plugins/opencode-litellm/src/index.ts ~/.config/opencode/plugins/opencode-litellm.ts
```

> Do not use a git-URL plugin ref (`"plugin": ["github:mixnetworks/opencode-litellm"]`):
> OpenCode appends `@latest` to `github:` refs, which Bun cannot resolve, and
> the plugin silently fails to load (sst/opencode#8763). The local install
> above is the supported form.

> Until upstream publishes a v2-compatible release, the npm package
> (`opencode-plugin-litellm`) still ships the v1-only build. The clone install
> above is how you get the dual v1+v2 version.

### OpenCode 2: load the plugin once

On OpenCode 2 the plugins directory auto-loads both flat `.ts` files and
immediate plugin package directories — so the install above (clone directory
**plus** the `opencode-litellm.ts` symlink) can be discovered twice. After
installing, check:

```bash
opencode plugin list
```

`opencode-litellm` must be listed **once**. If it appears twice, delete the
symlink and declare the directory instead:

```jsonc
{
  "plugins": ["~/.config/opencode/plugins/opencode-litellm"]
}
```

Explicitly configured plugin paths must be directories — a single-file path
is skipped with a warning. On OpenCode 2 the clone directory alone is
sufficient; on OpenCode 1 the flat symlink form from above is what loads.

## Usage

Put your proxy API key in a file that only you can read:

```bash
mkdir -p ~/.secrets
printf '%s\n' 'PASTE_YOUR_KEY_HERE' > ~/.secrets/ai-proxy-lkd.txt
chmod 600 ~/.secrets/ai-proxy-lkd.txt
```

Add the provider to `opencode.json` (project) or
`~/.config/opencode/opencode.json` (global):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "ai-proxy-lkd": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "https://ai-proxy-lkd.whitelabelvoip.net/v1",
        "apiKey": "{file:~/.secrets/ai-proxy-lkd.txt}"
      }
    }
  }
}
```

On OpenCode 2 the same provider is spelled with the v2 keys —
`providers.<id>.package` + `settings`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "providers": {
    "ai-proxy-lkd": {
      "name": "Mix LiteLLM",
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": {
        "baseURL": "https://ai-proxy-lkd.whitelabelvoip.net/v1",
        "apiKey": "{file:~/.secrets/ai-proxy-lkd.txt}"
      }
    }
  }
}
```

Start `opencode`. Models, token limits, capability flags, and per-token costs
are discovered from the proxy automatically — there is no `models` block to
write. Hand-curated entries you add under `provider.ai-proxy-lkd.models` are
preserved verbatim and always win over discovered ones.

## Zero config

With no provider block at all, the plugin defaults to the Mix proxy and
creates the provider entry itself. Export your key and run:

```bash
export LITELLM_API_KEY=sk-...   # LITELLM_MASTER_KEY also works
opencode
```

`LITELLM_BASE_URL` overrides the proxy URL when you need a different gateway
(it is returned as configured, without a health check). It is never a
`localhost` guess — point it at the proxy explicitly.

## Authentication

The plugin resolves the API key from, in order:

| Source | Example |
|---|---|
| Provider options (`{file:}` and `{env:}` both work) | `"apiKey": "{file:~/.secrets/ai-proxy-lkd.txt}"` |
| Environment variable | `export LITELLM_API_KEY=sk-...` (or `LITELLM_MASTER_KEY`) |
| OpenCode's credential store | `/connect`, pick the provider, paste the key |

On OpenCode 2, `/connect` → **LiteLLM** (or the Desktop providers view) also
takes an optional base URL and provider id, so the gateway can be connected
entirely from the UI. A credential saved that way beats the environment key.

## Troubleshooting

- First one-shot run fails with `Model unavailable: ai-proxy-lkd/…` on
  OpenCode 2: on a cold model cache the first `opencode run` can resolve its
  model before discovery lands — OpenCode 2 registers configured providers
  only after plugin setup, so a one-shot command can be past model resolution
  before the models arrive (upstream host ordering,
  anomalyco/opencode#57421). Interactive sessions are not affected. Run the
  command again — or warm the cache once with an interactive session —
  before diagnosing; it is not a plugin failure.
- `No LiteLLM proxy found ...` in the logs: you are not on the VPN, or the
  proxy is down. Connect to the VPN and retry.
- Discovery gets 401s: the key file is missing, unreadable, or contains
  something other than the key. Check `~/.secrets/ai-proxy-lkd.txt`.
- Models missing from the picker: run `opencode run --print-logs` (or check
  `~/.local/share/opencode/log/`) and look for `[opencode-litellm]` lines.
  Deleting `~/.cache/opencode-litellm/` forces a fresh discovery on the next
  start.
- Models appear in the CLI but not Desktop: on the OpenCode 1 path this is a
  known OpenCode Desktop limitation, not a plugin bug; OpenCode 2 registers
  models through its provider registry, so check the plugin log for provider
  discovery errors instead.

## Development

```bash
npm install && npm test
```

Source map:

```
src/
├── index.ts                    # Public exports (default: OpenCode 2 definition; named: v1 plugins)
├── types/index.ts              # LiteLLM API types
├── utils/
│   ├── litellm-api.ts          # health check, discovery (/v1/models + /v1/model/info), auto-detect
│   ├── format-model-name.ts    # name formatting, categorization
│   ├── model-cache.ts          # stale-while-revalidate on-disk model cache
│   ├── model-filter.ts         # includeModels/excludeModels glob filtering
│   ├── model-capabilities.ts   # per-model capability flag overrides
│   ├── model-compatibility.ts  # cacheFormat inference and per-model overrides
│   ├── reasoning-efforts.ts    # reasoning-effort variant discovery from /v1/model/info
│   ├── transport.ts            # Responses-API routing decision (mode: "responses" → /v1/responses)
│   └── opencode-auth.ts        # fallback to OpenCode's /connect-stored credentials
└── plugin/
    ├── index.ts                # OpenCode 1 server entry and shared discovery logic
    ├── integration.ts          # OpenCode 2 /connect integration (LiteLLM key + base-URL dialog)
    └── v2.ts                   # OpenCode 2 definition, provider transform, event-driven reload
```

`test/` holds the vitest suite for the pure logic and the plugin hosts.

## License

MIT — fork of
[yuseferi/opencode-litellm](https://github.com/yuseferi/opencode-litellm) by
Yusef Mohamadi; see [LICENSE](./LICENSE).
