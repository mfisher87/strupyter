# jupyter-strudel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a JupyterLab 4.x extension providing Strudel livecoding with syntax
highlighting, a sidecar control/docs panel, and optional real-time collaborative update
broadcasting via jupyter-collaboration's awareness protocol.

**Architecture:** Register `.str`/`.std` as a custom file type using JupyterLab's built-in
FileEditor (free collaboration, undo/redo, find/replace). The Strudel engine runs entirely
client-side via `@strudel/repl`. A right-sidebar sidecar panel provides transport controls,
error display, and searchable documentation. When jupyter-collaboration is present, the Yjs
awareness protocol broadcasts "evaluate" events so collaborators can opt in to hearing
each other's updates.

**Tech Stack:** TypeScript, JupyterLab 4.x, Lumino 2, CodeMirror 6, `@strudel/*` packages,
Yjs awareness protocol, pnpm, uv

---

## File Structure

```
jupyter-strudel/
├── package.json                    # npm package definition (pnpm)
├── tsconfig.json                   # TypeScript config
├── pyproject.toml                  # Python packaging (uv + hatchling)
├── src/
│   ├── index.ts                    # Plugin entry point — wires all modules together
│   ├── icon.ts                     # LabIcon definition with Strudel SVG
│   ├── fileType.ts                 # File type + language registration
│   ├── engine.ts                   # Strudel engine wrapper (lazy repl() init)
│   ├── commands.ts                 # Command IDs, registration, keybindings
│   ├── sidecarPanel.ts             # Sidecar widget: controls + error + docs container
│   ├── documentationWidget.ts      # Searchable Strudel function reference
│   └── collaboration.ts           # Awareness-based update broadcasting
├── style/
│   ├── base.css                    # Extension styles
│   ├── index.css                   # CSS imports
│   └── index.js                    # Style entry point for JupyterLab
└── src/__tests__/
    ├── engine.test.ts              # Engine lifecycle unit tests
    └── collaboration.test.ts       # Awareness broadcasting unit tests
```

**Responsibility per file:**

- **`index.ts`** — Plugin definition with `requires`/`optional` tokens. Activation
  function creates the engine, registers file type + language, registers commands, creates
  sidecar panel, sets up editor tracking and collaboration. Pure glue — no logic.
- **`icon.ts`** — Exports a `LabIcon` instance. Single constant, no logic.
- **`fileType.ts`** — Exports `registerStrudelFileType(docRegistry, icon)` and
  `registerStrudelLanguage(languageRegistry)`. Pure registration calls.
- **`engine.ts`** — Exports `StrudelEngine` class. Wraps `@strudel/repl`'s `repl()` with
  lazy initialization (AudioContext created on first play). Emits Lumino signals for state
  changes and evaluation results. Single engine instance per browser tab.
- **`commands.ts`** — Exports command ID constants and
  `registerStrudelCommands(app, docManager, engine, collaboration?)`. Registers
  `strudel:evaluate`, `strudel:play`, `strudel:stop` commands and Ctrl+Enter keybinding.
- **`sidecarPanel.ts`** — Exports `StrudelSidecarPanel` (Lumino Widget subclass).
  Contains transport buttons (Play/Stop, Update), error status bar, collaboration toggle
  (conditional), and a `DocumentationWidget` instance. Connects to engine signals.
- **`documentationWidget.ts`** — Exports `DocumentationWidget` (Lumino Widget subclass).
  Queries `@strudel/core`'s documentation registry, renders a searchable/browsable
  function reference with descriptions and examples.
- **`collaboration.ts`** — Exports `StrudelCollaboration` class. Manages awareness
  listeners, broadcasts update events, receives remote updates when listening is enabled.
  Constructed per-document when jupyter-collaboration is present.

---

### Task 1: Scaffold and configure the extension

**Files:**
- Create: `jupyter-strudel/` (entire scaffold)
- Modify: `package.json`, `pyproject.toml`, `tsconfig.json`
- Delete: `.yarnrc.yml`, unnecessary CI files

- [ ] **Step 1: Run copier to scaffold the extension**

```bash
cd /workdir
pip install copier jinja2-time
copier copy --trust https://github.com/jupyterlab/extension-template jupyter-strudel
```

Answer the prompts:
- `author_name`: (your name)
- `labextension_name`: `jupyter-strudel`
- `python_name`: `jupyter_strudel`
- `project_short_description`: `Strudel livecoding for JupyterLab`
- `has_settings`: `n`
- `has_binder`: `n`
- `test`: `n` (we'll add our own test setup)
- `kind`: `frontend`

- [ ] **Step 2: Remove unnecessary files and switch to pnpm**

```bash
cd /workdir/jupyter-strudel
rm -f .yarnrc.yml yarn.lock
rm -rf .github/  # Remove CI workflows — add back manually later if needed
```

- [ ] **Step 3: Install @strudel and JupyterLab dependencies with pnpm**

Update `package.json` dependencies. The generated `package.json` will already have
`@jupyterlab/*` dependencies. Add the Strudel packages:

```json
{
  "dependencies": {
    "@strudel/codemirror": "^1.0.0",
    "@strudel/core": "^1.0.0",
    "@strudel/mini": "^1.0.0",
    "@strudel/repl": "^1.0.0",
    "@strudel/tonal": "^1.0.0",
    "@strudel/transpiler": "^1.0.0",
    "@strudel/webaudio": "^1.0.0"
  },
  "peerDependencies": {
    "@jupyter/collaborative-drive": ">=3.0.0"
  },
  "peerDependenciesMeta": {
    "@jupyter/collaborative-drive": {
      "optional": true
    }
  }
}
```

**Note:** The exact `@strudel/*` version ranges should be determined by checking the
current latest versions on npm at implementation time. The `^1.0.0` above is a placeholder
range — replace with actual current versions.

```bash
pnpm install
```

- [ ] **Step 4: Configure pyproject.toml for uv**

The generated `pyproject.toml` should already use `hatchling` as the build backend.
Verify it looks correct and that `jupyter_strudel` is the Python package name. No
changes should be needed for uv compatibility — `hatchling` works with uv out of the box.

```bash
uv sync
```

- [ ] **Step 5: Verify clean build**

```bash
pnpm run build
```

Fix any build errors from the scaffold. The generated `src/index.ts` will have a minimal
plugin — that's fine, we'll replace it in subsequent tasks.

- [ ] **Step 6: Commit scaffold**

```bash
git init
git add .
git commit -m "feat: scaffold jupyter-strudel extension from copier template"
```

---

### Task 2: Icon and file type registration

**Files:**
- Create: `src/icon.ts`
- Create: `src/fileType.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create the Strudel icon**

Create `src/icon.ts`:

```typescript
import { LabIcon } from '@jupyterlab/ui-components';

// Strudel uses a tidal wave / spiral motif. This is a simple music note
// placeholder — replace with the actual Strudel logo SVG.
const STRUDEL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4
           4-1.79 4-4V7h4V3h-6z"/>
</svg>`;

export const strudelIcon = new LabIcon({
  name: 'strudel:icon',
  svgstr: STRUDEL_SVG,
});
```

- [ ] **Step 2: Create the file type and language registration module**

Create `src/fileType.ts`:

```typescript
import type { DocumentRegistry } from '@jupyterlab/docregistry';
import type { IEditorLanguageRegistry } from '@jupyterlab/codemirror';
import type { LabIcon } from '@jupyterlab/ui-components';

export const STRUDEL_MIME_TYPE = 'text/x-strudel';
export const STRUDEL_FILE_EXTENSIONS = ['.str', '.std'];

export function registerStrudelFileType({
  docRegistry,
  icon,
}: {
  docRegistry: DocumentRegistry;
  icon: LabIcon;
}): void {
  docRegistry.addFileType({
    name: 'strudel',
    displayName: 'Strudel',
    extensions: STRUDEL_FILE_EXTENSIONS,
    mimeTypes: [STRUDEL_MIME_TYPE],
    icon,
    fileFormat: 'text',
    contentType: 'file',
  });
}

export function registerStrudelLanguage({
  languageRegistry,
}: {
  languageRegistry: IEditorLanguageRegistry;
}): void {
  languageRegistry.addLanguage({
    name: 'Strudel',
    mime: STRUDEL_MIME_TYPE,
    extensions: ['str', 'std'],
    load: async () => {
      // @strudel/codemirror exports strudel() which returns a LanguageSupport.
      // Verify the exact export name at implementation time — it may be
      // `strudel`, `strudelLanguage`, or `strudelLanguageSupport`.
      const { strudel } = await import('@strudel/codemirror');
      return strudel();
    },
  });
}
```

**Note:** TypeScript may complain about `import('@strudel/codemirror')` if type
declarations are missing. Add a `src/strudel.d.ts` file with module declarations if
needed:

```typescript
declare module '@strudel/codemirror' {
  import type { LanguageSupport } from '@codemirror/language';
  export function strudel(): LanguageSupport;
}
```

- [ ] **Step 3: Wire file type registration into the plugin**

Replace `src/index.ts` with:

```typescript
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from '@jupyterlab/application';
import { IEditorLanguageRegistry } from '@jupyterlab/codemirror';
import { strudelIcon } from './icon';
import { registerStrudelFileType, registerStrudelLanguage } from './fileType';

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-strudel:plugin',
  description: 'Strudel livecoding for JupyterLab',
  autoStart: true,
  requires: [IEditorLanguageRegistry],
  activate: (
    app: JupyterFrontEnd,
    languageRegistry: IEditorLanguageRegistry,
  ) => {
    console.log('jupyter-strudel: activating');

    registerStrudelFileType({
      docRegistry: app.docRegistry,
      icon: strudelIcon,
    });
    registerStrudelLanguage({ languageRegistry });

    console.log('jupyter-strudel: file type and language registered');
  },
};

export default plugin;
```

- [ ] **Step 4: Build and verify**

```bash
pnpm run build
```

- [ ] **Step 5: Manual test — open a .str file**

```bash
# Install the extension in development mode
uv pip install -e ".[dev]"
jupyter labextension develop . --overwrite
jupyter lab
```

In JupyterLab:
1. Create a new file named `test.str` via the file browser
2. Verify it opens in the FileEditor (text editor)
3. Type some Strudel code: `` note("c3 e3 g3").s("piano") ``
4. Verify syntax highlighting is applied (JavaScript-based with mini-notation)
5. Repeat with `test.std` to verify both extensions work

- [ ] **Step 6: Commit**

```bash
git add src/icon.ts src/fileType.ts src/index.ts
git commit -m "feat: register .str/.std file type with Strudel syntax highlighting"
```

---

### Task 3: Strudel engine wrapper

**Files:**
- Create: `src/engine.ts`
- Create: `src/__tests__/engine.test.ts`

- [ ] **Step 1: Create type declarations for @strudel packages**

Create or update `src/strudel.d.ts` with the module declarations needed:

```typescript
declare module '@strudel/codemirror' {
  import type { LanguageSupport } from '@codemirror/language';
  export function strudel(): LanguageSupport;
}

declare module '@strudel/repl' {
  export interface ReplInstance {
    evaluate: (code: string) => Promise<{ pattern?: unknown; error?: Error }>;
    start: () => void;
    stop: () => void;
  }

  export interface ReplOptions {
    defaultOutput: unknown;
    audioContext?: AudioContext;
  }

  export function repl(options: ReplOptions): Promise<ReplInstance>;
}

declare module '@strudel/webaudio' {
  export function webaudioOutput(options?: {
    audioContext?: AudioContext;
  }): unknown;
  export function getAudioContext(): AudioContext;
  export function initAudioOnFirstClick(): void;
}

declare module '@strudel/core' {
  export interface FunctionDocumentation {
    name: string;
    description: string;
    examples: string[];
  }
  export function getDocumentations(): Record<string, FunctionDocumentation>;
}

declare module '@strudel/mini' {}
declare module '@strudel/tonal' {}
```

**Note:** These declarations are approximations based on research. Verify against the
actual package exports at implementation time and adjust as needed. If the packages ship
their own `.d.ts` files, these declarations are unnecessary.

- [ ] **Step 2: Write the engine wrapper**

Create `src/engine.ts`:

```typescript
import { Signal, ISignal } from '@lumino/signaling';

export interface EvaluationResult {
  readonly success: boolean;
  readonly error?: string;
}

export type EngineState = 'uninitialized' | 'stopped' | 'playing';

export class StrudelEngine {
  private _replInstance: {
    evaluate: (code: string) => Promise<{ pattern?: unknown; error?: Error }>;
    start: () => void;
    stop: () => void;
  } | null = null;

  private _state: EngineState = 'uninitialized';
  private _stateChanged = new Signal<this, EngineState>(this);
  private _evaluationCompleted = new Signal<this, EvaluationResult>(this);

  get state(): EngineState {
    return this._state;
  }

  get stateChanged(): ISignal<this, EngineState> {
    return this._stateChanged;
  }

  get evaluationCompleted(): ISignal<this, EvaluationResult> {
    return this._evaluationCompleted;
  }

  get isInitialized(): boolean {
    return this._replInstance !== null;
  }

  get isPlaying(): boolean {
    return this._state === 'playing';
  }

  async initialize(): Promise<void> {
    if (this._replInstance) {
      return;
    }

    const { repl } = await import('@strudel/repl');
    const { webaudioOutput, getAudioContext } = await import(
      '@strudel/webaudio'
    );

    // Side-effect imports — register mini-notation and tonal functions
    await import('@strudel/mini');
    await import('@strudel/tonal');

    const audioContext = getAudioContext();
    const output = webaudioOutput({ audioContext });

    this._replInstance = await repl({
      defaultOutput: output,
      audioContext,
    });

    this._state = 'stopped';
    this._stateChanged.emit(this._state);
  }

  async evaluateAndPlay(code: string): Promise<EvaluationResult> {
    if (!this._replInstance) {
      await this.initialize();
    }

    if (!this.isPlaying) {
      this._replInstance!.start();
      this._state = 'playing';
      this._stateChanged.emit(this._state);
    }

    try {
      const result = await this._replInstance!.evaluate(code);
      if (result.error) {
        const evaluationResult: EvaluationResult = {
          success: false,
          error: result.error.message,
        };
        this._evaluationCompleted.emit(evaluationResult);
        return evaluationResult;
      }
      const evaluationResult: EvaluationResult = { success: true };
      this._evaluationCompleted.emit(evaluationResult);
      return evaluationResult;
    } catch (err) {
      const evaluationResult: EvaluationResult = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
      this._evaluationCompleted.emit(evaluationResult);
      return evaluationResult;
    }
  }

  stop(): void {
    if (!this._replInstance || !this.isPlaying) {
      return;
    }
    this._replInstance.stop();
    this._state = 'stopped';
    this._stateChanged.emit(this._state);
  }
}
```

- [ ] **Step 3: Write unit tests for the engine**

First, add vitest as a dev dependency:

```bash
pnpm add -D vitest
```

Add to `package.json` scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Create `src/__tests__/engine.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrudelEngine } from '../engine';
import type { EvaluationResult, EngineState } from '../engine';

// Mock @strudel/repl
const mockEvaluate = vi.fn();
const mockStart = vi.fn();
const mockStop = vi.fn();

vi.mock('@strudel/repl', () => ({
  repl: vi.fn(() =>
    Promise.resolve({
      evaluate: mockEvaluate,
      start: mockStart,
      stop: mockStop,
    }),
  ),
}));

vi.mock('@strudel/webaudio', () => ({
  webaudioOutput: vi.fn(() => ({})),
  getAudioContext: vi.fn(() => ({})),
}));

vi.mock('@strudel/mini', () => ({}));
vi.mock('@strudel/tonal', () => ({}));

describe('StrudelEngine', () => {
  let engine: StrudelEngine;

  beforeEach(() => {
    engine = new StrudelEngine();
    vi.clearAllMocks();
    mockEvaluate.mockResolvedValue({ pattern: {} });
  });

  describe('initial state', () => {
    it('starts uninitialized', () => {
      expect(engine.state).toBe('uninitialized');
      expect(engine.isInitialized).toBe(false);
      expect(engine.isPlaying).toBe(false);
    });
  });

  describe('initialize', () => {
    it('transitions to stopped state after initialization', async () => {
      const states: EngineState[] = [];
      engine.stateChanged.connect((_, state) => states.push(state));

      await engine.initialize();

      expect(engine.state).toBe('stopped');
      expect(engine.isInitialized).toBe(true);
      expect(states).toEqual(['stopped']);
    });

    it('is idempotent — second call is a no-op', async () => {
      await engine.initialize();
      await engine.initialize();

      const { repl } = await import('@strudel/repl');
      expect(repl).toHaveBeenCalledTimes(1);
    });
  });

  describe('evaluateAndPlay', () => {
    it('auto-initializes and starts on first call', async () => {
      const states: EngineState[] = [];
      engine.stateChanged.connect((_, state) => states.push(state));

      await engine.evaluateAndPlay('note("c3")');

      expect(states).toContain('stopped');
      expect(states).toContain('playing');
      expect(mockStart).toHaveBeenCalledOnce();
      expect(mockEvaluate).toHaveBeenCalledWith('note("c3")');
    });

    it('emits success on successful evaluation', async () => {
      const results: EvaluationResult[] = [];
      engine.evaluationCompleted.connect((_, result) => results.push(result));

      mockEvaluate.mockResolvedValue({ pattern: {} });
      await engine.evaluateAndPlay('note("c3")');

      expect(results).toEqual([{ success: true }]);
    });

    it('emits error when evaluation returns an error', async () => {
      const results: EvaluationResult[] = [];
      engine.evaluationCompleted.connect((_, result) => results.push(result));

      mockEvaluate.mockResolvedValue({
        error: new Error('[mini] parse error at line 1'),
      });
      await engine.evaluateAndPlay('bad code');

      expect(results).toEqual([
        { success: false, error: '[mini] parse error at line 1' },
      ]);
    });

    it('emits error when evaluation throws', async () => {
      const results: EvaluationResult[] = [];
      engine.evaluationCompleted.connect((_, result) => results.push(result));

      mockEvaluate.mockRejectedValue(new Error('unexpected error'));
      await engine.evaluateAndPlay('bad code');

      expect(results).toEqual([
        { success: false, error: 'unexpected error' },
      ]);
    });

    it('does not restart if already playing', async () => {
      await engine.evaluateAndPlay('note("c3")');
      await engine.evaluateAndPlay('note("e3")');

      expect(mockStart).toHaveBeenCalledOnce();
      expect(mockEvaluate).toHaveBeenCalledTimes(2);
    });
  });

  describe('stop', () => {
    it('transitions to stopped state', async () => {
      await engine.evaluateAndPlay('note("c3")');

      engine.stop();

      expect(engine.state).toBe('stopped');
      expect(engine.isPlaying).toBe(false);
      expect(mockStop).toHaveBeenCalledOnce();
    });

    it('is a no-op when not playing', async () => {
      engine.stop();

      expect(mockStop).not.toHaveBeenCalled();
    });

    it('re-starts on next evaluateAndPlay after stop', async () => {
      await engine.evaluateAndPlay('note("c3")');
      engine.stop();
      await engine.evaluateAndPlay('note("e3")');

      expect(mockStart).toHaveBeenCalledTimes(2);
    });
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine.ts src/strudel.d.ts src/__tests__/engine.test.ts
git commit -m "feat: add Strudel engine wrapper with lazy initialization"
```

---

### Task 4: Commands and keybindings

**Files:**
- Create: `src/commands.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create the commands module**

Create `src/commands.ts`:

```typescript
import type { JupyterFrontEnd } from '@jupyterlab/application';
import type { IDocumentManager } from '@jupyterlab/docmanager';
import type { StrudelEngine } from './engine';
import type { StrudelCollaboration } from './collaboration';
import { STRUDEL_FILE_EXTENSIONS } from './fileType';

export const CommandIds = {
  evaluate: 'strudel:evaluate',
  play: 'strudel:play',
  stop: 'strudel:stop',
} as const;

function isStrudelPath(path: string): boolean {
  return STRUDEL_FILE_EXTENSIONS.some(ext => path.endsWith(ext));
}

function getActiveStrudelContent({
  app,
  docManager,
}: {
  app: JupyterFrontEnd;
  docManager: IDocumentManager;
}): string | null {
  const currentWidget = app.shell.currentWidget;
  if (!currentWidget) {
    return null;
  }
  const context = docManager.contextForWidget(currentWidget);
  if (!context || !isStrudelPath(context.path)) {
    return null;
  }
  return context.model.toString();
}

export function registerStrudelCommands({
  app,
  docManager,
  engine,
  collaboration,
}: {
  app: JupyterFrontEnd;
  docManager: IDocumentManager;
  engine: StrudelEngine;
  collaboration?: StrudelCollaboration | null;
}): void {
  const isStrudelActive = (): boolean => {
    const currentWidget = app.shell.currentWidget;
    if (!currentWidget) {
      return false;
    }
    const context = docManager.contextForWidget(currentWidget);
    if (!context) {
      return false;
    }
    return isStrudelPath(context.path);
  };

  app.commands.addCommand(CommandIds.evaluate, {
    label: 'Strudel: Evaluate and Update',
    isEnabled: isStrudelActive,
    execute: async () => {
      const content = getActiveStrudelContent({ app, docManager });
      if (content === null) {
        return;
      }
      await engine.evaluateAndPlay(content);
      collaboration?.broadcastUpdate();
    },
  });

  app.commands.addCommand(CommandIds.play, {
    label: 'Strudel: Play',
    isEnabled: () => isStrudelActive() && !engine.isPlaying,
    execute: async () => {
      const content = getActiveStrudelContent({ app, docManager });
      if (content === null) {
        return;
      }
      await engine.evaluateAndPlay(content);
    },
  });

  app.commands.addCommand(CommandIds.stop, {
    label: 'Strudel: Stop',
    isEnabled: () => engine.isPlaying,
    execute: () => {
      engine.stop();
    },
  });

  app.commands.addKeyBinding({
    command: CommandIds.evaluate,
    keys: ['Ctrl Enter'],
    selector: '.jp-FileEditor',
  });
}
```

- [ ] **Step 2: Update index.ts to wire in commands**

Update `src/index.ts`:

```typescript
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from '@jupyterlab/application';
import { IEditorLanguageRegistry } from '@jupyterlab/codemirror';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { strudelIcon } from './icon';
import { registerStrudelFileType, registerStrudelLanguage } from './fileType';
import { StrudelEngine } from './engine';
import { registerStrudelCommands } from './commands';

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-strudel:plugin',
  description: 'Strudel livecoding for JupyterLab',
  autoStart: true,
  requires: [IEditorLanguageRegistry, IDocumentManager],
  activate: (
    app: JupyterFrontEnd,
    languageRegistry: IEditorLanguageRegistry,
    docManager: IDocumentManager,
  ) => {
    console.log('jupyter-strudel: activating');

    registerStrudelFileType({
      docRegistry: app.docRegistry,
      icon: strudelIcon,
    });
    registerStrudelLanguage({ languageRegistry });

    const engine = new StrudelEngine();

    registerStrudelCommands({ app, docManager, engine });

    console.log('jupyter-strudel: activated');
  },
};

export default plugin;
```

- [ ] **Step 3: Build and verify**

```bash
pnpm run build
```

- [ ] **Step 4: Manual test — Ctrl+Enter evaluation**

In a running JupyterLab:
1. Open `test.str`
2. Type: `` note("c3 e3 g3 b3").s("piano") ``
3. Press Ctrl+Enter
4. Verify audio plays (you should hear the pattern)
5. Change the code and press Ctrl+Enter again — verify pattern updates
6. Verify Ctrl+Enter does nothing when a non-Strudel file is active

- [ ] **Step 5: Commit**

```bash
git add src/commands.ts src/index.ts
git commit -m "feat: add evaluate/play/stop commands with Ctrl+Enter keybinding"
```

---

### Task 5: Sidecar panel with controls and error display

**Files:**
- Create: `src/sidecarPanel.ts`
- Modify: `src/index.ts`
- Modify: `style/base.css`

- [ ] **Step 1: Create the sidecar panel widget**

Create `src/sidecarPanel.ts`:

```typescript
import { Widget } from '@lumino/widgets';
import type { JupyterFrontEnd } from '@jupyterlab/application';
import type { StrudelEngine, EvaluationResult, EngineState } from './engine';
import { CommandIds } from './commands';
import type { LabIcon } from '@jupyterlab/ui-components';

export class StrudelSidecarPanel extends Widget {
  private readonly _playStopButton: HTMLButtonElement;
  private readonly _updateButton: HTMLButtonElement;
  private readonly _errorDisplay: HTMLDivElement;
  private readonly _docsContainer: HTMLDivElement;
  private readonly _app: JupyterFrontEnd;

  constructor({
    app,
    engine,
    icon,
  }: {
    app: JupyterFrontEnd;
    engine: StrudelEngine;
    icon: LabIcon;
  }) {
    super();
    this._app = app;

    this.id = 'strudel-sidecar-panel';
    this.title.label = 'Strudel';
    this.title.caption = 'Strudel Controls & Documentation';
    this.title.icon = icon;
    this.title.closable = true;
    this.addClass('jp-StrudelSidecar');

    // --- Transport controls ---
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'jp-StrudelSidecar-controls';

    this._playStopButton = document.createElement('button');
    this._playStopButton.className = 'jp-mod-styled jp-mod-accept';
    this._playStopButton.textContent = 'Play';
    this._playStopButton.addEventListener('click', () => {
      if (engine.isPlaying) {
        this._app.commands.execute(CommandIds.stop);
      } else {
        this._app.commands.execute(CommandIds.evaluate);
      }
    });

    this._updateButton = document.createElement('button');
    this._updateButton.className = 'jp-mod-styled';
    this._updateButton.textContent = 'Update';
    this._updateButton.addEventListener('click', () => {
      this._app.commands.execute(CommandIds.evaluate);
    });

    controlsContainer.appendChild(this._playStopButton);
    controlsContainer.appendChild(this._updateButton);

    // --- Error display ---
    this._errorDisplay = document.createElement('div');
    this._errorDisplay.className = 'jp-StrudelSidecar-error';

    // --- Documentation container (populated by DocumentationWidget) ---
    this._docsContainer = document.createElement('div');
    this._docsContainer.className = 'jp-StrudelSidecar-docs';

    // --- Assemble ---
    this.node.appendChild(controlsContainer);
    this.node.appendChild(this._errorDisplay);
    this.node.appendChild(this._docsContainer);

    // --- Connect to engine signals ---
    engine.stateChanged.connect(this._onEngineStateChanged, this);
    engine.evaluationCompleted.connect(this._onEvaluationCompleted, this);
  }

  get docsContainer(): HTMLDivElement {
    return this._docsContainer;
  }

  private _onEngineStateChanged(_sender: StrudelEngine, state: EngineState): void {
    if (state === 'playing') {
      this._playStopButton.textContent = 'Stop';
      this._playStopButton.classList.remove('jp-mod-accept');
      this._playStopButton.classList.add('jp-mod-warn');
    } else {
      this._playStopButton.textContent = 'Play';
      this._playStopButton.classList.remove('jp-mod-warn');
      this._playStopButton.classList.add('jp-mod-accept');
    }
  }

  private _onEvaluationCompleted(
    _sender: StrudelEngine,
    result: EvaluationResult,
  ): void {
    if (result.success) {
      this._errorDisplay.textContent = '';
      this._errorDisplay.classList.remove('jp-StrudelSidecar-error--active');
    } else {
      this._errorDisplay.textContent = `Error: ${result.error}`;
      this._errorDisplay.classList.add('jp-StrudelSidecar-error--active');
    }
  }
}
```

- [ ] **Step 2: Add base CSS for the sidecar panel**

Update `style/base.css`:

```css
.jp-StrudelSidecar {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.jp-StrudelSidecar-controls {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--jp-border-color1);
  flex-shrink: 0;
}

.jp-StrudelSidecar-controls button {
  flex: 1;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: var(--jp-ui-font-size1);
}

.jp-StrudelSidecar-error {
  padding: 0 8px;
  font-size: var(--jp-ui-font-size0);
  font-family: var(--jp-code-font-family);
  color: var(--jp-error-color1);
  white-space: pre-wrap;
  word-break: break-word;
  flex-shrink: 0;
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.2s ease, padding 0.2s ease;
}

.jp-StrudelSidecar-error--active {
  max-height: 120px;
  padding: 8px;
  overflow-y: auto;
  border-bottom: 1px solid var(--jp-border-color1);
}

.jp-StrudelSidecar-docs {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.jp-StrudelSidecar-collaboration {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--jp-border-color1);
  font-size: var(--jp-ui-font-size1);
  flex-shrink: 0;
}
```

- [ ] **Step 3: Wire the sidecar panel into index.ts**

Update `src/index.ts` — add the sidecar panel creation and auto-open logic. Add
`IEditorTracker` to `requires`:

```typescript
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from '@jupyterlab/application';
import { IEditorLanguageRegistry } from '@jupyterlab/codemirror';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { IEditorTracker } from '@jupyterlab/fileeditor';
import { strudelIcon } from './icon';
import {
  registerStrudelFileType,
  registerStrudelLanguage,
  STRUDEL_FILE_EXTENSIONS,
} from './fileType';
import { StrudelEngine } from './engine';
import { registerStrudelCommands } from './commands';
import { StrudelSidecarPanel } from './sidecarPanel';

function isStrudelPath(path: string): boolean {
  return STRUDEL_FILE_EXTENSIONS.some(ext => path.endsWith(ext));
}

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-strudel:plugin',
  description: 'Strudel livecoding for JupyterLab',
  autoStart: true,
  requires: [IEditorLanguageRegistry, IDocumentManager, IEditorTracker],
  activate: (
    app: JupyterFrontEnd,
    languageRegistry: IEditorLanguageRegistry,
    docManager: IDocumentManager,
    editorTracker: IEditorTracker,
  ) => {
    console.log('jupyter-strudel: activating');

    registerStrudelFileType({
      docRegistry: app.docRegistry,
      icon: strudelIcon,
    });
    registerStrudelLanguage({ languageRegistry });

    const engine = new StrudelEngine();

    registerStrudelCommands({ app, docManager, engine });

    const sidecarPanel = new StrudelSidecarPanel({
      app,
      engine,
      icon: strudelIcon,
    });
    app.shell.add(sidecarPanel, 'right', { rank: 1000 });

    // Auto-open sidecar when a Strudel file becomes active
    editorTracker.currentChanged.connect((_tracker, widget) => {
      if (widget && isStrudelPath(widget.context.path)) {
        app.shell.activateById(sidecarPanel.id);
      }
    });

    console.log('jupyter-strudel: activated');
  },
};

export default plugin;
```

- [ ] **Step 4: Build and verify**

```bash
pnpm run build
```

- [ ] **Step 5: Manual test — sidecar panel**

In a running JupyterLab:
1. Open `test.str` — verify the sidecar panel opens on the right
2. Click "Play" — verify audio starts and button changes to "Stop"
3. Click "Update" — verify code re-evaluates
4. Type invalid code and click "Update" — verify error appears in the error bar
5. Fix the code and click "Update" — verify error clears
6. Click "Stop" — verify audio stops and button changes to "Play"
7. Open a non-Strudel file — verify the sidecar buttons are still present but
   commands are disabled

- [ ] **Step 6: Commit**

```bash
git add src/sidecarPanel.ts src/index.ts style/base.css
git commit -m "feat: add sidecar panel with transport controls and error display"
```

---

### Task 6: Documentation widget

**Files:**
- Create: `src/documentationWidget.ts`
- Modify: `src/sidecarPanel.ts`
- Modify: `style/base.css`

- [ ] **Step 1: Create the documentation widget**

Create `src/documentationWidget.ts`:

```typescript
import { Widget } from '@lumino/widgets';

interface FunctionDoc {
  readonly name: string;
  readonly description: string;
  readonly examples: readonly string[];
}

export class DocumentationWidget extends Widget {
  private readonly _searchInput: HTMLInputElement;
  private readonly _docsList: HTMLDivElement;
  private _allDocs: FunctionDoc[] = [];

  constructor() {
    super();
    this.addClass('jp-StrudelDocs');

    // --- Search input ---
    this._searchInput = document.createElement('input');
    this._searchInput.type = 'text';
    this._searchInput.placeholder = 'Search functions...';
    this._searchInput.className = 'jp-StrudelDocs-search jp-mod-styled';
    this._searchInput.addEventListener('input', () => {
      this._filterDocs(this._searchInput.value);
    });

    // --- Docs list ---
    this._docsList = document.createElement('div');
    this._docsList.className = 'jp-StrudelDocs-list';

    this.node.appendChild(this._searchInput);
    this.node.appendChild(this._docsList);

    // Load docs after @strudel packages have been imported
    this._loadDocumentation();
  }

  private async _loadDocumentation(): Promise<void> {
    try {
      // Import side-effect packages to ensure their functions are registered
      await import('@strudel/mini');
      await import('@strudel/tonal');

      // Query the documentation registry.
      // NOTE: The exact API name needs verification at implementation time.
      // It may be `getDocumentations`, `getDocs`, or accessed via a different
      // mechanism. Check @strudel/core exports.
      const { getDocumentations } = await import('@strudel/core');
      const docs = getDocumentations();

      this._allDocs = Object.entries(docs).map(([name, doc]) => ({
        name,
        description: (doc as { description?: string }).description ?? '',
        examples: (doc as { examples?: string[] }).examples ?? [],
      }));

      this._allDocs.sort((a, b) => a.name.localeCompare(b.name));
      this._renderDocs(this._allDocs);
    } catch (err) {
      this._docsList.textContent = `Failed to load documentation: ${err}`;
    }
  }

  private _filterDocs(query: string): void {
    const lowerQuery = query.toLowerCase();
    const filtered = this._allDocs.filter(
      doc =>
        doc.name.toLowerCase().includes(lowerQuery) ||
        doc.description.toLowerCase().includes(lowerQuery),
    );
    this._renderDocs(filtered);
  }

  private _renderDocs(docs: readonly FunctionDoc[]): void {
    this._docsList.innerHTML = '';

    for (const doc of docs) {
      const entry = document.createElement('details');
      entry.className = 'jp-StrudelDocs-entry';

      const summary = document.createElement('summary');
      summary.className = 'jp-StrudelDocs-entryName';
      summary.textContent = doc.name;
      entry.appendChild(summary);

      if (doc.description) {
        const description = document.createElement('p');
        description.className = 'jp-StrudelDocs-entryDescription';
        description.textContent = doc.description;
        entry.appendChild(description);
      }

      for (const example of doc.examples) {
        const exampleBlock = document.createElement('pre');
        exampleBlock.className = 'jp-StrudelDocs-entryExample';
        const code = document.createElement('code');
        code.textContent = example;
        exampleBlock.appendChild(code);
        entry.appendChild(exampleBlock);
      }

      this._docsList.appendChild(entry);
    }

    if (docs.length === 0) {
      this._docsList.textContent = 'No matching functions found.';
    }
  }
}
```

- [ ] **Step 2: Mount the documentation widget in the sidecar panel**

In `src/sidecarPanel.ts`, import and add the `DocumentationWidget` in the constructor,
after the existing DOM assembly:

```typescript
import { DocumentationWidget } from './documentationWidget';

// Inside StrudelSidecarPanel constructor, after this.node.appendChild(this._docsContainer):
const docsWidget = new DocumentationWidget();
// Attach the docs widget's DOM node into the docs container
this._docsContainer.appendChild(docsWidget.node);
```

- [ ] **Step 3: Add CSS for the documentation widget**

Append to `style/base.css`:

```css
.jp-StrudelDocs {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.jp-StrudelDocs-search {
  width: 100%;
  padding: 6px 8px;
  margin-bottom: 8px;
  border: 1px solid var(--jp-border-color1);
  border-radius: 4px;
  font-size: var(--jp-ui-font-size1);
  background: var(--jp-layout-color0);
  color: var(--jp-ui-font-color0);
  box-sizing: border-box;
}

.jp-StrudelDocs-search:focus {
  outline: none;
  border-color: var(--jp-brand-color1);
}

.jp-StrudelDocs-list {
  flex: 1;
  overflow-y: auto;
}

.jp-StrudelDocs-entry {
  margin-bottom: 4px;
  border: 1px solid var(--jp-border-color2);
  border-radius: 4px;
}

.jp-StrudelDocs-entryName {
  padding: 6px 8px;
  cursor: pointer;
  font-family: var(--jp-code-font-family);
  font-size: var(--jp-code-font-size);
  font-weight: 600;
  color: var(--jp-content-font-color1);
}

.jp-StrudelDocs-entryName:hover {
  background: var(--jp-layout-color2);
}

.jp-StrudelDocs-entryDescription {
  padding: 4px 8px;
  margin: 0;
  font-size: var(--jp-ui-font-size1);
  color: var(--jp-content-font-color2);
}

.jp-StrudelDocs-entryExample {
  margin: 4px 8px 8px;
  padding: 6px 8px;
  background: var(--jp-layout-color2);
  border-radius: 4px;
  font-family: var(--jp-code-font-family);
  font-size: var(--jp-code-font-size);
  overflow-x: auto;
  white-space: pre-wrap;
}

.jp-StrudelDocs-entryExample code {
  color: var(--jp-content-font-color1);
}
```

- [ ] **Step 4: Build and verify**

```bash
pnpm run build
```

- [ ] **Step 5: Manual test — documentation panel**

In a running JupyterLab:
1. Open a `.str` file — sidecar opens
2. Verify the documentation panel shows a list of Strudel functions below the controls
3. Click a function name — verify it expands to show description and examples
4. Type in the search box — verify the list filters in real-time
5. Search for "note" — verify `note` and related functions appear
6. Clear search — verify all functions are shown again

- [ ] **Step 6: Commit**

```bash
git add src/documentationWidget.ts src/sidecarPanel.ts style/base.css
git commit -m "feat: add searchable Strudel documentation panel to sidecar"
```

---

### Task 7: Collaboration via awareness protocol

**Files:**
- Create: `src/collaboration.ts`
- Create: `src/__tests__/collaboration.test.ts`
- Modify: `src/sidecarPanel.ts`
- Modify: `src/commands.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create the collaboration module**

Create `src/collaboration.ts`:

```typescript
import { Signal, ISignal } from '@lumino/signaling';

/**
 * Minimal subset of the Yjs Awareness interface we depend on.
 * This avoids a hard dependency on the Yjs types package.
 */
export interface AwarenessLike {
  clientID: number;
  getStates(): Map<number, Record<string, unknown>>;
  setLocalStateField(field: string, value: unknown): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
  off(event: string, callback: (...args: unknown[]) => void): void;
}

export class StrudelCollaboration {
  private _listening = false;
  private _awareness: AwarenessLike | null = null;
  private readonly _lastTimestamps = new Map<number, number>();
  private readonly _remoteUpdateReceived = new Signal<this, void>(this);
  private readonly _listeningChanged = new Signal<this, boolean>(this);
  private readonly _connectionChanged = new Signal<this, boolean>(this);

  get isListening(): boolean {
    return this._listening;
  }

  get remoteUpdateReceived(): ISignal<this, void> {
    return this._remoteUpdateReceived;
  }

  get listeningChanged(): ISignal<this, boolean> {
    return this._listeningChanged;
  }

  get isConnected(): boolean {
    return this._awareness !== null;
  }

  get connectionChanged(): ISignal<this, boolean> {
    return this._connectionChanged;
  }

  setAwareness(awareness: AwarenessLike | null): void {
    if (this._awareness) {
      this._awareness.off('change', this._onAwarenessChange);
    }

    this._awareness = awareness;
    this._lastTimestamps.clear();

    if (this._awareness) {
      // Snapshot current timestamps so we don't trigger on existing state
      this._snapshotTimestamps();
      this._awareness.on('change', this._onAwarenessChange);
    }

    this._connectionChanged.emit(this._awareness !== null);
  }

  setListening(enabled: boolean): void {
    if (this._listening === enabled) {
      return;
    }
    this._listening = enabled;
    this._listeningChanged.emit(enabled);
  }

  broadcastUpdate(): void {
    if (!this._awareness) {
      return;
    }
    this._awareness.setLocalStateField('strudelUpdate', {
      timestamp: Date.now(),
    });
  }

  dispose(): void {
    this.setAwareness(null);
  }

  private _snapshotTimestamps(): void {
    if (!this._awareness) {
      return;
    }
    for (const [clientId, state] of this._awareness.getStates()) {
      const update = state['strudelUpdate'] as
        | { timestamp: number }
        | undefined;
      if (update) {
        this._lastTimestamps.set(clientId, update.timestamp);
      }
    }
  }

  private readonly _onAwarenessChange = (): void => {
    if (!this._listening || !this._awareness) {
      return;
    }

    for (const [clientId, state] of this._awareness.getStates()) {
      if (clientId === this._awareness.clientID) {
        continue;
      }

      const update = state['strudelUpdate'] as
        | { timestamp: number }
        | undefined;
      if (!update) {
        continue;
      }

      const lastTimestamp = this._lastTimestamps.get(clientId);
      if (lastTimestamp === undefined || update.timestamp > lastTimestamp) {
        this._lastTimestamps.set(clientId, update.timestamp);
        this._remoteUpdateReceived.emit();
        // Only process one remote update per awareness change batch
        return;
      }
    }
  };
}
```

- [ ] **Step 2: Write unit tests for collaboration**

Create `src/__tests__/collaboration.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrudelCollaboration, AwarenessLike } from '../collaboration';

function createMockAwareness({
  clientID = 1,
}: { clientID?: number } = {}): AwarenessLike & {
  triggerChange: () => void;
  setRemoteState: (remoteClientId: number, state: Record<string, unknown>) => void;
} {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const states = new Map<number, Record<string, unknown>>();
  const localState: Record<string, unknown> = {};
  states.set(clientID, localState);

  return {
    clientID,
    getStates: () => states,
    setLocalStateField: (field: string, value: unknown) => {
      localState[field] = value;
    },
    on: (event: string, callback: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)!.push(callback);
    },
    off: (event: string, callback: (...args: unknown[]) => void) => {
      const cbs = listeners.get(event);
      if (cbs) {
        const idx = cbs.indexOf(callback);
        if (idx >= 0) {
          cbs.splice(idx, 1);
        }
      }
    },
    triggerChange: () => {
      for (const cb of listeners.get('change') ?? []) {
        cb();
      }
    },
    setRemoteState: (remoteClientId: number, state: Record<string, unknown>) => {
      states.set(remoteClientId, state);
    },
  };
}

describe('StrudelCollaboration', () => {
  let collaboration: StrudelCollaboration;
  let awareness: ReturnType<typeof createMockAwareness>;

  beforeEach(() => {
    collaboration = new StrudelCollaboration();
    awareness = createMockAwareness({ clientID: 1 });
  });

  describe('broadcastUpdate', () => {
    it('sets strudelUpdate on awareness local state', () => {
      collaboration.setAwareness(awareness);
      collaboration.broadcastUpdate();

      const states = awareness.getStates();
      const localState = states.get(1);
      expect(localState).toBeDefined();
      expect(localState!['strudelUpdate']).toBeDefined();
      expect(
        (localState!['strudelUpdate'] as { timestamp: number }).timestamp,
      ).toBeGreaterThan(0);
    });

    it('is a no-op when awareness is null', () => {
      // No error thrown
      collaboration.broadcastUpdate();
    });
  });

  describe('receiving remote updates', () => {
    it('emits remoteUpdateReceived when listening and remote state changes', () => {
      collaboration.setAwareness(awareness);
      collaboration.setListening(true);

      const handler = vi.fn();
      collaboration.remoteUpdateReceived.connect(handler);

      awareness.setRemoteState(2, { strudelUpdate: { timestamp: 100 } });
      awareness.triggerChange();

      expect(handler).toHaveBeenCalledOnce();
    });

    it('does not emit when listening is off', () => {
      collaboration.setAwareness(awareness);
      collaboration.setListening(false);

      const handler = vi.fn();
      collaboration.remoteUpdateReceived.connect(handler);

      awareness.setRemoteState(2, { strudelUpdate: { timestamp: 100 } });
      awareness.triggerChange();

      expect(handler).not.toHaveBeenCalled();
    });

    it('ignores updates from own client', () => {
      collaboration.setAwareness(awareness);
      collaboration.setListening(true);

      const handler = vi.fn();
      collaboration.remoteUpdateReceived.connect(handler);

      // Update own state (clientID 1) — should be ignored
      awareness.setLocalStateField('strudelUpdate', { timestamp: 100 });
      awareness.triggerChange();

      expect(handler).not.toHaveBeenCalled();
    });

    it('does not re-emit for the same timestamp', () => {
      collaboration.setAwareness(awareness);
      collaboration.setListening(true);

      const handler = vi.fn();
      collaboration.remoteUpdateReceived.connect(handler);

      awareness.setRemoteState(2, { strudelUpdate: { timestamp: 100 } });
      awareness.triggerChange();
      awareness.triggerChange();

      expect(handler).toHaveBeenCalledOnce();
    });

    it('emits again when timestamp increases', () => {
      collaboration.setAwareness(awareness);
      collaboration.setListening(true);

      const handler = vi.fn();
      collaboration.remoteUpdateReceived.connect(handler);

      awareness.setRemoteState(2, { strudelUpdate: { timestamp: 100 } });
      awareness.triggerChange();

      awareness.setRemoteState(2, { strudelUpdate: { timestamp: 200 } });
      awareness.triggerChange();

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('setListening', () => {
    it('emits listeningChanged signal', () => {
      const handler = vi.fn();
      collaboration.listeningChanged.connect(handler);

      collaboration.setListening(true);
      collaboration.setListening(false);

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenNthCalledWith(1, collaboration, true);
      expect(handler).toHaveBeenNthCalledWith(2, collaboration, false);
    });

    it('does not emit when value does not change', () => {
      const handler = vi.fn();
      collaboration.listeningChanged.connect(handler);

      collaboration.setListening(false);
      collaboration.setListening(false);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('removes awareness listener', () => {
      collaboration.setAwareness(awareness);
      collaboration.setListening(true);
      collaboration.dispose();

      const handler = vi.fn();
      collaboration.remoteUpdateReceived.connect(handler);

      awareness.setRemoteState(2, { strudelUpdate: { timestamp: 100 } });
      awareness.triggerChange();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('setAwareness', () => {
    it('snapshots existing timestamps to avoid spurious triggers', () => {
      // Remote client already has a strudelUpdate before we connect
      awareness.setRemoteState(2, { strudelUpdate: { timestamp: 50 } });

      collaboration.setAwareness(awareness);
      collaboration.setListening(true);

      const handler = vi.fn();
      collaboration.remoteUpdateReceived.connect(handler);

      // Trigger change without updating timestamp — should not fire
      awareness.triggerChange();

      expect(handler).not.toHaveBeenCalled();

      // New update with higher timestamp — should fire
      awareness.setRemoteState(2, { strudelUpdate: { timestamp: 100 } });
      awareness.triggerChange();

      expect(handler).toHaveBeenCalledOnce();
    });

    it('emits connectionChanged when awareness is set or cleared', () => {
      const handler = vi.fn();
      collaboration.connectionChanged.connect(handler);

      collaboration.setAwareness(awareness);
      expect(handler).toHaveBeenCalledWith(collaboration, true);

      collaboration.setAwareness(null);
      expect(handler).toHaveBeenCalledWith(collaboration, false);
    });
  });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm test
```

Expected: All tests pass (both engine and collaboration tests).

- [ ] **Step 4: Add collaboration toggle to sidecar panel**

In `src/sidecarPanel.ts`, add a collaboration toggle that is conditionally rendered.
Update the constructor to accept an optional `collaboration` parameter:

```typescript
import type { StrudelCollaboration } from './collaboration';

// Update the StrudelSidecarPanel constructor signature:
constructor({
  app,
  engine,
  icon,
  collaboration,
}: {
  app: JupyterFrontEnd;
  engine: StrudelEngine;
  icon: LabIcon;
  collaboration?: StrudelCollaboration | null;
}) {
  // ... existing constructor code ...

  // After controlsContainer, before errorDisplay, add collaboration toggle:
  if (collaboration) {
    const collabContainer = document.createElement('div');
    collabContainer.className = 'jp-StrudelSidecar-collaboration';
    // Hidden by default — only shown when awareness is connected
    collabContainer.style.display = 'none';

    const collabCheckbox = document.createElement('input');
    collabCheckbox.type = 'checkbox';
    collabCheckbox.id = 'strudel-listen-toggle';
    collabCheckbox.checked = false;
    collabCheckbox.addEventListener('change', () => {
      collaboration.setListening(collabCheckbox.checked);
    });

    const collabLabel = document.createElement('label');
    collabLabel.htmlFor = 'strudel-listen-toggle';
    collabLabel.textContent = 'Listen to remote updates';

    collabContainer.appendChild(collabCheckbox);
    collabContainer.appendChild(collabLabel);

    // Show/hide based on whether awareness is connected
    collaboration.connectionChanged.connect((_sender, connected) => {
      collabContainer.style.display = connected ? 'flex' : 'none';
      if (!connected) {
        collabCheckbox.checked = false;
        collaboration.setListening(false);
      }
    });

    // Insert after controls, before error display
    this.node.insertBefore(collabContainer, this._errorDisplay);
  }
}
```

- [ ] **Step 5: Wire collaboration into index.ts**

Update `src/index.ts` to detect jupyter-collaboration and set up the collaboration
module. This is the most complex wiring step.

```typescript
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from '@jupyterlab/application';
import { IEditorLanguageRegistry } from '@jupyterlab/codemirror';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { IEditorTracker } from '@jupyterlab/fileeditor';
import { strudelIcon } from './icon';
import {
  registerStrudelFileType,
  registerStrudelLanguage,
  STRUDEL_FILE_EXTENSIONS,
} from './fileType';
import { StrudelEngine } from './engine';
import { registerStrudelCommands } from './commands';
import { StrudelSidecarPanel } from './sidecarPanel';
import { StrudelCollaboration } from './collaboration';

function isStrudelPath(path: string): boolean {
  return STRUDEL_FILE_EXTENSIONS.some(ext => path.endsWith(ext));
}

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-strudel:plugin',
  description: 'Strudel livecoding for JupyterLab',
  autoStart: true,
  requires: [IEditorLanguageRegistry, IDocumentManager, IEditorTracker],
  // NOTE: To add optional collaboration detection, add the
  // ICollaborativeDrive token (or equivalent) to this array once the
  // correct token import is determined at implementation time.
  // The token to detect jupyter-collaboration may be:
  //   - ICollaborativeDrive from @jupyter/collaborative-drive
  //   - Or a token from @jupyter/docprovider
  // Check the jupyter-collaboration docs for the correct token.
  optional: [],

  activate: (
    app: JupyterFrontEnd,
    languageRegistry: IEditorLanguageRegistry,
    docManager: IDocumentManager,
    editorTracker: IEditorTracker,
  ) => {
    console.log('jupyter-strudel: activating');

    registerStrudelFileType({
      docRegistry: app.docRegistry,
      icon: strudelIcon,
    });
    registerStrudelLanguage({ languageRegistry });

    const engine = new StrudelEngine();

    // Set up collaboration (will be connected to awareness per-document)
    // For now, create the instance unconditionally. The awareness will
    // only be set when jupyter-collaboration is detected and a .str file
    // is opened collaboratively.
    const collaboration = new StrudelCollaboration();

    // When a remote update is received and listening is on, evaluate
    collaboration.remoteUpdateReceived.connect(() => {
      const currentWidget = app.shell.currentWidget;
      if (!currentWidget) {
        return;
      }
      const context = docManager.contextForWidget(currentWidget);
      if (!context || !isStrudelPath(context.path)) {
        return;
      }
      const content = context.model.toString();
      engine.evaluateAndPlay(content);
    });

    registerStrudelCommands({ app, docManager, engine, collaboration });

    const sidecarPanel = new StrudelSidecarPanel({
      app,
      engine,
      icon: strudelIcon,
      collaboration,
    });
    app.shell.add(sidecarPanel, 'right', { rank: 1000 });

    // Track active editor — auto-open sidecar and update awareness
    editorTracker.currentChanged.connect((_tracker, widget) => {
      if (!widget || !isStrudelPath(widget.context.path)) {
        collaboration.setAwareness(null);
        return;
      }

      app.shell.activateById(sidecarPanel.id);

      // Attempt to get the awareness from the shared model.
      // This will only work when jupyter-collaboration is installed
      // and the document has a collaborative shared model.
      try {
        const sharedModel = widget.context.model.sharedModel as {
          awareness?: import('./collaboration').AwarenessLike;
        };
        if (sharedModel.awareness) {
          collaboration.setAwareness(sharedModel.awareness);
          console.log('jupyter-strudel: awareness connected for', widget.context.path);
        } else {
          collaboration.setAwareness(null);
        }
      } catch {
        collaboration.setAwareness(null);
      }
    });

    console.log('jupyter-strudel: activated');
  },
};

export default plugin;
```

- [ ] **Step 6: Build and verify**

```bash
pnpm run build
pnpm test
```

- [ ] **Step 7: Manual test — collaboration**

This requires two browser windows connected to the same JupyterLab server with
jupyter-collaboration installed:

1. Install jupyter-collaboration: `uv pip install jupyter-collaboration`
2. Start JupyterLab: `jupyter lab`
3. Open `test.str` in both browser windows
4. In Window B, check "Listen to remote updates" in the sidecar
5. In Window A, type `` note("c3 e3 g3").s("piano") `` and press Ctrl+Enter
6. Verify Window A plays the pattern
7. Verify Window B also evaluates and plays the pattern
8. In Window B, uncheck "Listen to remote updates"
9. In Window A, modify the code and press Ctrl+Enter
10. Verify Window A updates but Window B does not

- [ ] **Step 8: Commit**

```bash
git add src/collaboration.ts src/__tests__/collaboration.test.ts src/sidecarPanel.ts src/commands.ts src/index.ts
git commit -m "feat: add collaborative update broadcasting via Yjs awareness protocol"
```

---

### Task 8: Final integration and polish

**Files:**
- Modify: `style/base.css`
- Modify: `package.json`

- [ ] **Step 1: Add style entry point**

Verify `style/index.js` imports the CSS:

```javascript
import './base.css';
```

Verify `style/index.css` has appropriate content (may just re-export or be empty
depending on the template's CSS strategy). Check the copier template's generated
`style/index.css` and `style/index.js` and ensure `base.css` is imported.

- [ ] **Step 2: Verify package.json metadata**

Ensure `package.json` has correct fields:

```json
{
  "name": "jupyter-strudel",
  "version": "0.1.0",
  "description": "Strudel livecoding for JupyterLab",
  "keywords": [
    "jupyter",
    "jupyterlab",
    "jupyterlab-extension",
    "strudel",
    "livecoding",
    "music"
  ],
  "license": "MIT",
  "jupyterlab": {
    "extension": true,
    "outputDir": "jupyter_strudel/labextension"
  }
}
```

- [ ] **Step 3: Full clean build**

```bash
pnpm run clean
pnpm run build
pnpm test
```

- [ ] **Step 4: Full manual test — end-to-end checklist**

Run through this checklist in a fresh JupyterLab instance:

1. **File type**: Create `test.str` and `test.std` — both open with Strudel icon and
   syntax highlighting
2. **Sidecar auto-open**: Opening a `.str` file opens the sidecar panel on the right
3. **Sidecar closes context**: Switching to a non-Strudel file — sidecar remains but
   controls are functionally disabled
4. **Play**: Click Play — audio starts, button changes to Stop
5. **Update (button)**: Click Update — code re-evaluates
6. **Update (Ctrl+Enter)**: Press Ctrl+Enter — code re-evaluates
7. **Stop**: Click Stop — audio stops, button changes to Play
8. **Error display**: Type invalid code, press Ctrl+Enter — error appears in status bar
9. **Error clear**: Fix code, press Ctrl+Enter — error clears
10. **Documentation**: Scroll through docs, search for functions, expand entries
11. **Collaboration** (with jupyter-collaboration installed):
    - Open same file in two windows
    - Real-time text sync works
    - Enable "Listen to remote updates" in one window
    - Ctrl+Enter in the other — both hear the update
    - Disable toggle — updates are no longer shared
12. **JupyterLite** (if applicable): Verify extension loads and works without
    collaboration features (no toggle shown, play/stop/update work)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: finalize styling, metadata, and integration verification"
```
