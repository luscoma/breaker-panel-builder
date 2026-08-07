import { useEffect, useRef, useState } from 'react';

interface FileMenuProps {
  onCopyPng: () => void;
  onDownloadSvg: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
}

/**
 * The export and import actions, collapsed behind one button. Four separate
 * buttons plus Rooms, Copy link and Clear wrapped the toolbar onto three rows
 * on a phone; these are all occasional actions, so one extra tap is cheap.
 */
export function FileMenu({
  onCopyPng,
  onDownloadSvg,
  onExportJson,
  onImportJson,
}: FileMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="filemenu" ref={wrapRef}>
      <button
        type="button"
        className="btn"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        File {open ? '▲' : '▾'}
      </button>
      {open && (
        <div className="filemenu__items" role="menu">
          <button type="button" className="filemenu__item" role="menuitem" onClick={run(onCopyPng)}>
            Copy PNG
          </button>
          <button
            type="button"
            className="filemenu__item"
            role="menuitem"
            onClick={run(onDownloadSvg)}
          >
            Download SVG
          </button>
          <button
            type="button"
            className="filemenu__item"
            role="menuitem"
            onClick={run(onExportJson)}
          >
            Export JSON
          </button>
          <button
            type="button"
            className="filemenu__item"
            role="menuitem"
            onClick={run(onImportJson)}
          >
            Import JSON…
          </button>
        </div>
      )}
    </div>
  );
}
