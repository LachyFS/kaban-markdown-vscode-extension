# Kanban Markdown

A VSCode/Cursor extension that brings a full-featured kanban board directly into your editor. Features are stored as human-readable markdown files, making them version-controllable and easy to edit outside the board.

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/LachyFS.kanban-markdown?label=VS%20Marketplace&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=LachyFS.kanban-markdown)
[![Open VSX](https://img.shields.io/open-vsx/v/LachyFS/kanban-markdown?label=Open%20VSX&logo=vscodium)](https://open-vsx.org/extension/LachyFS/kanban-markdown)
![License](https://img.shields.io/badge/license-MIT-green)

![Editor View](docs/images/editor-view.png)

## Features

### Kanban Board
- **5-column workflow**: Backlog, To Do, In Progress, Review, Done
- **Drag-and-drop**: Move cards between columns with visual feedback
- **Split-view editor**: Board on left, inline markdown editor on right
- **Keyboard shortcuts**: `N` to create new feature, `Esc` to close dialogs

### Feature Cards
- **Priority levels**: Critical, High, Medium, Low (color-coded)
- **Assignees**: Assign team members to features
- **Due dates**: Smart formatting (Overdue, Today, Tomorrow, etc.)
- **Labels**: Tag features with multiple labels
- **Auto-generated IDs**: FEAT-001, FEAT-002, etc.

### Filtering & Search
- Filter by priority, assignee, label, or due date
- Full-text search across content, IDs, and metadata
- Quick filters for overdue items and unassigned work

### Editor Integration
- Rich text editing with full markdown support
- Inline frontmatter editing for metadata
- Auto-refresh when files change externally
- Theme integration with VSCode/Cursor (light & dark mode)

![Kanban Board Overview](docs/images/board-overview.png)

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
id: "FEAT-001"
status: "todo"
priority: "high"
assignee: "john"
dueDate: "2026-01-25"
labels: ["feature", "ui"]
---

# Implement dark mode toggle

Add a toggle in settings to switch between light and dark themes...
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
