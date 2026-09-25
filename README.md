# opencode-litellm — Mix Networks fork

OpenCode plugin that auto-discovers every model served by the Mix Networks
LiteLLM proxy and registers them in the model picker — no `models` block to
maintain, no restarts when models change. Fork of
[yuseferi/opencode-litellm](https://github.com/yuseferi/opencode-litellm)
(MIT), retargeted at the Mix proxy. Licensed MIT — see
[LICENSE](./LICENSE).

## Requirements

- [OpenCode](https://opencode.ai) (CLI). Discovered models appear in the CLI
  only — the OpenCode Desktop picker does not reflect plugin-added models
  (upstream limitation, yuseferi/opencode-litellm#5).
- Access to the Mix proxy at `https://ai-proxy-lkd.whitelabelvoip.net`.
  The endpoint is only reachable from the Mix VPN.
- An API key for the proxy.

## Install

Clone the plugin and expose its entry file in OpenCode's global plugin
directory (OpenCode auto-loads every plugin file found there):

```bash
git clone https://github.com/mixnetworks/opencode-litellm.git ~/.config/opencode/plugins/opencode-litellm
cd ~/.config/opencode/plugins/opencode-litellm
npm install
ln -s ~/.config/opencode/plugins/opencode-litellm/src/index.ts ~/.config/opencode/plugins/opencode-litellm.ts
```

> Do not use a git-URL plugin ref (`"plugin": ["github:mixnetworks/opencode-litellm"]`):
> OpenCode appends `@latest` to `github:` refs, which Bun cannot resolve, and
> the plugin silently fails to load (sst/opencode#8763). The local install
> above is the supported form.

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

## Authentication

The plugin resolves the API key from, in order:

| Source | Example |
|---|---|
| Provider options (`{file:}` and `{env:}` both work) | `"apiKey": "{file:~/.secrets/ai-proxy-lkd.txt}"` |
| Environment variable | `export LITELLM_API_KEY=sk-...` (or `LITELLM_MASTER_KEY`) |
| OpenCode's credential store | `/connect`, pick the provider, paste the key |

## Troubleshooting

- `No LiteLLM proxy found ...` in the logs: you are not on the VPN, or the
  proxy is down. Connect to the VPN and retry.
- Discovery gets 401s: the key file is missing, unreadable, or contains
  something other than the key. Check `~/.secrets/ai-proxy-lkd.txt`.
- Models missing from the picker: run `opencode run --print-logs` (or check
  `~/.local/share/opencode/log/`) and look for `[opencode-litellm]` lines.
  Deleting `~/.cache/opencode-litellm/` forces a fresh discovery on the next
  start.
- Models appear in the CLI but not Desktop: known OpenCode Desktop limitation,
  not a plugin bug.

## Development

```bash
npm install && npm test
```

## License

MIT — fork of
[yuseferi/opencode-litellm](https://github.com/yuseferi/opencode-litellm) by
Yusef Mohamadi; see [LICENSE](./LICENSE).
