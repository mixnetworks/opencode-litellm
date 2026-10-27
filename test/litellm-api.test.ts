import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  autoDetectLiteLLM,
  buildAPIURL,
  DEFAULT_LITELLM_URL,
  discoverLiteLLMModelInfo,
  getRequestTimeoutMs,
  normalizeBaseURL,
} from '../src/utils/litellm-api'

const TIMEOUT_ENV = 'LITELLM_REQUEST_TIMEOUT_MS'
const BASE_URL_ENV = 'LITELLM_BASE_URL'

afterEach(() => {
  delete process.env[TIMEOUT_ENV]
  delete process.env[BASE_URL_ENV]
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('reasoning-effort discovery', () => {
  const astra = {
    key: 'bedrock_mantle/openai.gpt-6-astra',
    supports_reasoning: true,
    supports_max_reasoning_effort: true,
    supports_xhigh_reasoning_effort: true,
    supports_none_reasoning_effort: false,
    supports_minimal_reasoning_effort: false,
    supports_low_reasoning_effort: null,
    reasoning_effort_levels: null,
  }

  it.each([
    {
      name: 'restores baseline levels from sparse Astra metadata',
      info: astra,
      params: {},
      expected: ['low', 'medium', 'high', 'xhigh', 'max'],
    },
    {
      name: 'reads sparse flags from litellm_params',
      info: { supports_reasoning: true },
      params: astra,
      expected: ['low', 'medium', 'high', 'xhigh', 'max'],
    },
    {
      name: 'honours explicit lists without adding baseline levels or flagged extras',
      info: { ...astra, reasoning_effort_levels: ['low', 'high', 'max'] },
      params: {},
      expected: ['low', 'high', 'max'],
    },
    {
      name: 'honours an explicitly empty list',
      info: { ...astra, reasoning_effort_levels: [] },
      params: {},
      expected: [],
    },
    {
      name: 'preserves the existing explicit-list format',
      info: { ...astra, supports_reasoning_efforts: ['high'] },
      params: {},
      expected: ['high'],
    },
    {
      name: 'reads explicit lists from params when model_info is null',
      info: astra,
      params: { reasoning_effort_levels: ['high'] },
      expected: ['high'],
    },
    {
      name: 'model_info false overrides params true',
      info: { ...astra, supports_low_reasoning_effort: false, supports_xhigh_reasoning_effort: false },
      params: { supports_low_reasoning_effort: true, supports_xhigh_reasoning_effort: true },
      expected: ['medium', 'high', 'max'],
    },
    {
      name: 'null flags fall back to params',
      info: astra,
      params: { supports_low_reasoning_effort: false },
      expected: ['medium', 'high', 'xhigh', 'max'],
    },
    {
      name: 'does not invent levels for reasoning models without effort metadata',
      info: { supports_reasoning: true, supports_low_reasoning_effort: null },
      params: {},
      expected: undefined,
    },
    {
      name: 'does not invent levels for unknown models',
      info: {},
      params: {},
      expected: undefined,
    },
    {
      name: 'does not infer reasoning from negative-only search model flags',
      info: {
        key: 'gpt-5-search-api-2025-10-14',
        supports_reasoning: null,
        supports_none_reasoning_effort: false,
        supports_xhigh_reasoning_effort: false,
      },
      params: {},
      expected: undefined,
    },
    {
      name: 'does not infer reasoning from negative-only params flags',
      info: {},
      params: { supports_none_reasoning_effort: false, supports_xhigh_reasoning_effort: false },
      expected: undefined,
    },
    {
      name: 'keeps baseline levels for confirmed reasoning models with negative-only flags',
      info: { supports_reasoning: true, supports_minimal_reasoning_effort: false },
      params: {},
      expected: ['low', 'medium', 'high'],
    },
    {
      name: 'does not infer efforts when the request parameter is unsupported despite positive flags',
      info: {
        key: 'gpt-5-search-api',
        supports_minimal_reasoning_effort: true,
        supported_openai_params: ['max_tokens', 'stream', 'web_search_options'],
      },
      params: {},
      expected: [],
    },
    {
      name: 'honours empty supported params even for a reasoning model',
      info: { ...astra, supported_openai_params: [] },
      params: { supported_openai_params: ['reasoning_effort'] },
      expected: [],
    },
    {
      name: 'falls back to params when supported params metadata is null',
      info: { ...astra, supported_openai_params: null },
      params: { supported_openai_params: ['max_tokens'] },
      expected: [],
    },
    {
      name: 'allows the chat reasoning parameter and prefers model_info over params',
      info: { ...astra, supported_openai_params: ['reasoning_effort'] },
      params: { supported_openai_params: [] },
      expected: ['low', 'medium', 'high', 'xhigh', 'max'],
    },
    {
      name: 'allows the Responses API reasoning parameter',
      info: { ...astra, mode: 'responses', supported_openai_params: ['reasoning'] },
      params: {},
      expected: ['low', 'medium', 'high', 'xhigh', 'max'],
    },
    {
      name: 'keeps explicit effort lists authoritative over generic supported params',
      info: { reasoning_effort_levels: ['high'], supported_openai_params: [] },
      params: {},
      expected: ['high'],
    },
    {
      name: 'explicitly disabled reasoning overrides lists and flags',
      info: { ...astra, supports_reasoning: false, reasoning_effort_levels: ['high'] },
      params: { supports_reasoning: true },
      expected: [],
    },
    {
      name: 'keeps optional levels opt-in and retains custom positive flags',
      info: { supports_high_reasoning_effort: true, supports_ultra_reasoning_effort: true },
      params: {},
      expected: ['low', 'medium', 'high', 'ultra'],
    },
    {
      name: 'includes explicitly supported none and minimal in stable order',
      info: { supports_minimal_reasoning_effort: true, supports_none_reasoning_effort: true },
      params: {},
      expected: ['none', 'minimal', 'low', 'medium', 'high'],
    },
    {
      name: 'filters malformed list members and removes duplicates',
      info: { reasoning_effort_levels: ['high', null, 1, 'high', 'low'] },
      params: {},
      expected: ['high', 'low'],
    },
  ])('$name', async ({ info, params, expected }) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      data: [{ model_name: 'test-model', model_info: info, litellm_params: params }],
    })))

    const discovered = await discoverLiteLLMModelInfo('https://proxy.example.com', 'test-key')
    expect(discovered.get('test-model')?.supports_reasoning_efforts).toEqual(expected)
  })
})

describe('restricted reasoning models', () => {
  // LiteLLM's Pro entries omit supports_low_reasoning_effort, and older
  // entries even report minimal=true despite the provider's restricted set.
  const pro = {
    supports_reasoning: true,
    supports_none_reasoning_effort: false,
    supports_minimal_reasoning_effort: true,
    supports_xhigh_reasoning_effort: true,
    reasoning_effort_levels: null,
  }

  it.each([
    {
      name: 'limits GPT-5.4 Pro to its accepted effort levels',
      info: { ...pro, key: 'gpt-5.4-pro', supports_minimal_reasoning_effort: false },
      params: {},
      expected: ['medium', 'high', 'xhigh'],
    },
    {
      name: 'filters misleading positive minimal metadata for GPT-5.2 Pro',
      info: { ...pro, key: 'gpt-5.2-pro' },
      params: {},
      expected: ['medium', 'high', 'xhigh'],
    },
    {
      name: 'limits GPT-5 Pro to high',
      info: { ...pro, key: 'gpt-5-pro', supports_xhigh_reasoning_effort: false },
      params: {},
      expected: ['high'],
    },
    {
      name: 'recognizes provider-prefixed snapshot keys behind deployment aliases',
      info: { ...pro, key: 'azure/us/gpt-5.4-pro-2026-03-05' },
      params: { model: 'azure/company-deployment' },
      expected: ['medium', 'high', 'xhigh'],
    },
    {
      name: 'uses the upstream model when model_info has no key',
      info: pro,
      params: { model: 'openai/gpt-5.2-pro-2025-12-11' },
      expected: ['medium', 'high', 'xhigh'],
    },
    {
      name: 'uses the upstream model when model_info key is a deployment alias',
      info: { ...pro, key: 'company-reasoner' },
      params: { model: 'openai/gpt-5-pro-2025-10-06' },
      expected: ['high'],
    },
    {
      name: 'honours disabled levels within the restricted set',
      info: { ...pro, key: 'gpt-5.4-pro', supports_medium_reasoning_effort: false, supports_xhigh_reasoning_effort: false },
      params: {},
      expected: ['high'],
    },
    {
      name: 'does not invent optional xhigh support from a model name',
      info: { key: 'gpt-5.4-pro', supports_reasoning: true, supports_minimal_reasoning_effort: false },
      params: {},
      expected: ['medium', 'high'],
    },
    {
      name: 'keeps explicit effort lists authoritative over known restrictions',
      info: { ...pro, key: 'gpt-5.4-pro', reasoning_effort_levels: ['low', 'high'] },
      params: {},
      expected: ['low', 'high'],
    },
    {
      name: 'keeps legacy effort lists authoritative over known restrictions',
      info: { ...pro, key: 'gpt-5.2-pro', supports_reasoning_efforts: ['low'] },
      params: {},
      expected: ['low'],
    },
    {
      name: 'preserves an explicit empty effort list on restricted models',
      info: { ...pro, key: 'gpt-5.4-pro', reasoning_effort_levels: [] },
      params: {},
      expected: [],
    },
    {
      name: 'does not apply Pro restrictions to ordinary GPT-5.4',
      info: { ...pro, key: 'gpt-5.4' },
      params: {},
      expected: ['minimal', 'low', 'medium', 'high', 'xhigh'],
    },
    {
      name: 'does not apply known restrictions to unrecognized Pro model suffixes',
      info: { ...pro, key: 'gpt-5.4-pro-custom' },
      params: {},
      expected: ['minimal', 'low', 'medium', 'high', 'xhigh'],
    },
    {
      name: 'does not infer efforts from a known model name alone',
      info: { key: 'gpt-5.4-pro', supports_reasoning: true },
      params: {},
      expected: undefined,
    },
  ])('$name', async ({ info, params, expected }) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      data: [{ model_name: 'company-reasoner', model_info: info, litellm_params: params }],
    })))

    const discovered = await discoverLiteLLMModelInfo('https://proxy.example.com', 'test-key')
    expect(discovered.get('company-reasoner')?.supports_reasoning_efforts).toEqual(expected)
  })
})

describe('getRequestTimeoutMs', () => {
  it('defaults to 15000ms when the env var is unset', () => {
    expect(getRequestTimeoutMs()).toBe(15000)
  })

  it('honours a valid override (issue #20)', () => {
    process.env[TIMEOUT_ENV] = '60000'
    expect(getRequestTimeoutMs()).toBe(60000)
  })

  it('falls back to the default for invalid values', () => {
    for (const invalid of ['abc', '0', '-5', '12.5', '']) {
      process.env[TIMEOUT_ENV] = invalid
      expect(getRequestTimeoutMs()).toBe(15000)
    }
  })
})

describe('normalizeBaseURL', () => {
  it('strips trailing slashes', () => {
    expect(normalizeBaseURL('http://localhost:4000/')).toBe('http://localhost:4000')
    expect(normalizeBaseURL('http://localhost:4000///')).toBe('http://localhost:4000')
  })

  it('strips a /v1 suffix so the plugin can re-append endpoint paths', () => {
    expect(normalizeBaseURL('http://localhost:4000/v1')).toBe('http://localhost:4000')
    expect(normalizeBaseURL('https://proxy.example.com/v1/')).toBe('https://proxy.example.com')
  })

  it('leaves other paths untouched', () => {
    expect(normalizeBaseURL('https://proxy.example.com/api')).toBe('https://proxy.example.com/api')
  })

  it('defaults to the Mix proxy', () => {
    expect(normalizeBaseURL(undefined)).toBe(DEFAULT_LITELLM_URL)
  })
})

describe('buildAPIURL', () => {
  it('appends /v1/models by default', () => {
    expect(buildAPIURL('http://localhost:4000/v1')).toBe('http://localhost:4000/v1/models')
  })

  it('appends a custom endpoint', () => {
    expect(buildAPIURL('http://localhost:4000/', '/v1/model/info')).toBe(
      'http://localhost:4000/v1/model/info',
    )
  })
})

describe('autoDetectLiteLLM', () => {
  it('returns LITELLM_BASE_URL normalised, without a health check (D1 env tier)', async () => {
    process.env[BASE_URL_ENV] = ' https://litellm.example.com/v1/ '
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await expect(autoDetectLiteLLM()).resolves.toBe('https://litellm.example.com')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls through to the Mix proxy when LITELLM_BASE_URL is blank', async () => {
    // A whitespace-only env value is not deliberate config: D1 moves to the
    // next tier instead of returning an unusable URL.
    process.env[BASE_URL_ENV] = '   '
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response)
    await expect(autoDetectLiteLLM()).resolves.toBe(DEFAULT_LITELLM_URL)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      `${DEFAULT_LITELLM_URL}/v1/models`,
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('returns the Mix proxy default when its health check passes', async () => {
    // Health check is fail-fast; the default URL is the only endpoint ever
    // probed now — no localhost ports.
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true } as Response)
    await expect(autoDetectLiteLLM()).resolves.toBe(DEFAULT_LITELLM_URL)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      `${DEFAULT_LITELLM_URL}/v1/models`,
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('returns null when the default health check fails, never probing localhost', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    await expect(autoDetectLiteLLM()).resolves.toBeNull()
    // D1: the Mix proxy is the only candidate — no localhost port loop.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(`${DEFAULT_LITELLM_URL}/v1/models`, expect.anything())
  })

  it('returns null when the default health check reports a non-ok response', async () => {
    // A 401 still means "server alive", but checkLiteLLMHealth surfaces it
    // as unhealthy so the user is prompted for a key.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response)
    await expect(autoDetectLiteLLM()).resolves.toBeNull()
  })
})
