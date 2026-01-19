import * as vscode from 'vscode'
import type { FeatureFrontmatter, EditorExtensionMessage, EditorWebviewMessage } from '../shared/editorTypes'
import type { FeatureStatus, Priority } from '../shared/types'

/**
 * Provides a webview panel that shows feature metadata (frontmatter) as a header.
 * The actual markdown editing is done by VSCode's native text editor.
 */
export class FeatureHeaderProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'kanban-markdown.featureHeader'

  private _view?: vscode.WebviewView
  private _currentDocument?: vscode.TextDocument
  private _disposables: vscode.Disposable[] = []

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new FeatureHeaderProvider(context.extensionUri)

    const disposables: vscode.Disposable[] = []

    // Register the webview view provider
    disposables.push(
      vscode.window.registerWebviewViewProvider(
        FeatureHeaderProvider.viewType,
        provider,
        {
          webviewOptions: {
            retainContextWhenHidden: true
          }
        }
      )
    )

    // Listen for active editor changes
    disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        provider._onActiveEditorChanged(editor)
      })
    )

    // Listen for document changes
    disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        provider._onDocumentChanged(e)
      })
    )

    return vscode.Disposable.from(...disposables)
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'dist'),
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview')
      ]
    }

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview)

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (message: EditorWebviewMessage) => {
      switch (message.type) {
        case 'ready':
          this._updateViewForCurrentEditor()
          break

        case 'frontmatterUpdate':
          await this._updateFrontmatter(message.frontmatter)
          break

        case 'requestSave':
          if (this._currentDocument) {
            await this._currentDocument.save()
          }
          break

        case 'startWithAI': {
          if (!this._currentDocument) return
          await this._currentDocument.save()

          const fullText = this._currentDocument.getText()
          const { frontmatter: fm, content: docContent } = this._parseDocument(fullText)

          const labels = fm.labels.length > 0 ? ` [${fm.labels.join(', ')}]` : ''
          const description = docContent.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
          const shortDesc = description.length > 200 ? description.substring(0, 200) + '...' : description

          const prompt = `Implement this feature: "${fm.title}" (${fm.priority} priority)${labels}. ${shortDesc} See full details in: ${this._currentDocument.uri.fsPath}`

          const agent = message.agent || 'claude'
          const permissionMode = message.permissionMode || 'default'

          let command: string
          const escapedPrompt = prompt.replace(/"/g, '\\"')

          switch (agent) {
            case 'claude': {
              const permissionFlag = permissionMode !== 'default' ? ` --permission-mode ${permissionMode}` : ''
              command = `claude${permissionFlag} "${escapedPrompt}"`
              break
            }
            case 'codex': {
              const approvalMap: Record<string, string> = {
                'default': 'suggest',
                'plan': 'suggest',
                'acceptEdits': 'auto-edit',
                'bypassPermissions': 'full-auto'
              }
              const approvalMode = approvalMap[permissionMode] || 'suggest'
              command = `codex --approval-mode ${approvalMode} "${escapedPrompt}"`
              break
            }
            case 'opencode': {
              command = `opencode "${escapedPrompt}"`
              break
            }
            default:
              command = `claude "${escapedPrompt}"`
          }

          const agentNames: Record<string, string> = {
            'claude': 'Claude Code',
            'codex': 'Codex',
            'opencode': 'OpenCode'
          }
          const terminal = vscode.window.createTerminal({
            name: agentNames[agent] || 'AI Agent',
            cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
          })
          terminal.show()
          terminal.sendText(command)
          break
        }
      }
    })

    // Update view when it becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._updateViewForCurrentEditor()
      }
    })

    // Check current editor
    this._updateViewForCurrentEditor()
  }

  private _onActiveEditorChanged(editor: vscode.TextEditor | undefined): void {
    if (!editor) {
      this._currentDocument = undefined
      return
    }

    // Only track .md files in the features directory
    const uri = editor.document.uri
    if (uri.fsPath.endsWith('.md') && uri.fsPath.includes('.devtool/features')) {
      this._currentDocument = editor.document
      this._updateViewForCurrentEditor()
    } else {
      this._currentDocument = undefined
      this._hideView()
    }
  }

  private _onDocumentChanged(e: vscode.TextDocumentChangeEvent): void {
    if (this._currentDocument && e.document.uri.toString() === this._currentDocument.uri.toString()) {
      this._updateViewForCurrentEditor()
    }
  }

  private _updateViewForCurrentEditor(): void {
    if (!this._view || !this._currentDocument) return

    const { frontmatter } = this._parseDocument(this._currentDocument.getText())
    const fileName = this._currentDocument.uri.path.split('/').pop()?.replace(/\.md$/, '') || 'Untitled'

    const message: EditorExtensionMessage = {
      type: 'init',
      content: '', // Not used anymore
      frontmatter,
      fileName
    }
    this._view.webview.postMessage(message)
  }

  private _hideView(): void {
    // Send empty state to hide content
    if (this._view) {
      this._view.webview.postMessage({
        type: 'init',
        content: '',
        frontmatter: null,
        fileName: ''
      })
    }
  }

  private async _updateFrontmatter(frontmatter: FeatureFrontmatter): Promise<void> {
    if (!this._currentDocument) return

    const { content } = this._parseDocument(this._currentDocument.getText())
    const newText = this._serializeDocument(frontmatter, content)

    const edit = new vscode.WorkspaceEdit()
    edit.replace(
      this._currentDocument.uri,
      new vscode.Range(0, 0, this._currentDocument.lineCount, 0),
      newText
    )
    await vscode.workspace.applyEdit(edit)
  }

  private _parseDocument(text: string): { frontmatter: FeatureFrontmatter; content: string } {
    const frontmatterMatch = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)

    if (!frontmatterMatch) {
      return {
        frontmatter: this._getDefaultFrontmatter(),
        content: text
      }
    }

    const frontmatterText = frontmatterMatch[1]
    const content = frontmatterMatch[2] || ''

    const getValue = (key: string): string => {
      const match = frontmatterText.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))
      if (!match) return ''
      const value = match[1].trim().replace(/^["']|["']$/g, '')
      return value === 'null' ? '' : value
    }

    const getArrayValue = (key: string): string[] => {
      const match = frontmatterText.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, 'm'))
      if (!match) return []
      return match[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    }

    const frontmatter: FeatureFrontmatter = {
      id: getValue('id') || 'unknown',
      title: getValue('title') || 'Untitled',
      status: (getValue('status') as FeatureStatus) || 'backlog',
      priority: (getValue('priority') as Priority) || 'medium',
      assignee: getValue('assignee') || null,
      dueDate: getValue('dueDate') || null,
      created: getValue('created') || new Date().toISOString(),
      modified: getValue('modified') || new Date().toISOString(),
      labels: getArrayValue('labels'),
      order: parseInt(getValue('order')) || 0
    }

    return { frontmatter, content: content.trim() }
  }

  private _getDefaultFrontmatter(): FeatureFrontmatter {
    const now = new Date().toISOString()
    return {
      id: 'unknown',
      title: 'Untitled',
      status: 'backlog',
      priority: 'medium',
      assignee: null,
      dueDate: null,
      created: now,
      modified: now,
      labels: [],
      order: 0
    }
  }

  private _serializeDocument(frontmatter: FeatureFrontmatter, content: string): string {
    const updatedFrontmatter = {
      ...frontmatter,
      modified: new Date().toISOString()
    }

    const frontmatterLines = [
      '---',
      `id: "${updatedFrontmatter.id}"`,
      `title: "${updatedFrontmatter.title}"`,
      `status: "${updatedFrontmatter.status}"`,
      `priority: "${updatedFrontmatter.priority}"`,
      `assignee: ${updatedFrontmatter.assignee ? `"${updatedFrontmatter.assignee}"` : 'null'}`,
      `dueDate: ${updatedFrontmatter.dueDate ? `"${updatedFrontmatter.dueDate}"` : 'null'}`,
      `created: "${updatedFrontmatter.created}"`,
      `modified: "${updatedFrontmatter.modified}"`,
      `labels: [${updatedFrontmatter.labels.map(l => `"${l}"`).join(', ')}]`,
      `order: ${updatedFrontmatter.order}`,
      '---',
      ''
    ].join('\n')

    return frontmatterLines + content
  }

  private _getNonce(): string {
    let text = ''
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'editor.js')
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
  <title>Feature Header</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
  }
}
