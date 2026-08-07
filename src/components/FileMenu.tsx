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
 *
 * A disclosure, not a `role="menu"` widget: that role promises arrow-key
 * navigation and typeahead, and tabbing through four buttons is fine here.
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

  const items: [string, () => void][] = [
    ['Copy PNG', onCopyPng],
    ['Download SVG', onDownloadSvg],
    ['Export JSON', onExportJson],
    ['Import JSON…', onImportJson],
  ];

  return (
    <div className="filemenu" ref={wrapRef}>
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        File {open ? '▲' : '▾'}
      </button>
      {open && (
        <div className="filemenu__items" role="group" aria-label="Export and import">
          {items.map(([label, action]) => (
            <button key={label} type="button" className="filemenu__item" onClick={run(action)}>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
