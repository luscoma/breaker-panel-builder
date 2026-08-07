import { serializePanelFile } from '../model/panelFile';
import { PanelState } from '../model/types';
import { downloadBlob, fileStem } from './download';

/** Download the panel as a human-readable, hand-editable JSON file. */
export function downloadPanelJson(state: PanelState): void {
  const blob = new Blob([serializePanelFile(state)], { type: 'application/json' });
  downloadBlob(blob, `${fileStem(state.name)}.json`);
}
