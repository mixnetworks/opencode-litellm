import { describe, expect, it } from 'vitest'
import {
  inferCompatibility,
  parseModelCompatibility,
  resolveCompatibility,
} from '../src/utils/model-compatibility'
import type { ModelHints } from '../src/utils/model-cache'

const hints = (acceptsCacheControl: boolean): ModelHints => ({
  acceptsCacheControl,
  adaptiveThinking: false,
  thinkingAlwaysOn: false,
})

describe('parseModelCompatibility', () => {
  it('returns an empty map for non-object input', () => {
    expect(parseModelCompatibility(undefined)).toEqual({})
    expect(parseModelCompatibility(null)).toEqual({})
    expect(parseModelCompatibility('cacheFormat')).toEqual({})
    expect(parseModelCompatibility([{ cacheFormat: 'anthropic' }])).toEqual({})
  })

  it('keeps an accepted cacheFormat or null', () => {
    expect(
      parseModelCompatibility({
        m1: { cacheFormat: 'anthropic' },
        m2: { cacheFormat: 'alibaba' },
        m3: { cacheFormat: null },
      }),
    ).toEqual({
      m1: { cacheFormat: 'anthropic' },
      m2: { cacheFormat: 'alibaba' },
      m3: { cacheFormat: null },
    })
  })

  it('drops rejected values, other keys and empty entries', () => {
    expect(
      parseModelCompatibility({
        m1: { cacheFormat: 'Anthropic' },
        m2: { cacheFormat: true },
        m3: { supportsThinkingBlockBinding: false },
        m4: 'anthropic',
        m5: {},
      }),
    ).toEqual({})
  })
})

describe('inferCompatibility', () => {
  it('asks Chat Completions for Anthropic cache markers when the proxy accepts them', () => {
    expect(inferCompatibility(hints(true), true)).toEqual({ cacheFormat: 'anthropic' })
  })

  it('infers nothing without the hint or outside Chat Completions', () => {
    expect(inferCompatibility(hints(false), true)).toEqual({})
    expect(inferCompatibility(undefined, true)).toEqual({})
    expect(inferCompatibility(hints(true), false)).toEqual({})
  })
})

describe('resolveCompatibility', () => {
  it('lets overrides add, replace and remove keys', () => {
    expect(resolveCompatibility({ cacheFormat: 'anthropic' }, { cacheFormat: 'alibaba' })).toEqual({
      cacheFormat: 'alibaba',
    })
    expect(resolveCompatibility({}, { cacheFormat: 'anthropic' })).toEqual({ cacheFormat: 'anthropic' })
  })

  it('returns undefined when nothing remains', () => {
    expect(resolveCompatibility({}, undefined)).toBeUndefined()
    expect(resolveCompatibility({ cacheFormat: 'anthropic' }, { cacheFormat: null })).toBeUndefined()
  })
})
