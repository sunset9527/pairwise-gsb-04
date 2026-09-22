import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { STORAGE_TEST_CASES } from '@/constants'
import {
  addSuite,
  createInitialState,
  duplicateSuite,
  getActiveSuite,
  parseStoredState,
  removeSuite,
  renameSuite,
  setActiveSuite,
  setSuiteCases,
} from '@/utils/test-suites'
import type { TestSuitesState } from '@/utils/test-suites'

function serialize(state: TestSuitesState): string {
  return JSON.stringify(state)
}

// Storage adapter that migrates the legacy `string[]` format on first read
// and persists the migrated state back immediately.
const migrationStorage = {
  getItem: (key: string): TestSuitesState => {
    const raw = localStorage.getItem(key)
    const state = parseStoredState(raw)
    if (raw !== serialize(state)) {
      localStorage.setItem(key, serialize(state))
    }
    return state
  },
  setItem: (key: string, value: TestSuitesState): void => {
    localStorage.setItem(key, serialize(value))
  },
  removeItem: (key: string): void => {
    localStorage.removeItem(key)
  },
}

export const testSuitesAtom = atomWithStorage<TestSuitesState>(
  STORAGE_TEST_CASES,
  createInitialState(),
  migrationStorage,
  { getOnInit: true },
)

export const activeSuiteAtom = atom(get => getActiveSuite(get(testSuitesAtom)))

export const switchSuiteAtom = atom(null, (get, set, id: string) => {
  set(testSuitesAtom, setActiveSuite(get(testSuitesAtom), id))
})

export const createSuiteAtom = atom(null, (get, set, name: string) => {
  set(testSuitesAtom, addSuite(get(testSuitesAtom), name))
})

export const duplicateSuiteAtom = atom(null, (get, set, payload: { id: string, name: string }) => {
  set(testSuitesAtom, duplicateSuite(get(testSuitesAtom), payload.id, payload.name))
})

export const renameSuiteAtom = atom(null, (get, set, payload: { id: string, name: string }) => {
  set(testSuitesAtom, renameSuite(get(testSuitesAtom), payload.id, payload.name))
})

export const removeSuiteAtom = atom(null, (get, set, id: string) => {
  const { state, removed } = removeSuite(get(testSuitesAtom), id)
  if (removed) {
    set(testSuitesAtom, state)
  }
  return removed
})

// Used by both the test tab editors and the permalink import:
// always targets the currently active suite and never touches the others.
export const setActiveSuiteCasesAtom = atom(null, (get, set, cases: string[]) => {
  const state = get(testSuitesAtom)
  set(testSuitesAtom, setSuiteCases(state, state.activeSuiteId, cases))
})
