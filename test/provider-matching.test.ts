import { describe, expect, it } from 'vitest'
import { isLiteLLMProvider } from '../src/plugin/index'

describe('isLiteLLMProvider', () => {
  it('matches the provider id `litellm` (upstream)', () => {
    expect(isLiteLLMProvider('litellm', undefined, {})).toBe(true)
  })

  it('matches ids with the litellm- / litellm_ prefix (upstream)', () => {
    expect(isLiteLLMProvider('litellm-custom', undefined, {})).toBe(true)
    expect(isLiteLLMProvider('litellm_custom', undefined, {})).toBe(true)
  })

  it('matches any of the options flags (upstream)', () => {
    expect(isLiteLLMProvider('my-proxy', undefined, { litellm: true })).toBe(true)
    expect(isLiteLLMProvider('my-proxy', undefined, { litellmCompatible: true })).toBe(true)
    expect(isLiteLLMProvider('my-proxy', undefined, { 'litellm-compatible': true })).toBe(true)
    expect(isLiteLLMProvider('my-proxy', undefined, { litellm_compatible: true })).toBe(true)
  })

  it('matches an openai-compatible provider with an explicit baseURL', () => {
    expect(
      isLiteLLMProvider('ai-proxy-lkd', '@ai-sdk/openai-compatible', {
        baseURL: 'https://ai-proxy-lkd.whitelabelvoip.net',
      }),
    ).toBe(true)
    expect(
      isLiteLLMProvider('ai-proxy', '@ai-sdk/openai', {
        baseURL: 'https://example.com/v1',
      }),
    ).toBe(true)
  })

  it('does not match an openai-compatible provider without a baseURL', () => {
    expect(isLiteLLMProvider('ai-proxy', '@ai-sdk/openai-compatible', {})).toBe(false)
    expect(isLiteLLMProvider('ai-proxy', '@ai-sdk/openai', {})).toBe(false)
  })

  it('does not match when baseURL is not a string', () => {
    expect(
      isLiteLLMProvider('ai-proxy', '@ai-sdk/openai-compatible', { baseURL: 123 }),
    ).toBe(false)
    expect(
      isLiteLLMProvider('ai-proxy', '@ai-sdk/openai-compatible', { baseURL: ['x'] }),
    ).toBe(false)
  })

  it('does not match an unrelated npm provider even with a baseURL', () => {
    expect(
      isLiteLLMProvider('anthropic-proxy', '@ai-sdk/anthropic', {
        baseURL: 'https://example.com/v1',
      }),
    ).toBe(false)
    expect(isLiteLLMProvider('openai-real', '@ai-sdk/openai', {})).toBe(false)
  })

  it('does not match an unrelated provider with no flag, id or npm', () => {
    expect(isLiteLLMProvider('my-provider', undefined, {})).toBe(false)
    expect(isLiteLLMProvider('my-provider', '@ai-sdk/google', { baseURL: 'https://x' })).toBe(false)
  })
})
