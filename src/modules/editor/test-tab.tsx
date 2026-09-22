import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAtomValue, useSetAtom } from 'jotai'
import produce from 'immer'
import { useCopyToClipboard } from 'usehooks-ts'
import {
  Copy as CopyIcon,
  Link as LinkIcon,
  PencilSimple as PencilIcon,
  Plus as PlusIcon,
  Trash as TrashIcon,
} from '@phosphor-icons/react'
import { nanoid } from 'nanoid'
import TestItem from '@/components/test-item'
import { gen } from '@/parser'
import {
  activeSuiteAtom,
  astAtom,
  createSuiteAtom,
  duplicateSuiteAtom,
  removeSuiteAtom,
  renameSuiteAtom,
  setSuiteTestsAtom,
  suitesAtom,
  switchSuiteAtom,
} from '@/atom'
import { genPermalink } from '@/utils/helpers'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Case = {
  value: string
  id: string
}

function toCases(tests: string[]): Case[] {
  return tests.map(value => ({ value, id: nanoid() }))
}

function TestTab() {
  const { t } = useTranslation()
  const suites = useAtomValue(suitesAtom)
  const activeSuite = useAtomValue(activeSuiteAtom)
  const switchSuite = useSetAtom(switchSuiteAtom)
  const createSuite = useSetAtom(createSuiteAtom)
  const duplicateSuite = useSetAtom(duplicateSuiteAtom)
  const renameSuite = useSetAtom(renameSuiteAtom)
  const removeSuite = useSetAtom(removeSuiteAtom)
  const setSuiteTests = useSetAtom(setSuiteTestsAtom)

  const [cases, setCases] = useState<Case[]>(() => toCases(activeSuite.tests))
  const [draftName, setDraftName] = useState<string | null>(null)

  // Re-sync local ids when the active suite's tests change from the outside
  // (suite switch, permalink import, ...). Updates originating from this tab
  // already match `cases`, so they don't trigger a remount of the
  // uncontrolled textareas.
  useEffect(() => {
    setCases((prev) => {
      const tests = activeSuite.tests
      const inSync = prev.length === tests.length && prev.every((item, index) => item.value === tests[index])
      return inSync ? prev : toCases(tests)
    })
  }, [activeSuite])

  const ast = useAtomValue(astAtom)
  const regExp = useMemo(() => {
    const regex = gen(ast, { literal: false, escapeBackslash: false })
    return new RegExp(regex, ast.flags.join(''))
  }, [ast])

  const { toast } = useToast()
  const [, copy] = useCopyToClipboard()

  const saveCases = (cases: Case[]) => {
    setCases(cases)
    setSuiteTests({ id: activeSuite.id, tests: cases.map(({ value }) => value) })
  }

  const handleCopyPermalink = () => {
    const permalink = genPermalink(cases.map(({ value }) => value))
    copy(permalink)
    toast({ description: t('Permalink copied.') })
  }

  const handleChange = (value: string, index: number) => {
    saveCases(
      produce(cases!, (draft) => {
        draft[index].value = value
      }),
    )
  }

  const handleRemove = (index: number) => {
    saveCases(
      produce(cases!, (draft) => {
        draft.splice(index, 1)
      }),
    )
  }

  const handleAdd = () => {
    saveCases(
      produce(cases!, (draft) => {
        draft.push({
          value: '',
          id: nanoid(),
        })
      }),
    )
  }

  const commitRename = () => {
    if (draftName === null) {
      return
    }
    const name = draftName.trim()
    if (name && name !== activeSuite.name) {
      renameSuite({ id: activeSuite.id, name })
    }
    setDraftName(null)
  }

  const handleRemoveSuite = () => {
    if (suites.length <= 1) {
      toast({ description: t('At least one test suite is required.') })
      return
    }
    removeSuite(activeSuite.id)
  }

  return (
    <div>
      <div className="flex items-center space-x-1 mb-4">
        {draftName !== null
          ? (
              <input
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={draftName}
                autoFocus
                data-testid="suite-name-input"
                onChange={e => setDraftName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') {
                    commitRename()
                  }
                  else if (e.key === 'Escape') {
                    setDraftName(null)
                  }
                }}
              />
            )
          : (
              <Select value={activeSuite.id} onValueChange={switchSuite}>
                <SelectTrigger className="flex-1" data-testid="suite-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {suites.map(suite => (
                    <SelectItem key={suite.id} value={suite.id}>
                      {suite.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
        <Button
          variant="ghost"
          size="icon"
          title={t('Rename suite')}
          data-testid="rename-suite"
          onClick={() => setDraftName(activeSuite.name)}
        >
          <PencilIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title={t('Duplicate suite')}
          data-testid="duplicate-suite"
          onClick={() => duplicateSuite(activeSuite.id)}
        >
          <CopyIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title={t('New suite')}
          data-testid="create-suite"
          onClick={() => createSuite()}
        >
          <PlusIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title={t('Delete suite')}
          data-testid="delete-suite"
          onClick={handleRemoveSuite}
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-6">
        {cases!.map(({ value, id }, index) => (
          <React.Fragment key={id}>
            <TestItem
              value={value}
              regExp={regExp}
              onChange={value => handleChange(value, index)}
              onRemove={() => handleRemove(index)}
            />
          </React.Fragment>
        ))}
      </div>
      <div className="flex justify-end space-x-2 mt-4">
        <Button variant="ghost" size="icon" onClick={handleAdd}>
          <PlusIcon className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleCopyPermalink}>
          <LinkIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export default TestTab
