# Live verification (human-run, on VPN)

Manual acceptance check for DESIGN.md §Acceptance item 4. Takes ~5 minutes.
All commands run from a scratch directory so nothing touches this repo.

## Prerequisites

- Connected to the Mix VPN (the proxy is unreachable otherwise).
- `opencode` CLI installed (verified on 1.18.29).
- API key file at `~/.secrets/ai-proxy-lkd.txt` containing only the key:

  ```bash
  ls -l ~/.secrets/ai-proxy-lkd.txt   # exists, mode 600
  ```

## Steps

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
