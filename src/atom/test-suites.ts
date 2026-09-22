import { atom } from 'jotai'
import { nanoid } from 'nanoid'
import { STORAGE_TEST_CASES } from '@/constants'

export type TestSuite = {
  id: string
  name: string
  tests: string[]
  createdAt: number
  updatedAt: number
}

export type TestSuitesData = {
  version: 1
  suites: TestSuite[]
  activeSuiteId: string
}

export const DEFAULT_SUITE_NAME = 'Default'

export function createTestSuite(name: string, tests: string[] = []): TestSuite {
  const now = Date.now()
  return {
    id: nanoid(),
    name,
    tests: [...tests],
    createdAt: now,
    updatedAt: now,
  }
}

export function createDefaultData(tests: string[] = ['']): TestSuitesData {
  const suite = createTestSuite(DEFAULT_SUITE_NAME, tests)
  return { version: 1, suites: [suite], activeSuiteId: suite.id }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function normalizeSuite(raw: unknown, fallbackName: string): TestSuite {
  const suite = (raw ?? {}) as Partial<TestSuite>
  const now = Date.now()
  return {
    id: typeof suite.id === 'string' && suite.id ? suite.id : nanoid(),
    name: typeof suite.name === 'string' && suite.name ? suite.name : fallbackName,
    tests: isStringArray(suite.tests) ? [...suite.tests] : [],
    createdAt: typeof suite.createdAt === 'number' ? suite.createdAt : now,
    updatedAt: typeof suite.updatedAt === 'number' ? suite.updatedAt : now,
  }
}

// Accepts both the current TestSuitesData shape and the legacy
// format (a plain string[] of test cases) and always returns
// a valid TestSuitesData without dropping any test cases.
export function migrateTestSuites(raw: unknown): TestSuitesData {
  // legacy format: the storage value itself was the test case array
  if (isStringArray(raw)) {
    return createDefaultData(raw)
  }
  if (raw !== null && typeof raw === 'object') {
    const candidate = raw as Partial<TestSuitesData>
    const suites = Array.isArray(candidate.suites)
      ? candidate.suites.map((suite, index) => normalizeSuite(suite, `${DEFAULT_SUITE_NAME} ${index + 1}`))
      : []
    if (suites.length > 0) {
      const activeSuiteId = suites.some(suite => suite.id === candidate.activeSuiteId)
        ? candidate.activeSuiteId as string
        : suites[0].id
      return { version: 1, suites, activeSuiteId }
    }
  }
  return createDefaultData()
}

export function loadTestSuites(key: string = STORAGE_TEST_CASES): TestSuitesData {
  const raw = window.localStorage.getItem(key)
  if (raw === null) {
    return createDefaultData()
  }
  try {
    return migrateTestSuites(JSON.parse(raw))
  }
  catch {
    return createDefaultData()
  }
}

function persistTestSuites(data: TestSuitesData) {
  window.localStorage.setItem(STORAGE_TEST_CASES, JSON.stringify(data))
}

// null = not loaded from localStorage yet
const baseTestSuitesAtom = atom<TestSuitesData | null>(null)

// Loads (and migrates, if needed) from localStorage lazily on first read,
// so both React components and non-React writers (e.g. permalink import)
// always see the persisted data. Every write is persisted immediately.
export const testSuitesAtom = atom(
  (get) => {
    const cached = get(baseTestSuitesAtom)
    if (cached !== null) {
      return cached
    }
    const data = loadTestSuites()
    // persist migrated data right away so legacy data is upgraded in place
    persistTestSuites(data)
    return data
  },
  (get, set, update: TestSuitesData | ((prev: TestSuitesData) => TestSuitesData)) => {
    const prev = get(testSuitesAtom)
    const next = typeof update === 'function' ? update(prev) : update
    set(baseTestSuitesAtom, next)
    persistTestSuites(next)
  },
)

export const suitesAtom = atom(get => get(testSuitesAtom).suites)

export const activeSuiteAtom = atom((get) => {
  const { suites, activeSuiteId } = get(testSuitesAtom)
  return suites.find(suite => suite.id === activeSuiteId) ?? suites[0]
})

// --- pure reducers (also used by tests) ---

export function switchSuite(data: TestSuitesData, id: string): TestSuitesData {
  if (!data.suites.some(suite => suite.id === id)) {
    return data
  }
  return { ...data, activeSuiteId: id }
}

export function nextSuiteName(suites: TestSuite[]): string {
  const base = 'New Suite'
  const names = new Set(suites.map(suite => suite.name))
  if (!names.has(base)) {
    return base
  }
  let count = 2
  while (names.has(`${base} ${count}`)) {
    count += 1
  }
  return `${base} ${count}`
}

export function addSuite(data: TestSuitesData, suite: TestSuite): TestSuitesData {
  return { ...data, suites: [...data.suites, suite], activeSuiteId: suite.id }
}

export function renameSuite(data: TestSuitesData, id: string, name: string): TestSuitesData {
  return {
    ...data,
    suites: data.suites.map(suite =>
      suite.id === id ? { ...suite, name, updatedAt: Date.now() } : suite,
    ),
  }
}

export function duplicateSuite(data: TestSuitesData, id: string): TestSuitesData {
  const index = data.suites.findIndex(suite => suite.id === id)
  if (index === -1) {
    return data
  }
  const source = data.suites[index]
  const copy = createTestSuite(`${source.name} copy`, source.tests)
  const suites = [...data.suites]
  suites.splice(index + 1, 0, copy)
  return { ...data, suites, activeSuiteId: copy.id }
}

export function removeSuite(data: TestSuitesData, id: string): { data: TestSuitesData, removed: boolean } {
  // the last remaining suite must not be deleted
  if (data.suites.length <= 1) {
    return { data, removed: false }
  }
  const index = data.suites.findIndex(suite => suite.id === id)
  if (index === -1) {
    return { data, removed: false }
  }
  const suites = data.suites.filter(suite => suite.id !== id)
  const activeSuiteId = data.activeSuiteId === id
    ? suites[Math.min(index, suites.length - 1)].id
    : data.activeSuiteId
  return { data: { ...data, suites, activeSuiteId }, removed: true }
}

export function updateSuiteTests(data: TestSuitesData, id: string, tests: string[]): TestSuitesData {
  return {
    ...data,
    suites: data.suites.map(suite =>
      suite.id === id ? { ...suite, tests: [...tests], updatedAt: Date.now() } : suite,
    ),
  }
}

// --- write atoms ---

export const switchSuiteAtom = atom(null, (get, set, id: string) => {
  set(testSuitesAtom, switchSuite(get(testSuitesAtom), id))
})

export const createSuiteAtom = atom(null, (get, set) => {
  const data = get(testSuitesAtom)
  set(testSuitesAtom, addSuite(data, createTestSuite(nextSuiteName(data.suites))))
})

export const duplicateSuiteAtom = atom(null, (get, set, id: string) => {
  set(testSuitesAtom, duplicateSuite(get(testSuitesAtom), id))
})

export const renameSuiteAtom = atom(null, (get, set, payload: { id: string, name: string }) => {
  set(testSuitesAtom, renameSuite(get(testSuitesAtom), payload.id, payload.name))
})

export const removeSuiteAtom = atom(null, (get, set, id: string): boolean => {
  const { data, removed } = removeSuite(get(testSuitesAtom), id)
  if (removed) {
    set(testSuitesAtom, data)
  }
  return removed
})

export const setSuiteTestsAtom = atom(null, (get, set, payload: { id: string, tests: string[] }) => {
  set(testSuitesAtom, updateSuiteTests(get(testSuitesAtom), payload.id, payload.tests))
})

// permalink import: overwrite the tests of the currently active suite
export const importTestsAtom = atom(null, (get, set, tests: string[]) => {
  const data = get(testSuitesAtom)
  set(testSuitesAtom, updateSuiteTests(data, data.activeSuiteId, tests))
})
