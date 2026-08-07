/**
 * Shared file-download plumbing. Lives apart from the renderers so the PNG,
 * SVG and JSON exports cannot drift on filename or cleanup behaviour.
 */

/** A filename stem from the panel's name: "Lusco House" -> "lusco-house". */
export function fileStem(name: string): string {
  const base = (name || 'panel').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return base.replace(/^-|-$/g, '') || 'panel';
}

/**
 * Revoking synchronously after click() races the download in some browsers,
 * so let the click settle first.
 */
export function revokeSoon(url: string): void {
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function triggerDownload(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Write a blob to the user's downloads under `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  revokeSoon(url);
}
