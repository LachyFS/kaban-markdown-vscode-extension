# Kanban Markdown

A VSCode/Cursor extension that brings a full-featured kanban board directly into your editor. Features are stored as human-readable markdown files, making them version-controllable and easy to edit outside the board.

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/LachyFS.kanban-markdown?label=VS%20Marketplace&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=LachyFS.kanban-markdown)
[![Open VSX](https://img.shields.io/open-vsx/v/LachyFS/kanban-markdown?label=Open%20VSX&logo=vscodium)](https://open-vsx.org/extension/LachyFS/kanban-markdown)
![License](https://img.shields.io/badge/license-MIT-green)

![Kanban Board Overview](https://raw.githubusercontent.com/LachyFS/kanban-markdown-vscode-extension/main/docs/images/board-overview.png)

## Features

### Kanban Board
- **5-column workflow**: Backlog, To Do, In Progress, Review, Done
- **Drag-and-drop**: Move cards between columns with visual feedback
- **Split-view editor**: Board on left, inline markdown editor on right
- **Layout toggle**: Switch between horizontal and vertical board layouts
- **Quick-add input**: Rapidly create features directly in any column
- **Keyboard shortcuts**:
  - `N` - Create new feature
  - `Esc` - Close dialogs
  - `Cmd/Ctrl + Enter` - Submit create dialog
  - `Enter` in title - Move to description field
  - `Shift + Enter` in title - Add new line

### Feature Cards
- **Priority levels**: Critical, High, Medium, Low (color-coded badges)
- **Assignees**: Assign team members to features
- **Due dates**: Smart formatting (Overdue, Today, Tomorrow, "5d", etc.)
- **Labels**: Tag features with multiple labels (shows up to 3 with "+X more")
- **Auto-generated IDs**: Based on title and timestamp (e.g., `implement-dark-mode-2026-01-29`)
- **Timestamps**: Created and modified dates tracked automatically

### Filtering & Search
- **Full-text search**: Search across content, IDs, assignees, and labels
- **Priority filter**: Show only critical, high, medium, or low items
- **Assignee filter**: Filter by team member or show unassigned items
- **Label filter**: Filter by specific labels
- **Due date filters**: Overdue, due today, due this week, or no due date
- **Clear filters button**: Reset all filters at once

### Editor Integration
- Rich text editing with Tiptap markdown editor
- Inline frontmatter editing (dropdowns for status/priority, inputs for assignee/due date/labels)
- Auto-refresh when files change externally
- Theme integration with VSCode/Cursor (light & dark mode)

### AI Agent Integration
- **Claude Code**: Default, Plan, Auto-edit, and Full Auto modes
- **Codex**: Suggest, Auto-edit, and Full Auto modes
- **OpenCode**: Agent integration support
- AI receives feature context (title, priority, labels, description) for informed assistance

![Editor View](https://raw.githubusercontent.com/LachyFS/kanban-markdown-vscode-extension/main/docs/images/editor-view.png)

## Installation

### VS Code Marketplace
Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=LachyFS.kanban-markdown) or search for "Kanban Markdown" in the Extensions view.

### Open VSX (VSCodium, Cursor, etc.)
Install from [Open VSX](https://open-vsx.org/extension/LachyFS/kanban-markdown) or search for "Kanban Markdown" in the Extensions view.

### From VSIX (Manual)
1. Download the `.vsix` file from the releases
2. In VSCode: Extensions > `...` > Install from VSIX
3. Select the downloaded file

## Usage

1. Open the command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run **"Open Kanban Board"**
3. Start creating and managing features

Features are stored as markdown files in `.devtool/features/` within your workspace:

```markdown
---
id: "implement-dark-mode-toggle-2026-01-25"
status: "todo"
priority: "high"
assignee: "john"
dueDate: "2026-01-25"
created: "2026-01-25T10:30:00.000Z"
modified: "2026-01-25T14:20:00.000Z"
labels: ["feature", "ui"]
order: 0
---

# Implement dark mode toggle

Add a toggle in settings to switch between light and dark themes...
```

## Configuration

Available settings in VSCode/Cursor preferences:

| Setting | Default | Description |
|---------|---------|-------------|
| `kanban-markdown.featuresDirectory` | `.devtool/features` | Directory for feature files |
| `kanban-markdown.defaultPriority` | `medium` | Default priority for new features |
| `kanban-markdown.defaultStatus` | `backlog` | Default status for new features |
| `kanban-markdown.columns` | *see below* | Customize column IDs, names, and colors |
| `kanban-markdown.aiAgent` | `claude` | AI agent (`claude`, `codex`, or `opencode`) |
| `kanban-markdown.showPriorityBadges` | `true` | Show priority badges on cards |
| `kanban-markdown.showAssignee` | `true` | Show assignee on cards |
| `kanban-markdown.showDueDate` | `true` | Show due date on cards |
| `kanban-markdown.compactMode` | `false` | Enable compact card display |

Default columns configuration:
```json
[
  { "id": "backlog", "name": "Backlog", "color": "#6b7280" },
  { "id": "todo", "name": "To Do", "color": "#3b82f6" },
  { "id": "in-progress", "name": "In Progress", "color": "#f59e0b" },
  { "id": "review", "name": "Review", "color": "#8b5cf6" },
  { "id": "done", "name": "Done", "color": "#22c55e" }
]
```

## Development

### Prerequisites
- Node.js 18+
- pnpm

### Setup

```bash
# Install dependencies
pnpm install

# Start development (watch mode)
pnpm dev

# Build for production
pnpm build

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

### Debugging

1. Press `F5` in VSCode to launch the Extension Development Host
2. Open the command palette and run "Open Kanban Board"
3. Make changes and reload the window (`Cmd+R`) to see updates

### Tech Stack

**Extension**: TypeScript, VSCode API, esbuild
**Webview**: React 18, Vite, Tailwind CSS, Zustand, Tiptap

## License

MIT
