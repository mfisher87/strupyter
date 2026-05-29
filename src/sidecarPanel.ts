import { Widget } from '@lumino/widgets';
import type { JupyterFrontEnd } from '@jupyterlab/application';
import type { LabIcon } from '@jupyterlab/ui-components';
import type { StrudelEngine, EvaluationResult, EngineState } from './engine';
import type { StrudelCollaboration } from './collaboration';
import { CommandIds } from './commands';
import { DocumentationWidget } from './documentationWidget';

/**
 * Right-sidebar panel providing transport controls, error display,
 * collaboration toggle, and Strudel documentation.
 */
export class StrudelSidecarPanel extends Widget {
  private readonly _playStopButton: HTMLButtonElement;
  private readonly _updateButton: HTMLButtonElement;
  private readonly _errorDisplay: HTMLDivElement;
  private readonly _app: JupyterFrontEnd;

  constructor({
    app,
    engine,
    icon,
    collaboration
  }: {
    app: JupyterFrontEnd;
    engine: StrudelEngine;
    icon: LabIcon;
    collaboration?: StrudelCollaboration | null;
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

    // --- Collaboration toggle (hidden until awareness connects) ---
    if (collaboration) {
      const collabContainer = document.createElement('div');
      collabContainer.className = 'jp-StrudelSidecar-collaboration';
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

      collaboration.connectionChanged.connect((_sender, connected) => {
        collabContainer.style.display = connected ? 'flex' : 'none';
        if (!connected) {
          collabCheckbox.checked = false;
          collaboration.setListening(false);
        }
      });

      this.node.appendChild(controlsContainer);
      this.node.appendChild(collabContainer);
    } else {
      this.node.appendChild(controlsContainer);
    }

    // --- Error display ---
    this._errorDisplay = document.createElement('div');
    this._errorDisplay.className = 'jp-StrudelSidecar-error';
    this.node.appendChild(this._errorDisplay);

    // --- Documentation ---
    const docsContainer = document.createElement('div');
    docsContainer.className = 'jp-StrudelSidecar-docs';
    const docsWidget = new DocumentationWidget();
    docsContainer.appendChild(docsWidget.node);
    this.node.appendChild(docsContainer);

    // --- Connect to engine signals ---
    engine.stateChanged.connect(this._onEngineStateChanged, this);
    engine.evaluationCompleted.connect(this._onEvaluationCompleted, this);
  }

  private _onEngineStateChanged(
    _sender: StrudelEngine,
    state: EngineState
  ): void {
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
    result: EvaluationResult
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
