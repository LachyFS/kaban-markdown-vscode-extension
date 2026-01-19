import { useEffect, useCallback, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import {
  Calendar,
  User,
  ChevronDown,
  Sparkles
} from 'lucide-react'
import { useEditorStore } from './store'
import type { FeatureFrontmatter, AICodingAgent, AIPermissionMode } from '../../shared/editorTypes'
import type { Priority, FeatureStatus } from '../../shared/types'
import { cn } from '../lib/utils'

declare const acquireVsCodeApi: () => {
  postMessage: (message: unknown) => void
  getState: () => unknown
  setState: (state: unknown) => void
}

// Only acquire once - store on window to survive hot reloads
const vscode = (window as any).__vscode || ((window as any).__vscode = acquireVsCodeApi())

interface FrontmatterPanelProps {
  frontmatter: FeatureFrontmatter
  onUpdate: (updates: Partial<FeatureFrontmatter>) => void
}

const priorityLabels: Record<Priority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low'
}

const statusLabels: Record<FeatureStatus, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  'in-progress': 'In Progress',
  review: 'Review',
  done: 'Done'
}

const priorities: Priority[] = ['critical', 'high', 'medium', 'low']
const statuses: FeatureStatus[] = ['backlog', 'todo', 'in-progress', 'review', 'done']

// AI coding agents
const aiAgents: { value: AICodingAgent; label: string; color: string }[] = [
  { value: 'claude', label: 'Claude', color: '#c2410c' },
  { value: 'codex', label: 'Codex', color: '#059669' },
  { value: 'opencode', label: 'OpenCode', color: '#7c3aed' }
]

// Permission mode options
const permissionModes: { value: AIPermissionMode; label: string; description: string }[] = [
  { value: 'default', label: 'Default', description: 'Ask for permission on each action' },
  { value: 'plan', label: 'Plan Mode', description: 'Create a plan before making changes' },
  { value: 'acceptEdits', label: 'Auto-accept Edits', description: 'Automatically accept file edits' },
  { value: 'bypassPermissions', label: 'YOLO Mode', description: 'Skip all permission checks' }
]

interface DropdownProps {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  className?: string
}

function Dropdown({ value, options, onChange, className }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentOption = options.find(o => o.value === value)

  return (
    <div ref={dropdownRef} className="dropdown-container">
      <button
        className={cn('dropdown-trigger', className)}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{currentOption?.label || value}</span>
        <ChevronDown size={12} />
      </button>
      {isOpen && (
        <div className="dropdown-menu">
          {options.map(option => (
            <button
              key={option.value}
              className={cn('dropdown-item', option.value === value && 'active')}
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface AIAgentDropdownProps {
  onSelect: (agent: AICodingAgent, mode: AIPermissionMode) => void
}

function AIAgentDropdown({ onSelect }: AIAgentDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<AICodingAgent>('claude')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentAgent = aiAgents.find(a => a.value === selectedAgent)!

  return (
    <div ref={dropdownRef} className="ai-dropdown-container">
      <button
        className="ai-button"
        onClick={() => setIsOpen(!isOpen)}
        title={`Start working on this ticket with ${currentAgent.label}`}
        style={{ '--agent-color': currentAgent.color } as React.CSSProperties}
      >
        <Sparkles size={14} />
        <span>Start with AI</span>
        <ChevronDown size={12} />
      </button>
      {isOpen && (
        <div className="ai-dropdown-menu">
          {/* Agent selector */}
          <div className="ai-agent-selector">
            {aiAgents.map(agent => (
              <button
                key={agent.value}
                className={cn('ai-agent-tab', selectedAgent === agent.value && 'active')}
                onClick={() => setSelectedAgent(agent.value)}
                style={{ '--agent-color': agent.color } as React.CSSProperties}
              >
                {agent.label}
              </button>
            ))}
          </div>

          {/* Permission modes */}
          <div className="ai-permission-list">
            {permissionModes.map(mode => (
              <button
                key={mode.value}
                className="ai-dropdown-item"
                onClick={() => {
                  onSelect(selectedAgent, mode.value)
                  setIsOpen(false)
                }}
                style={{ '--agent-color': currentAgent.color } as React.CSSProperties}
              >
                <span className="ai-dropdown-label">{mode.label}</span>
                <span className="ai-dropdown-desc">{mode.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FrontmatterPanel({ frontmatter, onUpdate }: FrontmatterPanelProps) {
  const formatDueDate = (dateStr: string | null) => {
    if (!dateStr) return null
    const date = new Date(dateStr)
    const now = new Date()
    const diff = date.getTime() - now.getTime()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))

    if (days < 0) return { text: 'Overdue', className: 'text-red-500' }
    if (days === 0) return { text: 'Today', className: 'text-orange-500' }
    if (days === 1) return { text: 'Tomorrow', className: 'text-yellow-600 dark:text-yellow-400' }
    if (days <= 7) return { text: `${days}d`, className: 'text-zinc-500 dark:text-zinc-400' }

    return {
      text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      className: 'text-zinc-500 dark:text-zinc-400'
    }
  }

  const dueInfo = formatDueDate(frontmatter.dueDate)

  return (
    <div className="frontmatter-panel">
      {/* Left side - Title */}
      <div className="frontmatter-left">
        <span className="frontmatter-title">{frontmatter.title}</span>
      </div>

      {/* Right side - Status, Priority, Assignee, Due Date */}
      <div className="frontmatter-right">
        {/* Status dropdown */}
        <Dropdown
          value={frontmatter.status}
          options={statuses.map(s => ({ value: s, label: statusLabels[s] }))}
          onChange={(value) => onUpdate({ status: value as FeatureStatus })}
          className="status-dropdown"
        />

        {/* Priority dropdown */}
        <Dropdown
          value={frontmatter.priority}
          options={priorities.map(p => ({ value: p, label: priorityLabels[p] }))}
          onChange={(value) => onUpdate({ priority: value as Priority })}
          className={cn('priority-dropdown', `priority-${frontmatter.priority}`)}
        />

        {/* Labels */}
        {frontmatter.labels && frontmatter.labels.length > 0 && (
          <div className="frontmatter-labels">
            {frontmatter.labels.slice(0, 2).map((label) => (
              <span key={label} className="frontmatter-chip">
                {label}
              </span>
            ))}
            {frontmatter.labels.length > 2 && (
              <span className="frontmatter-more">+{frontmatter.labels.length - 2}</span>
            )}
          </div>
        )}

        {/* Assignee */}
        {frontmatter.assignee && frontmatter.assignee !== 'null' && (
          <div className="frontmatter-assignee">
            <User size={12} />
            <span>@{frontmatter.assignee}</span>
          </div>
        )}

        {/* Due date */}
        {dueInfo && (
          <div className={cn('frontmatter-due', dueInfo.className)}>
            <Calendar size={12} />
            <span>{dueInfo.text}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function MarkdownEditor() {
  const { frontmatter, setContent, setFrontmatter, setFileName, setIsDarkMode } = useEditorStore()
  const isUpdatingFromExtension = useRef(false)

  // Initialize Tiptap editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start writing...'
      }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true
      })
    ],
    content: '',
    onUpdate: ({ editor }) => {
      if (isUpdatingFromExtension.current) return

      // Get markdown from the editor using the markdown extension
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const markdown = (editor.storage as any).markdown.getMarkdown()
      setContent(markdown)
      vscode.postMessage({
        type: 'contentUpdate',
        content: markdown
      })
    }
  })

  // Send ready message once on mount
  useEffect(() => {
    vscode.postMessage({ type: 'ready' })
  }, [])

  // Handle messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data

      switch (message.type) {
        case 'init':
          setContent(message.content)
          setFrontmatter(message.frontmatter)
          setFileName(message.fileName)
          if (editor) {
            isUpdatingFromExtension.current = true
            editor.commands.setContent(message.content)
            isUpdatingFromExtension.current = false
          }
          break

        case 'contentChanged':
          setContent(message.content)
          if (editor) {
            isUpdatingFromExtension.current = true
            editor.commands.setContent(message.content)
            isUpdatingFromExtension.current = false
          }
          break

        case 'themeChanged':
          setIsDarkMode(message.isDark)
          break
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [setContent, setFrontmatter, setFileName, setIsDarkMode, editor])

  // Watch for VSCode theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const dark =
        document.body.classList.contains('vscode-dark') ||
        document.body.classList.contains('vscode-high-contrast')
      setIsDarkMode(dark)
    })

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    })

    return () => observer.disconnect()
  }, [setIsDarkMode])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        vscode.postMessage({ type: 'requestSave' })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Handle frontmatter updates
  const handleFrontmatterUpdate = useCallback((updates: Partial<FeatureFrontmatter>) => {
    if (!frontmatter) return

    const updatedFrontmatter = { ...frontmatter, ...updates }
    setFrontmatter(updatedFrontmatter)

    vscode.postMessage({
      type: 'frontmatterUpdate',
      frontmatter: updatedFrontmatter
    })
  }, [frontmatter, setFrontmatter])

  // Start AI coding agent to work on this ticket
  const startWithAI = useCallback((agent: AICodingAgent, permissionMode: AIPermissionMode) => {
    vscode.postMessage({ type: 'startWithAI', agent, permissionMode })
  }, [])

  return (
    <div className="editor-container">
      {frontmatter && <FrontmatterPanel frontmatter={frontmatter} onUpdate={handleFrontmatterUpdate} />}

      {/* AI Button Bar */}
      <div className="ai-toolbar">
        <AIAgentDropdown onSelect={startWithAI} />
      </div>

      {/* Editor Content */}
      <div className="editor-content">
        <EditorContent editor={editor} className="tiptap-editor" />
      </div>
    </div>
  )
}
