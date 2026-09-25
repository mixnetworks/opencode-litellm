# AGENTS.md

Read `docs/DESIGN.md` first — every shared decision (provider matching rule,
default URL, file-key spike) is decided there. Do not re-derive or contradict
it. This is a fork of `yuseferi/opencode-litellm`; keep the diff vs upstream
minimal and intentional.

## Commands

- Install: `npm install`
- Gate: `npm test && npm run typecheck` — must pass before completing a card.
- Never commit secrets. This repo is PUBLIC. The only allowed internal
  reference is the already-public proxy URL
  `https://ai-proxy-lkd.whitelabelvoip.net`.

## Layout

- `src/plugin/index.ts` — plugin entry: `config` hook, provider matching
  (`isLiteLLMProvider`), enrichment, merge.
- `src/utils/litellm-api.ts` — endpoints, default URL, health/discovery,
  auto-detect.
- `test/` — vitest, mirrors upstream pure-logic style.
