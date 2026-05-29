import { LabIcon } from '@jupyterlab/ui-components';

// Simple music note placeholder — replace with the actual Strudel logo SVG.
const STRUDEL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4
           4-1.79 4-4V7h4V3h-6z"/>
</svg>`;

export const strudelIcon = new LabIcon({
  name: 'strudel:icon',
  svgstr: STRUDEL_SVG
});
