import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  autoDetectLiteLLM,
  buildAPIURL,
  DEFAULT_LITELLM_URL,
  getRequestTimeoutMs,
  normalizeBaseURL,
} from '../src/utils/litellm-api'

const TIMEOUT_ENV = 'LITELLM_REQUEST_TIMEOUT_MS'

afterEach(() => {
  delete process.env[TIMEOUT_ENV]
  vi.restoreAllMocks()
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

  it('returns null when the default health check fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    await expect(autoDetectLiteLLM()).resolves.toBeNull()
  })

  it('returns null when the default health check reports a non-ok response', async () => {
    // A 401 still means "server alive", but checkLiteLLMHealth surfaces it
    // as unhealthy so the user is prompted for a key.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response)
    await expect(autoDetectLiteLLM()).resolves.toBeNull()
  })
})
