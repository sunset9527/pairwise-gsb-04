import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SUITE_NAME,
  TEST_SUITES_STORAGE_VERSION,
  addSuite,
  createInitialState,
  duplicateSuite,
  getActiveSuite,
  migrateLegacyCases,
  parseStoredState,
  removeSuite,
  renameSuite,
  setActiveSuite,
  setSuiteCases,
} from '../test-suites'

describe('parseStoredState / migration', () => {
  it('creates a default suite when storage is empty', () => {
    const state = parseStoredState(null, 1000)
    expect(state.version).toBe(TEST_SUITES_STORAGE_VERSION)
    expect(state.suites).toHaveLength(1)
    expect(state.activeSuiteId).toBe(state.suites[0].id)
    expect(state.suites[0].cases).toEqual([''])
    expect(state.suites[0].createdAt).toBe(1000)
    expect(state.suites[0].updatedAt).toBe(1000)
  })

  it('migrates legacy string[] test cases into a default suite without data loss', () => {
    const legacy = ['foo', 'bar', 'baz']
    const state = parseStoredState(JSON.stringify(legacy), 2000)
    expect(state.suites).toHaveLength(1)
    expect(state.suites[0].name).toBe(DEFAULT_SUITE_NAME)
    expect(state.suites[0].cases).toEqual(legacy)
    expect(state.activeSuiteId).toBe(state.suites[0].id)
    expect(state.suites[0].createdAt).toBe(2000)
    expect(state.suites[0].updatedAt).toBe(2000)
  })

  it('migrates an empty legacy array to a single empty case', () => {
    const state = migrateLegacyCases([], 1000)
    expect(state.suites[0].cases).toEqual([''])
  })

  it('keeps the current format as-is', () => {
    const state = createInitialState(1000)
    const parsed = parseStoredState(JSON.stringify(state), 3000)
    expect(parsed).toEqual(state)
  })

  it('falls back to a fresh state on corrupted data', () => {
    expect(parseStoredState('not json').suites).toHaveLength(1)
    expect(parseStoredState('{"foo":1}').suites).toHaveLength(1)
    expect(parseStoredState('{"suites":[]}').suites).toHaveLength(1)
  })
})

describe('suite switching', () => {
  it('switches the active suite and keeps every suite untouched', () => {
    let state = createInitialState(1000)
    const firstId = state.activeSuiteId
    state = addSuite(state, 'Second', 2000)
    expect(state.suites).toHaveLength(2)
    expect(state.activeSuiteId).not.toBe(firstId)

    state = setSuiteCases(state, firstId, ['a', 'b'], 3000)
    state = setActiveSuite(state, firstId)
    expect(state.activeSuiteId).toBe(firstId)
    expect(getActiveSuite(state).cases).toEqual(['a', 'b'])
    expect(state.suites[1].cases).toEqual([''])
  })

  it('ignores switching to an unknown suite id', () => {
    const state = createInitialState(1000)
    expect(setActiveSuite(state, 'nope')).toBe(state)
  })

  it('renames and duplicates suites', () => {
    let state = createInitialState(1000)
    const id = state.activeSuiteId
    state = setSuiteCases(state, id, ['x'], 2000)
    state = renameSuite(state, id, '  Renamed  ', 3000)
    expect(state.suites[0].name).toBe('Renamed')
    expect(state.suites[0].updatedAt).toBe(3000)

    state = duplicateSuite(state, id, 'Renamed (copy)', 4000)
    expect(state.suites).toHaveLength(2)
    expect(state.activeSuiteId).toBe(state.suites[1].id)
    expect(state.suites[1].name).toBe('Renamed (copy)')
    expect(state.suites[1].cases).toEqual(['x'])
    expect(state.suites[1].id).not.toBe(id)
  })

  it('ignores blank names when renaming', () => {
    const state = createInitialState(1000)
    expect(renameSuite(state, state.activeSuiteId, '   ')).toBe(state)
  })
})

describe('removeSuite', () => {
  it('blocks deleting the last remaining suite', () => {
    const state = createInitialState(1000)
    const result = removeSuite(state, state.activeSuiteId)
    expect(result.removed).toBe(false)
    expect(result.state).toBe(state)
  })

  it('switches to a remaining suite when the active one is deleted', () => {
    let state = createInitialState(1000)
    const firstId = state.activeSuiteId
    state = addSuite(state, 'Second', 2000)
    const secondId = state.activeSuiteId

    const result = removeSuite(state, secondId)
    expect(result.removed).toBe(true)
    expect(result.state.suites).toHaveLength(1)
    expect(result.state.activeSuiteId).toBe(firstId)
  })

  it('keeps the active suite when another suite is deleted', () => {
    let state = createInitialState(1000)
    const firstId = state.activeSuiteId
    state = addSuite(state, 'Second', 2000)
    const secondId = state.activeSuiteId

    const result = removeSuite(state, firstId)
    expect(result.removed).toBe(true)
    expect(result.state.activeSuiteId).toBe(secondId)
  })
})

describe('permalink import', () => {
  it('overwrites only the active suite cases', () => {
    let state = createInitialState(1000)
    const firstId = state.activeSuiteId
    state = setSuiteCases(state, firstId, ['old'], 2000)
    state = addSuite(state, 'Second', 3000)
    state = setSuiteCases(state, state.activeSuiteId, ['keep'], 4000)
    state = setActiveSuite(state, firstId)

    // importing a permalink replaces the active suite cases
    state = setSuiteCases(state, state.activeSuiteId, ['from', 'link'], 5000)
    expect(getActiveSuite(state).cases).toEqual(['from', 'link'])
    // other suites are preserved
    expect(state.suites).toHaveLength(2)
    expect(state.suites[1].cases).toEqual(['keep'])
    expect(state.suites[0].updatedAt).toBe(5000)
  })
})
