import { fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { Provider, createStore, getDefaultStore } from 'jotai'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/dom'
import App from '../src/App'
import TestTab from '../src/modules/editor/test-tab'
import { Toaster } from '../src/components/ui/toaster'
import { STORAGE_TEST_CASES } from '../src/constants'
import type { TestSuitesData } from '../src/atom/test-suites'
import {
  activeSuiteAtom,
  createTestSuite,
  loadTestSuites,
  migrateTestSuites,
  removeSuiteAtom,
  switchSuiteAtom,
  testSuitesAtom,
} from '../src/atom/test-suites'

function seedData(): TestSuitesData {
  const first = createTestSuite('Suite A', ['aaa'])
  const second = createTestSuite('Suite B', ['bbb'])
  return { version: 1, suites: [first, second], activeSuiteId: second.id }
}

function readStorage(): TestSuitesData {
  return JSON.parse(window.localStorage.getItem(STORAGE_TEST_CASES)!) as TestSuitesData
}

describe('test suites', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.history.pushState({}, '', '/')
  })

  describe('migration', () => {
    it('migrates legacy string[] storage into a default suite without losing data', () => {
      window.localStorage.setItem(STORAGE_TEST_CASES, JSON.stringify(['foo', 'bar']))
      const data = loadTestSuites()
      expect(data.suites).toHaveLength(1)
      expect(data.suites[0].tests).toEqual(['foo', 'bar'])
      expect(data.activeSuiteId).toBe(data.suites[0].id)
      expect(data.suites[0].name).toBeTruthy()
      expect(typeof data.suites[0].createdAt).toBe('number')
      expect(typeof data.suites[0].updatedAt).toBe('number')
    })

    it('keeps already-migrated data intact (idempotent)', () => {
      const migrated = migrateTestSuites(['foo'])
      expect(migrateTestSuites(migrated)).toEqual(migrated)
    })

    it('falls back to a default suite when storage is corrupted', () => {
      window.localStorage.setItem(STORAGE_TEST_CASES, '{invalid json')
      const data = loadTestSuites()
      expect(data.suites).toHaveLength(1)
      expect(data.activeSuiteId).toBe(data.suites[0].id)
    })
  })

  describe('suite switching', () => {
    it('switches the active suite and persists the selection', () => {
      const seeded = seedData()
      window.localStorage.setItem(STORAGE_TEST_CASES, JSON.stringify(seeded))
      const store = createStore()

      expect(store.get(activeSuiteAtom).id).toBe(seeded.suites[1].id)

      store.set(switchSuiteAtom, seeded.suites[0].id)

      expect(store.get(activeSuiteAtom).id).toBe(seeded.suites[0].id)
      expect(readStorage().activeSuiteId).toBe(seeded.suites[0].id)
    })

    it('switches to a remaining suite when the active suite is deleted', () => {
      const seeded = seedData()
      window.localStorage.setItem(STORAGE_TEST_CASES, JSON.stringify(seeded))
      const store = createStore()

      const removed = store.set(removeSuiteAtom, seeded.suites[1].id)

      expect(removed).toBe(true)
      const data = store.get(testSuitesAtom)
      expect(data.suites).toHaveLength(1)
      expect(data.activeSuiteId).toBe(seeded.suites[0].id)
    })

    it('shows the active suite name in the selector', () => {
      const seeded = seedData()
      window.localStorage.setItem(STORAGE_TEST_CASES, JSON.stringify(seeded))
      render(
        <Provider store={createStore()}>
          <TestTab />
        </Provider>,
      )
      expect(screen.getByTestId('suite-select')).toHaveTextContent('Suite B')
    })
  })

  describe('deleting the last suite', () => {
    it('refuses to delete the last remaining suite', () => {
      const store = createStore()
      const only = store.get(testSuitesAtom).suites[0]

      const removed = store.set(removeSuiteAtom, only.id)

      expect(removed).toBe(false)
      expect(store.get(testSuitesAtom).suites).toHaveLength(1)
    })

    it('shows a toast when deleting the last suite in the UI', async () => {
      const store = createStore()
      render(
        <Provider store={store}>
          <TestTab />
          <Toaster />
        </Provider>,
      )
      fireEvent.click(screen.getByTestId('delete-suite'))
      expect(await screen.findByText('At least one test suite is required.')).toBeInTheDocument()
      expect(store.get(testSuitesAtom).suites).toHaveLength(1)
    })
  })

  describe('permalink import', () => {
    it('overwrites only the active suite with tests from the URL', async () => {
      const seeded = seedData()
      window.localStorage.setItem(STORAGE_TEST_CASES, JSON.stringify(seeded))
      const tests = encodeURIComponent(JSON.stringify(['x1', 'x2']))
      window.history.pushState({}, '', `/?t=${tests}`)

      render(<App />)
      await act(async () => {})

      const data = getDefaultStore().get(testSuitesAtom)
      expect(data.suites).toHaveLength(2)
      expect(data.activeSuiteId).toBe(seeded.suites[1].id)

      const active = data.suites.find(suite => suite.id === data.activeSuiteId)!
      const other = data.suites.find(suite => suite.id !== data.activeSuiteId)!
      expect(active.tests).toEqual(['x1', 'x2'])
      expect(other.tests).toEqual(['aaa'])

      const persisted = readStorage()
      expect(persisted.suites.find(suite => suite.id === seeded.suites[1].id)!.tests).toEqual(['x1', 'x2'])
      expect(persisted.suites.find(suite => suite.id === seeded.suites[0].id)!.tests).toEqual(['aaa'])
    })
  })
})
