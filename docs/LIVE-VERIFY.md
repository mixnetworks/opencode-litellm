# Live verification (human-run, on VPN)

Manual acceptance check for DESIGN.md §Acceptance item 4, on both supported
host versions. All commands run from a scratch directory so nothing touches
this repo.

## Prerequisites

- Connected to the Mix VPN (the proxy is unreachable otherwise).
- `opencode` CLI installed — OpenCode 2.1.3 for the v2 run below, 1.18.29
  for the v1 run.
- API key file at `~/.secrets/ai-proxy-lkd.txt` containing only the key:

  ```bash
  ls -l ~/.secrets/ai-proxy-lkd.txt   # exists, mode 600
  ```

## OpenCode 2 verification (2.x)

Run in a scratch directory with the v2-shaped config (the recommended form
on 2.x; see `docs/UPGRADE-2.0.md` §6.1 for the field mapping):

```bash
mkdir -p /tmp/litellm-live-verify-v2 && cd /tmp/litellm-live-verify-v2
cat > opencode.json <<'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "providers": {
    "ai-proxy-lkd": {
      "name": "Mix proxy (LiteLLM)",
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": {
        "baseURL": "https://ai-proxy-lkd.whitelabelvoip.net/v1",
        "apiKey": "{file:~/.secrets/ai-proxy-lkd.txt}"
      }
    }
  }
}
EOF
```

**Step 0 — restart OpenCode after any plugin upgrade.** A server started
before the upgrade keeps the old plugin module cached and serves no models
until it is restarted; restart it (or use a fresh scratch directory /
`opencode run --standalone`) before running the checks below.

1. **Host version**: `opencode --version` → 2.1.3 (or any 2.0.19+).
2. **Single load** (upgrade audit B7): `opencode plugin list` →
   `opencode-litellm` listed **exactly once**. If it appears twice, the
   install was discovered both as the clone directory and the flat
   `.ts` symlink — drop the symlink and declare the directory under
   `plugins` (explicit plugin paths must be directories; README §Install).
3. **Recognition of the arbitrary id**: launch `opencode`, open the model
   switcher (`/models`) → entries under `ai-proxy-lkd/…` appear. This
   proves the structural match (`provider.package` → `isLiteLLMProvider`)
   fired on v2.
4. **Credential round-trip**: send one interactive prompt; it completes
   through the proxy. This proves the `{file:}`-substituted key works on
   the v2 path.
5. **One-shot caveat**: a cold-cache `opencode run` can fail with
   `Model unavailable: ai-proxy-lkd/…` before discovery lands (host orders
   provider registration after plugin setup — anomalyco/opencode#57421).
   Re-run before diagnosing; not a plugin regression.
6. **Negative test**: rename the key file, restart OpenCode → discovery
   must fail **loudly** (401/403 in the plugin log), not silently show an
   empty provider. Rename it back and confirm recovery.

## OpenCode 1 verification (1.18.x)

The original v1-era steps, kept for the legacy `server()` path:

### 1. Scratch directory + config

```bash
mkdir -p /tmp/litellm-live-verify && cd /tmp/litellm-live-verify
cat > opencode.json <<'EOF'
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
EOF
```

### 2. Plugin installed globally

The plugin must be loadable — either the global install from README §Install
(`~/.config/opencode/plugins/opencode-litellm.ts` flat symlink) or a
project-local ref in `opencode.json`. Verified working form (points at the
repo directory, not the entry file):

```jsonc
"plugin": ["file:///abs/path/to/opencode-litellm"]
```

(A ref to `…/src/index.ts` does NOT load. A `github:` ref silently fails —
sst/opencode#8763.)

### 3. Run the smoke test

```bash
opencode run --print-logs 'say OK'
```

### 4. What to look for

1. **Chat succeeds**: the CLI prints `OK` (the model's reply through the
   proxy). No auth errors, no timeouts.
2. **Discovered models in the logs**: run
   `grep opencode-litellm ~/.local/share/opencode/log/opencode.log` after the
   run (`--print-logs` does not surface plugin output). Expect lines like
   `[opencode-litellm] Discovered 23 models for provider "ai-proxy-lkd"`
   (any count > 0 is a pass — the roster moves) and a background cache
   refresh.
3. **Picker entries**: launch `opencode` interactively, press the model
   switcher — `ai-proxy-lkd/<model-id>` entries should be listed
   (e.g. `fireworks_ai/kimi-k3`). (CLI only; Desktop does not show
   plugin-added models — yuseferi/opencode-litellm#5.)

## If it fails

- Connection refused / timeout → not on the VPN, or proxy down.
- 401s in the log → key file missing, unreadable, or has extra content.
- No `[opencode-litellm]` log lines at all → plugin not loaded; check the
  install form (README §Install — `github:` refs silently fail,
  sst/opencode#8763).
- Stale roster → delete `~/.cache/opencode-litellm/` and retry.
