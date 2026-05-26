# jupyter-strudel: JupyterLab Extension for Strudel Livecoding

## Overview

A JupyterLab 4.x extension that provides a full Strudel livecoding experience with
real-time collaboration. Users edit `.str`/`.std` files with Strudel syntax highlighting
in JupyterLab's built-in FileEditor, control playback via a sidecar panel, and optionally
hear each other's updates in real-time via jupyter-collaboration's awareness protocol.


## Goals

- Strudel livecoding in JupyterLab with syntax highlighting and a familiar update-to-hear
  interaction model (Ctrl+Enter or click "Update")
- Real-time collaborative editing of Strudel files via jupyter-collaboration
- Opt-in listening: collaborators can toggle whether remote updates trigger local playback
- Sidecar panel with transport controls, error display, and Strudel documentation
- JupyterLite compatibility (collaboration features absent, everything else works)


## Non-Goals (v1)

- Notebook cell integration / Strudel kernel
- Pattern visualization (pianoroll, scope, etc.)
- Tempo control in the UI (done in code via `setCps` or `setcps`)
- MIDI or OSC output
- Synchronized timing across collaborators


## Architecture

### Approach

Use JupyterLab's built-in `FileEditor` for editing, which gives us collaboration support,
undo/redo, find/replace, and file management for free. The extension's custom code is
focused on: file type/language registration, the Strudel engine, the sidecar panel, and
the optional collaboration signaling.

### Extension Type

TypeScript frontend extension only — no server extension. Strudel runs entirely in the
browser via the Web Audio API. Scaffolded from the `copier-jupyterlab-extension` template,
cleaned up to remove unnecessary boilerplate, with clear naming and configured to use pnpm
and uv.

### Plugin Structure

A single `JupyterFrontEndPlugin` that:

1. Registers the Strudel file type and CodeMirror language
2. Registers the sidecar panel widget
3. Registers the Ctrl+Enter keybinding
4. Optionally hooks into jupyter-collaboration's awareness protocol


## File Type & Syntax Highlighting

### File Type Registration

Register via `app.docRegistry.addFileType()`:

- `name`: `'strudel'`
- `extensions`: `['.str', '.std']`
- `mimeTypes`: `['text/x-strudel']`
- Custom Strudel icon in the file browser

When opened, these files use JupyterLab's standard `FileEditor`.

### Language Registration

Use `IEditorLanguageRegistry.addLanguage()` to register a CodeMirror 6 `LanguageSupport`
from `@strudel/codemirror`. This provides:

- JavaScript-based syntax highlighting
- Mini-notation highlighting inside backtick strings
- Autocomplete (if provided by the package)

### Collaboration

Since we use the standard `FileEditor`, jupyter-collaboration support for real-time
co-editing comes for free — no custom `ISharedDocument` implementation needed.


## Strudel Engine

### Initialization

The Strudel engine is lazily initialized on first play/update — not on extension load.
This avoids unnecessary Web Audio context creation and satisfies the browser requirement
that `AudioContext` creation follows a user gesture.

The engine is assembled from lower-level `@strudel` packages (`core`, `webaudio`, `mini`,
`tonal`, `transpiler`) rather than the full `@strudel/repl` component, since JupyterLab's
FileEditor handles the editing surface. If `@strudel/repl` exports useful engine
initialization helpers, those may be used — but the full React-based REPL component is not
needed.

### Evaluation Flow

When the user presses Ctrl+Enter or clicks "Update":

1. Read the current text content from the active editor's `DocumentModel`
2. Pass it through `@strudel/transpiler` to convert DSL sugar into plain JS
3. Evaluate the transpiled code against the Strudel engine
4. **On success**: update the running pattern, clear any error state in the status bar
5. **On error**: display the error message in the status bar, keep the previous pattern
   playing (if any)

If jupyter-collaboration is present, the update also broadcasts an awareness event to
notify remote collaborators (see Collaboration section).

### Lifecycle

- **Play**: starts the Strudel scheduler and Web Audio context
- **Stop**: halts the scheduler, silences output
- **Update**: re-evaluates the current file content against the running engine

The engine is tied to the browser tab, not to a specific file. If the user switches to a
different `.str` file and presses update, the new file's content is evaluated. Only one
pattern plays at a time.

### Key Binding

Register `Ctrl+Enter` as a JupyterLab command (`strudel:evaluate`) bound to
"evaluate and update." The command is active when a `.str`/`.std` file is the active
editor.


## Sidecar Panel

A right-sidebar widget providing controls, error feedback, and documentation.

### Layout (top to bottom)

1. **Transport controls**: Play/Stop toggle button and an "Update" button. Styled as
   Lumino widgets matching JupyterLab's theme.

2. **Collaboration toggle** (conditional): "Listen to remote updates" — only rendered when
   jupyter-collaboration is detected. Default: off.

3. **Error display**: A compact status bar showing the most recent error message, or clear
   state on successful evaluation. Example error:
   `Error: [mini] parse error at line 3: Expected "!" ... but ">" found.`

4. **Documentation**: The main body of the sidecar. A searchable/browsable reference of
   Strudel functions, mini-notation syntax, and examples. Built from `@strudel` npm
   package content (specific package to be determined during implementation — e.g.,
   `@strudel/doc` or documentation exports from other packages). Clicking an example could
   insert it into the active editor.

### Behavior

- The sidecar opens automatically when a `.str`/`.std` file is opened
- Can be toggled via a command and sidebar tab icon
- Controls are disabled (grayed out) when no `.str`/`.std` file is active
- The sidecar's play/stop/update buttons trigger the same commands as the Ctrl+Enter
  keybinding — they share the single Strudel engine instance


## Collaboration: Update Broadcasting

This feature is entirely optional and only available when `jupyter-collaboration` is
installed. The extension uses JupyterLab's optional extension dependency mechanism
(`optional` token in the plugin definition) to detect its presence.

### Mechanism

Uses the Yjs awareness protocol via `@jupyter/ydoc` to broadcast ephemeral "evaluate"
events.

**Sending (on local update):**

When the user presses Ctrl+Enter or clicks "Update", after local evaluation completes,
set a field on their awareness state:

```typescript
awareness.setLocalStateField('strudelUpdate', {
  timestamp: Date.now(),
});
```

**Receiving:**

Each client listens for awareness changes from other users. When a remote user's
`strudelUpdate.timestamp` changes:

- If the local "Listen to remote updates" toggle is **on**: read the current shared
  document text, evaluate it against the local Strudel engine, and play
- If the toggle is **off**: ignore the event

### No Server Extension

This approach is purely client-side. The awareness protocol rides on
jupyter-collaboration's existing WebSocket infrastructure.

### JupyterLite

When jupyter-collaboration is absent (JupyterLite or local installs without it), the
collaboration toggle is not rendered. All other functionality works normally.


## Dependencies

### @strudel packages

- `@strudel/core` — Pattern class, time representation, combinators
- `@strudel/webaudio` — Web Audio output, synths, effects
- `@strudel/mini` — Mini-notation parser
- `@strudel/tonal` — Scales, chords
- `@strudel/transpiler` — DSL sugar → plain JS
- `@strudel/codemirror` — CodeMirror 6 language support, syntax highlighting
- Documentation package — TBD during implementation (examine `@strudel` scope for
  available documentation exports)

Use existing Strudel npm packages as much as possible for UI components, documentation,
and engine wiring.

### JupyterLab packages

- `@jupyterlab/application` — plugin registration
- `@jupyterlab/docregistry` — file type registration
- `@jupyterlab/fileeditor` — FileEditor integration
- `@jupyterlab/apputils` — widget utilities
- `@jupyterlab/codemirror` — `IEditorLanguageRegistry`
- `@jupyter/ydoc` — awareness protocol (optional)

### Tooling

- **pnpm** for Node package management
- **uv** for Python packaging
- Scaffolded from `copier-jupyterlab-extension` template, cleaned up


## Future Considerations

These are explicitly out of scope for v1 but should not be precluded by the architecture:

- **Notebook integration**: A browser-side Strudel kernel could enable Strudel code in
  notebook cells. The engine and evaluation logic should be structured so they could be
  reused by a future kernel.
- **Pattern visualization**: Canvas-based pianoroll or scope displays in the sidecar.
- **MIDI/OSC output**: Additional output targets beyond Web Audio.
- **Per-collaborator listening**: "Listen to Alice's updates but not Bob's" instead of the
  current global toggle.
