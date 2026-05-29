import { Widget } from '@lumino/widgets';

interface FunctionDoc {
  readonly name: string;
  readonly description: string;
  readonly examples: readonly string[];
}

/**
 * Searchable, browsable Strudel function reference.
 * Queries the documentation registry from @strudel/core after
 * side-effect packages have been imported.
 */
export class DocumentationWidget extends Widget {
  private readonly _searchInput: HTMLInputElement;
  private readonly _docsList: HTMLDivElement;
  private _allDocs: FunctionDoc[] = [];

  constructor() {
    super();
    this.addClass('jp-StrudelDocs');

    this._searchInput = document.createElement('input');
    this._searchInput.type = 'text';
    this._searchInput.placeholder = 'Search functions...';
    this._searchInput.className = 'jp-StrudelDocs-search jp-mod-styled';
    this._searchInput.addEventListener('input', () => {
      this._filterDocs(this._searchInput.value);
    });

    this._docsList = document.createElement('div');
    this._docsList.className = 'jp-StrudelDocs-list';

    this.node.appendChild(this._searchInput);
    this.node.appendChild(this._docsList);

    this._loadDocumentation();
  }

  private async _loadDocumentation(): Promise<void> {
    try {
      // Import side-effect packages to register their functions + docs
      await import('@strudel/mini');
      await import('@strudel/tonal');

      // The documentation data lives in @strudel/core's function registry.
      // The exact API may vary — try known export names.
      const core = await import('@strudel/core');
      const getDocsFunction =
        (core as any).getDocumentations ??
        (core as any).getDocs ??
        (core as any).getDoc;

      if (typeof getDocsFunction !== 'function') {
        this._docsList.textContent =
          'Documentation API not found in @strudel/core. ' +
          'Functions are registered but docs query is unavailable.';
        return;
      }

      const docs = getDocsFunction();
      this._allDocs = Object.entries(docs).map(([name, doc]) => ({
        name,
        description: (doc as { description?: string }).description ?? '',
        examples: (doc as { examples?: string[] }).examples ?? []
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
        doc.description.toLowerCase().includes(lowerQuery)
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
