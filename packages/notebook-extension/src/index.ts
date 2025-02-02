// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ISessionContext, DOMUtils } from '@jupyterlab/apputils';

import { PageConfig, Text, Time } from '@jupyterlab/coreutils';

import { IDocumentManager } from '@jupyterlab/docmanager';

import { NotebookPanel } from '@jupyterlab/notebook';

import {
  App,
  ClassicShell,
  IClassicShell
} from '@jupyterlab-classic/application';

import { Widget } from '@lumino/widgets';

/**
 * The class for kernel status errors.
 */
const KERNEL_STATUS_ERROR_CLASS = 'jp-ClassicKernelStatus-error';

/**
 * The class for kernel status warnings.
 */
const KERNEL_STATUS_WARN_CLASS = 'jp-ClassicKernelStatus-warn';

/**
 * The class for kernel status infos.
 */
const KERNEL_STATUS_INFO_CLASS = 'jp-ClassicKernelStatus-info';

/**
 * The class to fade out the kernel status.
 */
const KERNEL_STATUS_FADE_OUT_CLASS = 'jp-ClassicKernelStatus-fade';

/**
 * A plugin for the checkpoint indicator
 */
const checkpoints: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab-classic/application-extension:checkpoints',
  autoStart: true,
  requires: [IDocumentManager],
  optional: [IClassicShell],
  activate: (
    app: JupyterFrontEnd,
    docManager: IDocumentManager,
    classicShell: IClassicShell
  ) => {
    const { shell } = app;
    const widget = new Widget();
    widget.id = DOMUtils.createDomID();
    widget.addClass('jp-ClassicCheckpoint');
    app.shell.add(widget, 'top', { rank: 100 });

    const onChange = async () => {
      const current = shell.currentWidget;
      if (!current) {
        return;
      }
      const context = docManager.contextForWidget(current);

      context?.fileChanged.disconnect(onChange);
      context?.fileChanged.connect(onChange);

      const checkpoints = await context?.listCheckpoints();
      if (!checkpoints) {
        return;
      }
      const checkpoint = checkpoints[checkpoints.length - 1];
      widget.node.textContent = `Last Checkpoint: ${Time.formatHuman(
        new Date(checkpoint.last_modified)
      )}`;
    };

    if (classicShell) {
      classicShell.currentChanged.connect(onChange);
    }
    // TODO: replace by a Poll
    onChange();
    setInterval(onChange, 2000);
  }
};

/**
 * The kernel logo plugin.
 */
const kernelLogo: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab-classic/application-extension:kernel-logo',
  autoStart: true,
  requires: [IClassicShell],
  activate: (app: JupyterFrontEnd, shell: IClassicShell) => {
    const { serviceManager } = app;
    const baseUrl = PageConfig.getBaseUrl();

    let widget: Widget;
    // TODO: this signal might not be needed if we assume there is always only
    // one notebook in the main area
    const onChange = async () => {
      if (widget) {
        widget.dispose();
        widget.parent = null;
      }
      const current = shell.currentWidget;
      if (!(current instanceof NotebookPanel)) {
        return;
      }

      await current.sessionContext.ready;
      current.sessionContext.kernelChanged.disconnect(onChange);
      current.sessionContext.kernelChanged.connect(onChange);

      const name = current.sessionContext.session?.kernel?.name ?? '';
      const spec = serviceManager.kernelspecs?.specs?.kernelspecs[name];
      if (!spec) {
        return;
      }

      let kernelIconUrl = spec.resources['logo-64x64'];
      if (!kernelIconUrl) {
        return;
      }

      const index = kernelIconUrl.indexOf('kernelspecs');
      kernelIconUrl = baseUrl + kernelIconUrl.slice(index);
      const node = document.createElement('div');
      const img = document.createElement('img');
      img.src = kernelIconUrl;
      img.title = spec.display_name;
      node.appendChild(img);
      widget = new Widget({ node });
      widget.addClass('jp-ClassicKernelLogo');
      app.shell.add(widget, 'top', { rank: 10_010 });
    };

    shell.currentChanged.connect(onChange);
  }
};

/**
 * A plugin to display the kernel status;
 */
const kernelStatus: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab-classic/application-extension:kernel-status',
  autoStart: true,
  requires: [IClassicShell],
  activate: (app: JupyterFrontEnd, shell: IClassicShell) => {
    const widget = new Widget();
    widget.addClass('jp-ClassicKernelStatus');
    app.shell.add(widget, 'menu', { rank: 10_010 });

    const removeClasses = () => {
      widget.removeClass(KERNEL_STATUS_ERROR_CLASS);
      widget.removeClass(KERNEL_STATUS_WARN_CLASS);
      widget.removeClass(KERNEL_STATUS_INFO_CLASS);
      widget.removeClass(KERNEL_STATUS_FADE_OUT_CLASS);
    };

    const onStatusChanged = (sessionContext: ISessionContext) => {
      const status = sessionContext.kernelDisplayStatus;
      let text = `Kernel ${Text.titleCase(status)}`;
      removeClasses();
      switch (status) {
        case 'busy':
        case 'idle':
          text = '';
          widget.addClass(KERNEL_STATUS_FADE_OUT_CLASS);
          break;
        case 'dead':
        case 'terminating':
          widget.addClass(KERNEL_STATUS_ERROR_CLASS);
          break;
        case 'unknown':
          widget.addClass(KERNEL_STATUS_WARN_CLASS);
          break;
        default:
          widget.addClass(KERNEL_STATUS_INFO_CLASS);
          widget.addClass(KERNEL_STATUS_FADE_OUT_CLASS);
          break;
      }
      widget.node.textContent = text;
    };

    // TODO: this signal might not be needed if we assume there is always only
    // one notebook in the main area
    const onChange = async () => {
      const current = shell.currentWidget;
      if (!(current instanceof NotebookPanel)) {
        return;
      }
      const sessionContext = current.sessionContext;
      sessionContext.statusChanged.connect(onStatusChanged);
    };

    shell.currentChanged.connect(onChange);
  }
};

/**
 * The default paths for a JupyterLab Classic app.
 */
const paths: JupyterFrontEndPlugin<JupyterFrontEnd.IPaths> = {
  id: '@jupyterlab-classic/application-extension:paths',
  activate: (app: JupyterFrontEnd): JupyterFrontEnd.IPaths => {
    if (!(app instanceof App)) {
      throw new Error(`${paths.id} must be activated in JupyterLab Classic.`);
    }
    return app.paths;
  },
  autoStart: true,
  provides: JupyterFrontEnd.IPaths
};

/**
 * The default JupyterLab Classic application shell.
 */
const shell: JupyterFrontEndPlugin<IClassicShell> = {
  id: '@jupyterlab-classic/application-extension:shell',
  activate: (app: JupyterFrontEnd) => {
    if (!(app.shell instanceof ClassicShell)) {
      throw new Error(`${shell.id} did not find a ClassicShell instance.`);
    }
    return app.shell;
  },
  autoStart: true,
  provides: IClassicShell
};

/**
 * Export the plugins as default.
 */
const plugins: JupyterFrontEndPlugin<any>[] = [
  checkpoints,
  kernelLogo,
  kernelStatus
];

export default plugins;
