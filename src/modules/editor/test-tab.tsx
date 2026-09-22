import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAtomValue, useSetAtom } from 'jotai'
import { nanoid } from 'nanoid'
import { useCopyToClipboard } from 'usehooks-ts'
import {
  CaretDown as CaretDownIcon,
  Check as CheckIcon,
  Copy as CopyIcon,
  Link as LinkIcon,
  PencilSimple as PencilIcon,
  Plus as PlusIcon,
  Trash as TrashIcon,
} from '@phosphor-icons/react'
import clsx from 'clsx'
import TestItem from '@/components/test-item'
import { gen } from '@/parser'
import {
  activeSuiteAtom,
  astAtom,
  createSuiteAtom,
  duplicateSuiteAtom,
  removeSuiteAtom,
  renameSuiteAtom,
  setActiveSuiteCasesAtom,
  switchSuiteAtom,
  testSuitesAtom,
} from '@/atom'
import { genPermalink } from '@/utils/helpers'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function TestTab() {
  const { t } = useTranslation()
  const { suites } = useAtomValue(testSuitesAtom)
  const activeSuite = useAtomValue(activeSuiteAtom)
  const switchSuite = useSetAtom(switchSuiteAtom)
  const createSuite = useSetAtom(createSuiteAtom)
  const duplicateSuite = useSetAtom(duplicateSuiteAtom)
  const renameSuite = useSetAtom(renameSuiteAtom)
  const removeSuite = useSetAtom(removeSuiteAtom)
  const setActiveSuiteCases = useSetAtom(setActiveSuiteCasesAtom)

  const cases = activeSuite.cases

  // Row ids are local (not persisted) and regenerated whenever the cases
  // array is replaced externally (suite switch / permalink import), so
  // uncontrolled textareas never reuse a stale React key.
  const [rowIds, setRowIds] = useState<string[]>(() => cases.map(() => nanoid()))
  const lastCasesRef = useRef(cases)
  useEffect(() => {
    if (lastCasesRef.current !== cases) {
      lastCasesRef.current = cases
      setRowIds(cases.map(() => nanoid()))
    }
  }, [cases])

  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameCancelledRef = useRef(false)

  const ast = useAtomValue(astAtom)
  const regExp = useMemo(() => {
    const regex = gen(ast, { literal: false, escapeBackslash: false })
    return new RegExp(regex, ast.flags.join(''))
  }, [ast])

  const { toast } = useToast()
  const [, copy] = useCopyToClipboard()

  const saveCases = (nextCases: string[], nextRowIds?: string[]) => {
    lastCasesRef.current = nextCases
    if (nextRowIds) {
      setRowIds(nextRowIds)
    }
    setActiveSuiteCases(nextCases)
  }

  const handleCopyPermalink = () => {
    const permalink = genPermalink([...cases])
    copy(permalink)
    toast({ description: t('Permalink copied.') })
  }

  const handleChange = (value: string, index: number) => {
    const nextCases = cases.map((item, i) => (i === index ? value : item))
    saveCases(nextCases)
  }

  const handleRemove = (index: number) => {
    saveCases(
      cases.filter((_, i) => i !== index),
      rowIds.filter((_, i) => i !== index),
    )
  }

  const handleAdd = () => {
    saveCases([...cases, ''], [...rowIds, nanoid()])
  }

  const startRename = () => {
    renameCancelledRef.current = false
    setRenameValue(activeSuite.name)
    setRenaming(true)
  }

  const commitRename = () => {
    if (!renameCancelledRef.current) {
      renameSuite({ id: activeSuite.id, name: renameValue })
    }
    setRenaming(false)
  }

  const handleDuplicate = () => {
    duplicateSuite({ id: activeSuite.id, name: `${activeSuite.name} (${t('copy')})` })
  }

  const handleDelete = () => {
    const removed = removeSuite(activeSuite.id)
    if (!removed) {
      toast({
        variant: 'destructive',
        description: t('You cannot delete the last test suite.'),
      })
    }
  }

  return (
    <div>
      <div className="mb-4" data-testid="suite-selector">
        {renaming
          ? (
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={renameValue}
                aria-label={t('Suite name')}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') {
                    commitRename()
                  }
                  if (e.key === 'Escape') {
                    renameCancelledRef.current = true
                    setRenaming(false)
                  }
                }}
              />
            )
          : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between px-3" data-testid="suite-selector-trigger">
                    <span className="truncate">{activeSuite.name}</span>
                    <CaretDownIcon className="h-4 w-4 shrink-0 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[273px]" align="start">
                  {suites.map(suite => (
                    <DropdownMenuItem
                      key={suite.id}
                      onSelect={() => switchSuite(suite.id)}
                    >
                      <CheckIcon
                        className={clsx('mr-2 h-4 w-4 shrink-0', {
                          'opacity-0': suite.id !== activeSuite.id,
                        })}
                      />
                      <span className="truncate">{suite.name}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => createSuite(t('New suite'))}>
                    <PlusIcon className="mr-2 h-4 w-4" />
                    {t('New suite')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleDuplicate}>
                    <CopyIcon className="mr-2 h-4 w-4" />
                    {t('Duplicate suite')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={startRename}>
                    <PencilIcon className="mr-2 h-4 w-4" />
                    {t('Rename suite')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleDelete}>
                    <TrashIcon className="mr-2 h-4 w-4" />
                    {t('Delete suite')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
      </div>
      <div className="space-y-6">
        {cases.map((value, index) => (
          <React.Fragment key={rowIds[index] ?? index}>
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
