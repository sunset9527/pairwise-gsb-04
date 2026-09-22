import { beforeEach, describe, expect, it } from 'vitest'
import { createStore } from 'jotai'
import { STORAGE_TEST_CASES } from '@/constants'
import {
  activeSuiteAtom,
  createSuiteAtom,
  removeSuiteAtom,
  setActiveSuiteCasesAtom,
  switchSuiteAtom,
  testSuitesAtom,
} from '../test-suites'
import { TEST_SUITES_STORAGE_VERSION } from '@/utils/test-suites'

beforeEach(() => {
  localStorage.clear()
})

describe('testSuitesAtom storage migration', () => {
  it('migrates legacy string[] storage into a default suite and persists it back', () => {
    localStorage.setItem(STORAGE_TEST_CASES, JSON.stringify(['foo', 'bar']))

    const store = createStore()
    const state = store.get(testSuitesAtom)

    expect(state.suites).toHaveLength(1)
    expect(state.suites[0].cases).toEqual(['foo', 'bar'])
    expect(state.activeSuiteId).toBe(state.suites[0].id)

    // the migrated state is written back to localStorage immediately
    const persisted = JSON.parse(localStorage.getItem(STORAGE_TEST_CASES)!)
    expect(persisted.version).toBe(TEST_SUITES_STORAGE_VERSION)
    expect(persisted.suites[0].cases).toEqual(['foo', 'bar'])
    expect(persisted.activeSuiteId).toBe(state.suites[0].id)
  })

  it('restores suites and the active suite id after a reload', () => {
    const first = createStore()
    first.set(createSuiteAtom, 'Second')
    const activeId = first.get(testSuitesAtom).activeSuiteId

    // a new store simulates a page reload
    const second = createStore()
    const restored = second.get(testSuitesAtom)
    expect(restored.suites).toHaveLength(2)
    expect(restored.activeSuiteId).toBe(activeId)
    expect(second.get(activeSuiteAtom).name).toBe('Second')
  })
})

describe('suite switching via atoms', () => {
  it('switches between suites and persists the selection', () => {
    const store = createStore()
    const firstId = store.get(testSuitesAtom).activeSuiteId
    store.set(createSuiteAtom, 'Second')
    expect(store.get(testSuitesAtom).activeSuiteId).not.toBe(firstId)

    store.set(switchSuiteAtom, firstId)
    expect(store.get(testSuitesAtom).activeSuiteId).toBe(firstId)

    const persisted = JSON.parse(localStorage.getItem(STORAGE_TEST_CASES)!)
    expect(persisted.activeSuiteId).toBe(firstId)
  })
})

describe('removeSuiteAtom', () => {
  it('refuses to delete the last suite', () => {
    const store = createStore()
    const before = store.get(testSuitesAtom)
    const removed = store.set(removeSuiteAtom, before.activeSuiteId)
    expect(removed).toBe(false)
    expect(store.get(testSuitesAtom)).toBe(before)
  })

  it('switches to a remaining suite when the active one is removed', () => {
    const store = createStore()
    const firstId = store.get(testSuitesAtom).activeSuiteId
    store.set(createSuiteAtom, 'Second')
    const secondId = store.get(testSuitesAtom).activeSuiteId

    const removed = store.set(removeSuiteAtom, secondId)
    expect(removed).toBe(true)
    expect(store.get(testSuitesAtom).suites).toHaveLength(1)
    expect(store.get(testSuitesAtom).activeSuiteId).toBe(firstId)
  })
})

describe('permalink import via atoms', () => {
  it('overwrites only the active suite cases', () => {
    const store = createStore()
    const firstId = store.get(testSuitesAtom).activeSuiteId
    store.set(setActiveSuiteCasesAtom, ['old'])
    store.set(createSuiteAtom, 'Second')
    store.set(setActiveSuiteCasesAtom, ['keep'])
    store.set(switchSuiteAtom, firstId)

    // importing a permalink replaces the active suite cases
    store.set(setActiveSuiteCasesAtom, ['from', 'link'])

    const state = store.get(testSuitesAtom)
    expect(state.activeSuiteId).toBe(firstId)
    expect(store.get(activeSuiteAtom).cases).toEqual(['from', 'link'])
    // other suites are preserved
    expect(state.suites).toHaveLength(2)
    expect(state.suites[1].cases).toEqual(['keep'])

    // and persisted immediately
    const persisted = JSON.parse(localStorage.getItem(STORAGE_TEST_CASES)!)
    expect(persisted.suites[0].cases).toEqual(['from', 'link'])
    expect(persisted.suites[1].cases).toEqual(['keep'])
  })
})
