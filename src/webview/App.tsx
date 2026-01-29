import { useEffect, useState } from 'react'
import { useStore } from './store'
import { KanbanBoard } from './components/KanbanBoard'
import { CreateFeatureDialog } from './components/CreateFeatureDialog'
import { FeatureEditor } from './components/FeatureEditor'
import { Toolbar } from './components/Toolbar'
import type { Feature, FeatureStatus, Priority, ExtensionMessage, FeatureFrontmatter } from '../shared/types'

// Declare vscode API type
declare const acquireVsCodeApi: () => {
  postMessage: (message: unknown) => void
  getState: () => unknown
  setState: (state: unknown) => void
}

const vscode = acquireVsCodeApi()

function App(): React.JSX.Element {

  const {
    columns,
    setFeatures,
    setColumns,
    updateFeature,
    setIsDarkMode
  } = useStore()

  const [createFeatureOpen, setCreateFeatureOpen] = useState(false)
  const [createFeatureStatus, setCreateFeatureStatus] = useState<FeatureStatus>('backlog')

  // Editor state
  const [editingFeature, setEditingFeature] = useState<{
    id: string
    content: string
    frontmatter: FeatureFrontmatter
  } | null>(null)

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return
      }

      switch (e.key) {
        case 'n':
          // Don't open new feature panel if editing an existing feature
          if (editingFeature) {
            return
          }
          e.preventDefault()
          setCreateFeatureStatus('backlog')
          setCreateFeatureOpen(true)
          break
        case 'Escape':
          if (createFeatureOpen) {
            setCreateFeatureOpen(false)
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [createFeatureOpen, editingFeature])

  // Listen for VSCode theme changes
  useEffect(() => {
    const updateTheme = () => {
      const isDark = document.body.classList.contains('vscode-dark') ||
                     document.body.classList.contains('vscode-high-contrast')
      setIsDarkMode(isDark)
      if (isDark) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }

    updateTheme()

    // Watch for class changes on body
    const observer = new MutationObserver(updateTheme)
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })

    return () => observer.disconnect()
  }, [setIsDarkMode])

  // Listen for messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data

      switch (message.type) {
        case 'init':
          setFeatures(message.features)
          setColumns(message.columns)
          break
        case 'featuresUpdated':
          setFeatures(message.features)
          break
        case 'triggerCreateDialog':
          setCreateFeatureStatus('backlog')
          setCreateFeatureOpen(true)
          break
        case 'featureContent':
          setEditingFeature({
            id: message.featureId,
            content: message.content,
            frontmatter: message.frontmatter
          })
          break
      }
    }

    window.addEventListener('message', handleMessage)

    // Tell extension we're ready
    vscode.postMessage({ type: 'ready' })

    return () => window.removeEventListener('message', handleMessage)
  }, [setFeatures, setColumns])

  const handleFeatureClick = (feature: Feature): void => {
    // Request feature content for inline editing
    vscode.postMessage({
      type: 'openFeature',
      featureId: feature.id
    })
  }

  const handleSaveFeature = (content: string, frontmatter: FeatureFrontmatter): void => {
    if (!editingFeature) return
    vscode.postMessage({
      type: 'saveFeatureContent',
      featureId: editingFeature.id,
      content,
      frontmatter
    })
  }

  const handleCloseEditor = (): void => {
    setEditingFeature(null)
    vscode.postMessage({ type: 'closeFeature' })
  }

  const handleStartWithAI = (agent: 'claude' | 'codex' | 'opencode', permissionMode: 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions'): void => {
    vscode.postMessage({ type: 'startWithAI', agent, permissionMode })
  }

  const handleAddFeatureInColumn = (status: string): void => {
    setCreateFeatureStatus(status as FeatureStatus)
    setCreateFeatureOpen(true)
  }

  const handleCreateFeature = (data: {
    status: FeatureStatus
    priority: Priority
    content: string
  }): void => {
    vscode.postMessage({
      type: 'createFeature',
      data
    })
  }

  const handleMoveFeature = (
    featureId: string,
    newStatus: string,
    newOrder: number
  ): void => {
    // Optimistic update
    updateFeature(featureId, { status: newStatus as FeatureStatus, order: newOrder })

    // Tell extension to persist
    vscode.postMessage({
      type: 'moveFeature',
      featureId,
      newStatus,
      newOrder
    })
  }

  // Show loading if no columns yet
  if (columns.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[var(--vscode-editor-background)]">
        <div className="text-[var(--vscode-foreground)] opacity-60">Loading...</div>
      </div>
    )
  }

  return (
    <div className="h-full w-full flex flex-col bg-[var(--vscode-editor-background)]">
      <Toolbar />
      <div className="flex-1 flex overflow-hidden">
        <div className={editingFeature ? 'w-1/2' : 'w-full'}>
          <KanbanBoard
            onFeatureClick={handleFeatureClick}
            onAddFeature={handleAddFeatureInColumn}
            onMoveFeature={handleMoveFeature}
            onQuickAdd={handleCreateFeature}
          />
        </div>
        {editingFeature && (
          <div className="w-1/2">
            <FeatureEditor
              featureId={editingFeature.id}
              content={editingFeature.content}
              frontmatter={editingFeature.frontmatter}
              onSave={handleSaveFeature}
              onClose={handleCloseEditor}
              onStartWithAI={handleStartWithAI}
            />
          </div>
        )}
      </div>

      <CreateFeatureDialog
        isOpen={createFeatureOpen}
        onClose={() => setCreateFeatureOpen(false)}
        onCreate={handleCreateFeature}
        initialStatus={createFeatureStatus}
      />
    </div>
  )
}

export default App
