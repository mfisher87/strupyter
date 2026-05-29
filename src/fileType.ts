import type { DocumentRegistry } from '@jupyterlab/docregistry';
import type { IEditorLanguageRegistry } from '@jupyterlab/codemirror';
import type { LabIcon } from '@jupyterlab/ui-components';

export const STRUDEL_MIME_TYPE = 'text/x-strudel';
export const STRUDEL_FILE_EXTENSIONS = ['.str', '.std'];

export function registerStrudelFileType({
  docRegistry,
  icon
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
    contentType: 'file'
  });
}

export function registerStrudelLanguage({
  languageRegistry
}: {
  languageRegistry: IEditorLanguageRegistry;
}): void {
  languageRegistry.addLanguage({
    name: 'Strudel',
    mime: STRUDEL_MIME_TYPE,
    extensions: ['str', 'std'],
    load: async () => {
      // Strudel code is JavaScript with DSL sugar (mini-notation in backticks,
      // method chaining on strings/numbers). JavaScript highlighting covers
      // the syntax well. @strudel/codemirror doesn't export a standalone
      // LanguageSupport — it bundles a full editor setup.
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript();
    }
  });
}
