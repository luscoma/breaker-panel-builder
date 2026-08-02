import { PanelState } from '../model/types';
import { renderPanelSvg, SVG_SIZE } from './svg';

const SCALE = 2;

function svgDataUrl(svg: string): string {
  // encodeURIComponent keeps non-ASCII labels intact through the data URL.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function fileStem(state: PanelState): string {
  const base = (state.name || 'panel').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return base.replace(/^-|-$/g, '') || 'panel';
}

function triggerDownload(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function downloadSvg(state: PanelState): void {
  const blob = new Blob([renderPanelSvg(state)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, `${fileStem(state)}.svg`);
  URL.revokeObjectURL(url);
}

export async function renderPanelPngBlob(state: PanelState): Promise<Blob> {
  const svg = renderPanelSvg(state);
  const image = new Image();
  image.width = SVG_SIZE.width;
  image.height = SVG_SIZE.height;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not rasterize the panel image'));
    image.src = svgDataUrl(svg);
  });

  const canvas = document.createElement('canvas');
  canvas.width = SVG_SIZE.width * SCALE;
  canvas.height = SVG_SIZE.height * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
      'image/png',
    );
  });
}

export async function downloadPng(state: PanelState): Promise<void> {
  const blob = await renderPanelPngBlob(state);
  const url = URL.createObjectURL(blob);
  triggerDownload(url, `${fileStem(state)}.png`);
  URL.revokeObjectURL(url);
}

/**
 * Copy the panel image to the clipboard where the browser allows it,
 * falling back to a download so the action always produces something.
 * Returns what actually happened so the UI can report it honestly.
 */
export async function copyPngToClipboard(state: PanelState): Promise<'copied' | 'downloaded'> {
  const blob = await renderPanelPngBlob(state);
  const canCopy =
    typeof ClipboardItem !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard &&
    'write' in navigator.clipboard;

  if (canCopy) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'copied';
    } catch {
      // Permission denied or unsupported in this context — fall through.
    }
  }

  const url = URL.createObjectURL(blob);
  triggerDownload(url, `${fileStem(state)}.png`);
  URL.revokeObjectURL(url);
  return 'downloaded';
}
