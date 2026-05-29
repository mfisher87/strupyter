import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IEditorLanguageRegistry } from '@jupyterlab/codemirror';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { IEditorTracker } from '@jupyterlab/fileeditor';
import { strudelIcon } from './icon';
import {
  registerStrudelFileType,
  registerStrudelLanguage,
  STRUDEL_FILE_EXTENSIONS
} from './fileType';
import { StrudelEngine } from './engine';
import { registerStrudelCommands } from './commands';
import { StrudelSidecarPanel } from './sidecarPanel';
import { StrudelCollaboration } from './collaboration';
import type { AwarenessLike } from './collaboration';

function isStrudelPath(path: string): boolean {
  return STRUDEL_FILE_EXTENSIONS.some(ext => path.endsWith(ext));
}

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-strudel:plugin',
  description: 'Strudel livecoding for JupyterLab',
  autoStart: true,
  requires: [IEditorLanguageRegistry, IDocumentManager, IEditorTracker],
  // TODO: Add ICollaborativeDrive (or equivalent token from
  // @jupyter/collaborative-drive or @jupyter/docprovider) to this array
  // to formally detect jupyter-collaboration at activation time.
  optional: [],

  activate: (
    app: JupyterFrontEnd,
    languageRegistry: IEditorLanguageRegistry,
    docManager: IDocumentManager,
    editorTracker: IEditorTracker
  ) => {
    console.log('jupyter-strudel: activating');

    registerStrudelFileType({
      docRegistry: app.docRegistry,
      icon: strudelIcon
    });
    registerStrudelLanguage({ languageRegistry });

    const engine = new StrudelEngine();
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
      collaboration
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
      // Only works when jupyter-collaboration is installed and the
      // document has a collaborative shared model.
      try {
        const sharedModel = widget.context.model.sharedModel as {
          awareness?: AwarenessLike;
        };
        if (sharedModel.awareness) {
          collaboration.setAwareness(sharedModel.awareness);
          console.log(
            'jupyter-strudel: awareness connected for',
            widget.context.path
          );
        } else {
          collaboration.setAwareness(null);
        }
      } catch {
        collaboration.setAwareness(null);
      }
    });

    console.log('jupyter-strudel: activated');
  }
};

export default plugin;
