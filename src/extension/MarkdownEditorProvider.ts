import * as vscode from 'vscode'
import type { FeatureFrontmatter, EditorExtensionMessage, EditorWebviewMessage } from '../shared/editorTypes'
import type { FeatureStatus, Priority } from '../shared/types'

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'kanban-markdown.featureEditor'

  private readonly _extensionUri: vscode.Uri

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new MarkdownEditorProvider(context.extensionUri)
    const registration = vscode.window.registerCustomEditorProvider(
      MarkdownEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        },
        supportsMultipleEditorsPerDocument: false
      }
    )
    return registration
  }

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'dist'),
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview')
      ]
    }

    webviewPanel.webview.html = this._getHtmlForWebview(webviewPanel.webview)

    // Track if we're currently updating from the webview to avoid loops
    let isUpdatingFromWebview = false

    // Send initial content when webview is ready
    const sendDocumentToWebview = () => {
      const { frontmatter, content } = this._parseDocument(document.getText())
      const fileName = document.uri.path.split('/').pop()?.replace(/\.md$/, '') || 'Untitled'
      const message: EditorExtensionMessage = {
        type: 'init',
        content,
        frontmatter,
        fileName
      }
      webviewPanel.webview.postMessage(message)
    }

    // Handle messages from the webview
    webviewPanel.webview.onDidReceiveMessage(async (message: EditorWebviewMessage) => {
      switch (message.type) {
        case 'ready':
          sendDocumentToWebview()
          break

        case 'contentUpdate': {
          isUpdatingFromWebview = true
          const { frontmatter } = this._parseDocument(document.getText())
          const newText = this._serializeDocument(frontmatter, message.content)

          const edit = new vscode.WorkspaceEdit()
          edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            newText
          )
          await vscode.workspace.applyEdit(edit)
          isUpdatingFromWebview = false
          break
        }

        case 'frontmatterUpdate': {
          isUpdatingFromWebview = true
          const { content } = this._parseDocument(document.getText())
          const newText = this._serializeDocument(message.frontmatter, content)

          const edit = new vscode.WorkspaceEdit()
          edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            newText
          )
          await vscode.workspace.applyEdit(edit)
          isUpdatingFromWebview = false
          break
        }

        case 'requestSave':
          await document.save()
          break

        case 'startWithAI': {
          // Save the document first to ensure AI sees latest changes
          await document.save()

          // Build the prompt from the document content
          const fullText = document.getText()
          const { frontmatter: fm, content: docContent } = this._parseDocument(fullText)

          // Build a concise single-line prompt that references the file
          const labels = fm.labels.length > 0 ? ` [${fm.labels.join(', ')}]` : ''
          const description = docContent.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
          const shortDesc = description.length > 200 ? description.substring(0, 200) + '...' : description

          const prompt = `Implement this feature: "${fm.title}" (${fm.priority} priority)${labels}. ${shortDesc} See full details in: ${document.uri.fsPath}`

          // Get agent and permission mode
          const agent = message.agent || 'claude'
          const permissionMode = message.permissionMode || 'default'

          // Build the command based on selected agent
          let command: string
          const escapedPrompt = prompt.replace(/"/g, '\\"')

          switch (agent) {
            case 'claude': {
              const permissionFlag = permissionMode !== 'default' ? ` --permission-mode ${permissionMode}` : ''
              command = `claude${permissionFlag} "${escapedPrompt}"`
              break
            }
            case 'codex': {
              // Codex CLI flags: --approval-mode (suggest, auto-edit, full-auto)
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
              // OpenCode doesn't have permission flags, just run with prompt
              command = `opencode "${escapedPrompt}"`
              break
            }
            default:
              command = `claude "${escapedPrompt}"`
          }

          // Create or show terminal and run command
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

    // Listen for document changes (from external edits or undo/redo)
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString() && !isUpdatingFromWebview) {
        const { content } = this._parseDocument(document.getText())
        const message: EditorExtensionMessage = {
          type: 'contentChanged',
          content
        }
        webviewPanel.webview.postMessage(message)
      }
    })

    // Clean up when panel is closed
    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose()
    })
  }

  private _parseDocument(text: string): { frontmatter: FeatureFrontmatter; content: string } {
    const frontmatterMatch = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)

    if (!frontmatterMatch) {
      // No frontmatter, return defaults
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
    // Update modified timestamp
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

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'editor.js')
    )
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'style.css')
    )

    const nonce = this._getNonce()

    // Inline skeleton styles for instant loading feedback
    const skeletonStyles = `
      .skeleton-container {
        display: flex;
        flex-direction: column;
        height: 100vh;
        padding: 12px;
        box-sizing: border-box;
        font-family: var(--vscode-font-family, system-ui, sans-serif);
        background: var(--vscode-editor-background, #1e1e1e);
      }
      .skeleton-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: var(--vscode-sideBar-background, #252526);
        border-radius: 6px;
        margin-bottom: 8px;
      }
      .skeleton-title {
        height: 20px;
        width: 200px;
        background: var(--vscode-input-background, #3c3c3c);
        border-radius: 4px;
        animation: skeleton-pulse 1.5s ease-in-out infinite;
      }
      .skeleton-badges {
        display: flex;
        gap: 8px;
      }
      .skeleton-badge {
        height: 24px;
        width: 70px;
        background: var(--vscode-input-background, #3c3c3c);
        border-radius: 4px;
        animation: skeleton-pulse 1.5s ease-in-out infinite;
      }
      .skeleton-toolbar {
        display: flex;
        gap: 4px;
        padding: 8px;
        background: var(--vscode-sideBar-background, #252526);
        border-radius: 6px;
        margin-bottom: 8px;
      }
      .skeleton-btn {
        height: 28px;
        width: 28px;
        background: var(--vscode-input-background, #3c3c3c);
        border-radius: 4px;
        animation: skeleton-pulse 1.5s ease-in-out infinite;
      }
      .skeleton-divider {
        width: 1px;
        height: 20px;
        background: var(--vscode-input-background, #3c3c3c);
        margin: 4px 4px;
      }
      .skeleton-editor {
        flex: 1;
        background: var(--vscode-sideBar-background, #252526);
        border-radius: 6px;
        padding: 16px;
      }
      .skeleton-line {
        height: 14px;
        background: var(--vscode-input-background, #3c3c3c);
        border-radius: 3px;
        margin-bottom: 12px;
        animation: skeleton-pulse 1.5s ease-in-out infinite;
      }
      .skeleton-line:nth-child(1) { width: 60%; animation-delay: 0s; }
      .skeleton-line:nth-child(2) { width: 80%; animation-delay: 0.1s; }
      .skeleton-line:nth-child(3) { width: 45%; animation-delay: 0.2s; }
      .skeleton-line:nth-child(4) { width: 70%; animation-delay: 0.3s; }
      @keyframes skeleton-pulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.7; }
      }
      #root:not(:empty) + .skeleton-container { display: none; }
    `

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">${skeletonStyles}</style>
  <link href="${styleUri}" rel="stylesheet">
  <title>Feature Editor</title>
</head>
<body>
  <div id="root"></div>
  <div class="skeleton-container">
    <div class="skeleton-header">
      <div class="skeleton-title"></div>
      <div class="skeleton-badges">
        <div class="skeleton-badge"></div>
        <div class="skeleton-badge"></div>
      </div>
    </div>
    <div class="skeleton-toolbar">
      <div class="skeleton-btn"></div>
      <div class="skeleton-btn"></div>
      <div class="skeleton-divider"></div>
      <div class="skeleton-btn"></div>
      <div class="skeleton-btn"></div>
      <div class="skeleton-btn"></div>
      <div class="skeleton-btn"></div>
      <div class="skeleton-divider"></div>
      <div class="skeleton-btn"></div>
      <div class="skeleton-btn"></div>
      <div class="skeleton-btn"></div>
    </div>
    <div class="skeleton-editor">
      <div class="skeleton-line"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line"></div>
    </div>
  </div>
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
}
