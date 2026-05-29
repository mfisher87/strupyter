import type { JupyterFrontEnd } from '@jupyterlab/application';
import type { IDocumentManager } from '@jupyterlab/docmanager';
import type { StrudelEngine } from './engine';
import type { StrudelCollaboration } from './collaboration';
import { STRUDEL_FILE_EXTENSIONS } from './fileType';

export const CommandIds = {
  evaluate: 'strudel:evaluate',
  play: 'strudel:play',
  stop: 'strudel:stop'
} as const;

function isStrudelPath(path: string): boolean {
  return STRUDEL_FILE_EXTENSIONS.some(ext => path.endsWith(ext));
}

function getActiveStrudelContent({
  app,
  docManager
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
  collaboration
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
    }
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
    }
  });

  app.commands.addCommand(CommandIds.stop, {
    label: 'Strudel: Stop',
    isEnabled: () => engine.isPlaying,
    execute: () => {
      engine.stop();
    }
  });

  app.commands.addKeyBinding({
    command: CommandIds.evaluate,
    keys: ['Ctrl Enter'],
    selector: '.jp-FileEditor'
  });
}
