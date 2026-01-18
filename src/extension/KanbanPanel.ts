import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import type { Feature, FeatureStatus, Priority, KanbanColumn } from '../shared/types'

interface CreateFeatureData {
  title: string
  status: FeatureStatus
  priority: Priority
  content?: string
}

export class KanbanPanel {
  public static readonly viewType = 'kanban-markdown.panel'
  public static currentPanel: KanbanPanel | undefined

  private readonly _panel: vscode.WebviewPanel
  private readonly _extensionUri: vscode.Uri
  private readonly _context: vscode.ExtensionContext
  private _features: Feature[] = []
  private _disposables: vscode.Disposable[] = []
  private _fileWatcher: vscode.FileSystemWatcher | undefined

  public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined

    // If we already have a panel, show it
    if (KanbanPanel.currentPanel) {
      KanbanPanel.currentPanel._panel.reveal(column)
      return
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      KanbanPanel.viewType,
      'Kanban Board',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist'),
          vscode.Uri.joinPath(extensionUri, 'dist', 'webview')
        ]
      }
    )

    // Set the tab icon
    panel.iconPath = {
      light: vscode.Uri.joinPath(extensionUri, 'resources', 'kanban-light.svg'),
      dark: vscode.Uri.joinPath(extensionUri, 'resources', 'kanban-dark.svg')
    }

    KanbanPanel.currentPanel = new KanbanPanel(panel, extensionUri, context)
  }

  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
    KanbanPanel.currentPanel = new KanbanPanel(panel, extensionUri, context)
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
    this._panel = panel
    this._extensionUri = extensionUri
    this._context = context

    // Set the webview's initial html content
    this._update()

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables)

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'ready':
            await this._loadFeatures()
            this._sendFeaturesToWebview()
            break
          case 'createFeature':
            await this._createFeature(message.data)
            break
          case 'moveFeature':
            await this._moveFeature(message.featureId, message.newStatus, message.newOrder)
            break
          case 'deleteFeature':
            await this._deleteFeature(message.featureId)
            break
          case 'updateFeature':
            await this._updateFeature(message.featureId, message.updates)
            break
          case 'openFeatureFile':
            await this._openFeatureFile(message.featureId)
            break
        }
      },
      null,
      this._disposables
    )

    // Set up file watcher for feature files
    this._setupFileWatcher()
  }

  private _setupFileWatcher(): void {
    const featuresDir = this._getWorkspaceFeaturesDir()
    if (!featuresDir) return

    // Watch for changes in the features directory
    const pattern = new vscode.RelativePattern(featuresDir, '*.md')
    this._fileWatcher = vscode.workspace.createFileSystemWatcher(pattern)

    // Debounce to avoid multiple rapid updates
    let debounceTimer: NodeJS.Timeout | undefined

    const handleFileChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(async () => {
        await this._loadFeatures()
        this._sendFeaturesToWebview()
      }, 100)
    }

    this._fileWatcher.onDidChange(handleFileChange, null, this._disposables)
    this._fileWatcher.onDidCreate(handleFileChange, null, this._disposables)
    this._fileWatcher.onDidDelete(handleFileChange, null, this._disposables)

    this._disposables.push(this._fileWatcher)
  }

  public dispose() {
    KanbanPanel.currentPanel = undefined

    this._panel.dispose()

    while (this._disposables.length) {
      const x = this._disposables.pop()
      if (x) {
        x.dispose()
      }
    }
  }

  private _update() {
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview)
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'index.js')
    )
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'style.css')
    )

    const nonce = this._getNonce()

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link href="${styleUri}" rel="stylesheet">
  <title>Kanban Board</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
  }

  private _getNonce(): string {
    let text = ''
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
  }

  private _getWorkspaceFeaturesDir(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null
    }
    return path.join(workspaceFolders[0].uri.fsPath, '.devtool', 'features')
  }

  private async _ensureFeaturesDir(): Promise<string | null> {
    const featuresDir = this._getWorkspaceFeaturesDir()
    if (!featuresDir) return null

    try {
      await fs.promises.mkdir(featuresDir, { recursive: true })
      return featuresDir
    } catch {
      return null
    }
  }

  private async _loadFeatures(): Promise<void> {
    const featuresDir = this._getWorkspaceFeaturesDir()
    if (!featuresDir) {
      this._features = []
      return
    }

    try {
      const files = await fs.promises.readdir(featuresDir)
      const features: Feature[] = []

      for (const file of files) {
        if (!file.endsWith('.md')) continue
        const filePath = path.join(featuresDir, file)
        const content = await fs.promises.readFile(filePath, 'utf-8')
        const feature = this._parseFeatureFile(content, filePath)
        if (feature) features.push(feature)
      }

      this._features = features.sort((a, b) => a.order - b.order)
    } catch {
      this._features = []
    }
  }

  private _parseFeatureFile(content: string, filePath: string): Feature | null {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
    if (!frontmatterMatch) return null

    const frontmatter = frontmatterMatch[1]
    const body = frontmatterMatch[2] || ''

    const getValue = (key: string): string => {
      const match = frontmatter.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))
      if (!match) return ''
      const value = match[1].trim().replace(/^["']|["']$/g, '')
      return value === 'null' ? '' : value
    }

    const getArrayValue = (key: string): string[] => {
      const match = frontmatter.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, 'm'))
      if (!match) return []
      return match[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    }

    return {
      id: getValue('id') || path.basename(filePath, '.md'),
      title: getValue('title'),
      status: (getValue('status') as FeatureStatus) || 'backlog',
      priority: (getValue('priority') as Priority) || 'medium',
      assignee: getValue('assignee') || null,
      dueDate: getValue('dueDate') || null,
      created: getValue('created') || new Date().toISOString(),
      modified: getValue('modified') || new Date().toISOString(),
      labels: getArrayValue('labels'),
      order: parseInt(getValue('order')) || 0,
      content: body.trim(),
      filePath
    }
  }

  private _serializeFeature(feature: Feature): string {
    const frontmatter = [
      '---',
      `id: "${feature.id}"`,
      `title: "${feature.title}"`,
      `status: "${feature.status}"`,
      `priority: "${feature.priority}"`,
      `assignee: ${feature.assignee ? `"${feature.assignee}"` : 'null'}`,
      `dueDate: ${feature.dueDate ? `"${feature.dueDate}"` : 'null'}`,
      `created: "${feature.created}"`,
      `modified: "${feature.modified}"`,
      `labels: [${feature.labels.map(l => `"${l}"`).join(', ')}]`,
      `order: ${feature.order}`,
      '---',
      ''
    ].join('\n')

    return frontmatter + feature.content
  }

  public triggerCreateDialog(): void {
    this._panel.webview.postMessage({ type: 'triggerCreateDialog' })
  }

  private async _createFeature(data: CreateFeatureData): Promise<void> {
    const featuresDir = await this._ensureFeaturesDir()
    if (!featuresDir) {
      vscode.window.showErrorMessage('No workspace folder open')
      return
    }

    const id = `FEAT-${String(this._features.length + 1).padStart(3, '0')}`
    const now = new Date().toISOString()
    const featuresInStatus = this._features.filter(f => f.status === data.status)

    const feature: Feature = {
      id,
      title: data.title,
      status: data.status,
      priority: data.priority,
      assignee: null,
      dueDate: null,
      created: now,
      modified: now,
      labels: [],
      order: featuresInStatus.length,
      content: data.content || '',
      filePath: path.join(featuresDir, `${id}.md`)
    }

    const content = this._serializeFeature(feature)
    await fs.promises.writeFile(feature.filePath, content, 'utf-8')

    this._features.push(feature)
    this._sendFeaturesToWebview()
  }

  private async _moveFeature(featureId: string, newStatus: string, newOrder: number): Promise<void> {
    const feature = this._features.find(f => f.id === featureId)
    if (!feature) return

    feature.status = newStatus as FeatureStatus
    feature.order = newOrder
    feature.modified = new Date().toISOString()

    const content = this._serializeFeature(feature)
    await fs.promises.writeFile(feature.filePath, content, 'utf-8')

    this._sendFeaturesToWebview()
  }

  private async _deleteFeature(featureId: string): Promise<void> {
    const feature = this._features.find(f => f.id === featureId)
    if (!feature) return

    try {
      await fs.promises.unlink(feature.filePath)
      this._features = this._features.filter(f => f.id !== featureId)
      this._sendFeaturesToWebview()
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to delete feature: ${err}`)
    }
  }

  private async _updateFeature(featureId: string, updates: Partial<Feature>): Promise<void> {
    const feature = this._features.find(f => f.id === featureId)
    if (!feature) return

    // Merge updates
    Object.assign(feature, updates)
    feature.modified = new Date().toISOString()

    // Persist to file
    const content = this._serializeFeature(feature)
    await fs.promises.writeFile(feature.filePath, content, 'utf-8')

    this._sendFeaturesToWebview()
  }

  private async _openFeatureFile(featureId: string): Promise<void> {
    const feature = this._features.find(f => f.id === featureId)
    if (!feature) return

    const uri = vscode.Uri.file(feature.filePath)
    await vscode.commands.executeCommand('vscode.openWith', uri, 'kanban-markdown.featureEditor')
  }

  private _sendFeaturesToWebview(): void {
    const columns: KanbanColumn[] = [
      { id: 'backlog', name: 'Backlog', color: '#6b7280' },
      { id: 'todo', name: 'To Do', color: '#3b82f6' },
      { id: 'in-progress', name: 'In Progress', color: '#f59e0b' },
      { id: 'review', name: 'Review', color: '#8b5cf6' },
      { id: 'done', name: 'Done', color: '#22c55e' }
    ]

    this._panel.webview.postMessage({
      type: 'init',
      features: this._features,
      columns
    })
  }
}
