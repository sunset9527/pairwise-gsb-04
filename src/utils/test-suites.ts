import { nanoid } from 'nanoid'

export const TEST_SUITES_STORAGE_VERSION = 1
export const DEFAULT_SUITE_NAME = 'Default'

export interface TestSuite {
  id: string
  name: string
  cases: string[]
  createdAt: number
  updatedAt: number
}

export interface TestSuitesState {
  version: number
  activeSuiteId: string
  suites: TestSuite[]
}

export function createSuite(name: string, cases: string[] = [''], now: number = Date.now()): TestSuite {
  return {
    id: nanoid(),
    name,
    cases: [...cases],
    createdAt: now,
    updatedAt: now,
  }
}

export function createInitialState(now: number = Date.now()): TestSuitesState {
  const suite = createSuite(DEFAULT_SUITE_NAME, [''], now)
  return {
    version: TEST_SUITES_STORAGE_VERSION,
    activeSuiteId: suite.id,
    suites: [suite],
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isValidSuite(value: unknown): value is TestSuite {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const suite = value as Record<string, unknown>
  return (
    typeof suite.id === 'string'
    && typeof suite.name === 'string'
    && isStringArray(suite.cases)
    && typeof suite.createdAt === 'number'
    && typeof suite.updatedAt === 'number'
  )
}

function isPersistedState(value: unknown): value is TestSuitesState {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const state = value as Record<string, unknown>
  return (
    Array.isArray(state.suites)
    && state.suites.length > 0
    && state.suites.every(isValidSuite)
    && typeof state.activeSuiteId === 'string'
    && state.suites.some(suite => suite.id === state.activeSuiteId)
  )
}

/**
 * Migrates the legacy persisted format (a bare `string[]` of test cases)
 * into a single default suite, keeping every legacy case untouched.
 */
export function migrateLegacyCases(cases: string[], now: number = Date.now()): TestSuitesState {
  const suite = createSuite(DEFAULT_SUITE_NAME, cases.length > 0 ? cases : [''], now)
  return {
    version: TEST_SUITES_STORAGE_VERSION,
    activeSuiteId: suite.id,
    suites: [suite],
  }
}

/**
 * Parses the raw localStorage value into a valid state.
 * Handles: empty storage, legacy `string[]`, current versioned format,
 * and falls back to a fresh state on corrupted data.
 */
export function parseStoredState(raw: string | null, now: number = Date.now()): TestSuitesState {
  if (raw === null) {
    return createInitialState(now)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    return createInitialState(now)
  }
  if (isStringArray(parsed)) {
    return migrateLegacyCases(parsed, now)
  }
  if (isPersistedState(parsed)) {
    return { ...parsed, version: TEST_SUITES_STORAGE_VERSION }
  }
  return createInitialState(now)
}

export function getActiveSuite(state: TestSuitesState): TestSuite {
  return state.suites.find(suite => suite.id === state.activeSuiteId) ?? state.suites[0]
}

function touchSuite(suite: TestSuite, patch: Partial<TestSuite>, now: number): TestSuite {
  return { ...suite, ...patch, updatedAt: now }
}

export function addSuite(state: TestSuitesState, name: string, now: number = Date.now()): TestSuitesState {
  const suite = createSuite(name, [''], now)
  return { ...state, suites: [...state.suites, suite], activeSuiteId: suite.id }
}

export function duplicateSuite(state: TestSuitesState, id: string, copyName: string, now: number = Date.now()): TestSuitesState {
  const source = state.suites.find(suite => suite.id === id)
  if (!source) {
    return state
  }
  const copy: TestSuite = {
    ...createSuite(copyName, source.cases, now),
    createdAt: now,
  }
  return { ...state, suites: [...state.suites, copy], activeSuiteId: copy.id }
}

export function renameSuite(state: TestSuitesState, id: string, name: string, now: number = Date.now()): TestSuitesState {
  const trimmed = name.trim()
  if (trimmed === '') {
    return state
  }
  return {
    ...state,
    suites: state.suites.map(suite => (suite.id === id ? touchSuite(suite, { name: trimmed }, now) : suite)),
  }
}

export type RemoveSuiteResult = {
  state: TestSuitesState
  removed: boolean
}

export function removeSuite(state: TestSuitesState, id: string): RemoveSuiteResult {
  if (state.suites.length <= 1) {
    return { state, removed: false }
  }
  const index = state.suites.findIndex(suite => suite.id === id)
  if (index === -1) {
    return { state, removed: false }
  }
  const suites = state.suites.filter(suite => suite.id !== id)
  const activeSuiteId = state.activeSuiteId === id
    ? suites[Math.min(index, suites.length - 1)].id
    : state.activeSuiteId
  return { state: { ...state, suites, activeSuiteId }, removed: true }
}

export function setActiveSuite(state: TestSuitesState, id: string): TestSuitesState {
  if (!state.suites.some(suite => suite.id === id)) {
    return state
  }
  return { ...state, activeSuiteId: id }
}

export function setSuiteCases(state: TestSuitesState, id: string, cases: string[], now: number = Date.now()): TestSuitesState {
  return {
    ...state,
    suites: state.suites.map(suite => (suite.id === id ? touchSuite(suite, { cases: [...cases] }, now) : suite)),
  }
}
