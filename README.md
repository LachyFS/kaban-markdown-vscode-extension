# Kanban Markdown

A VSCode/Cursor extension that brings a full-featured kanban board directly into your editor. Features are stored as human-readable markdown files, making them version-controllable and easy to edit outside the board.

![VSCode](https://img.shields.io/badge/VSCode-1.85+-blue?logo=visualstudiocode)
![License](https://img.shields.io/badge/license-MIT-green)

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

## Installation

### From VSIX (Local)
1. Build the extension (see Development below)
2. In VSCode: Extensions > `...` > Install from VSIX
3. Select the generated `.vsix` file

### From Marketplace
*Coming soon*

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

### Project Structure

```
src/
├── extension/           # VSCode extension code
│   ├── index.ts         # Activation & commands
│   └── KanbanPanel.ts   # Webview panel & file I/O
├── webview/             # React UI
│   ├── App.tsx          # Root component
│   ├── store/           # Zustand state management
│   └── components/      # UI components
└── shared/
    └── types.ts         # Shared TypeScript types
```

### Tech Stack

**Extension**: TypeScript, VSCode API, esbuild
**Webview**: React 18, Vite, Tailwind CSS, Zustand, Tiptap

## License

MIT
