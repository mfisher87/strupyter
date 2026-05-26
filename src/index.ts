import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

/**
 * Initialization data for the jupyter-strudel extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-strudel:plugin',
  description: 'Strudel livecoding for JupyterLab',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    console.log('JupyterLab extension jupyter-strudel is activated!');
  }
};

export default plugin;
