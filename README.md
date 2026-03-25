# Act Diagram for VS Code

Interactive event-sourcing diagrams for the [@rotorsoft/act](https://github.com/Rotorsoft/act-root) framework, embedded in a VS Code WebView panel.

## Features

- **Embedded diagram** — Renders Act domain models directly in a VS Code panel
- **Live refresh** — Diagram updates as you edit TypeScript files
- **Click-to-navigate** — Click any state, action, event, reaction, or projection to jump to its definition
- **LSP diagnostics** — TypeScript errors are overlaid on diagram slices
- **Session persistence** — Panel state survives tab switches via `retainContextWhenHidden`

## Usage

1. Open a workspace containing Act definitions
2. Run **Cmd+Shift+P** → `Act: Open Diagram`
3. The diagram panel opens on the right, scanning your workspace for `.ts`/`.tsx` files

## Development

```bash
# Install dependencies
pnpm install

# Build extension + webview
pnpm build

# Watch mode (both extension and webview)
pnpm dev

# Package as .vsix
pnpm package
```

### Testing locally

1. Open this folder in VS Code
2. Press **F5** to launch the Extension Development Host
3. In the new window, run `Act: Open Diagram`

## Architecture

```
Extension Host (Node.js)          WebView (Browser)
┌─────────────────────┐          ┌─────────────────────┐
│  extension.ts       │          │  main.tsx            │
│  - registers cmd    │          │  - React app         │
│                     │          │  - extractModel()    │
│  panel.ts           │◄─ready──│  - Diagram component │
│  - scans workspace  │─files──►│  - navigateToCode()  │
│  - watches changes  │─diag───►│                      │
│  - opens files      │◄─nav────│                      │
└─────────────────────┘          └─────────────────────┘
```

- **Extension host** scans `.ts`/`.tsx` files, watches for changes, and forwards VS Code diagnostics
- **WebView** receives files via `postMessage`, extracts the domain model, and renders the interactive diagram
- **Navigation** flows both ways: click a diagram node → extension opens the file; edit a file → webview updates the diagram

## Dependencies

- [`@rotorsoft/act-diagram`](https://www.npmjs.com/package/@rotorsoft/act-diagram) — Model extraction, validation, and React diagram component (includes pre-built CSS)

## License

MIT
