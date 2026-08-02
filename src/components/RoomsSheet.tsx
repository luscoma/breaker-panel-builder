import { useState } from 'react';

interface RoomsSheetProps {
  rooms: string[];
  usage: (room: string) => number;
  roomColor: (room: string) => string | null;
  onAdd: (room: string) => void;
  onRename: (from: string, to: string) => void;
  onRemove: (room: string) => void;
  onClose: () => void;
}

export function RoomsSheet({
  rooms,
  usage,
  roomColor,
  onAdd,
  onRename,
  onRemove,
  onClose,
}: RoomsSheetProps) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const name = draft.trim();
    if (!name) return;
    onAdd(name);
    setDraft('');
  };

  return (
    <div className="sheet" role="dialog" aria-label="Rooms">
      <div className="sheet__header">
        <div>
          <h2 className="sheet__title">Rooms</h2>
          <p className="sheet__subtitle">
            Add rooms up front, or just type one on a circuit and it lands here.
          </p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="sheet__section">
        <div className="circuit-editor__fields">
          <input
            className="field__input"
            type="text"
            value={draft}
            placeholder="New room, e.g. Family"
            aria-label="New room name"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            autoComplete="off"
          />
          <button type="button" className="btn" onClick={add}>
            Add room
          </button>
        </div>
      </div>

      <div className="sheet__section">
        {rooms.length === 0 && <p className="palette__hint">No rooms yet.</p>}
        {rooms.map((room) => {
          const count = usage(room);
          const color = roomColor(room);
          return (
            <div className="room-row" key={room}>
              <span className="room-row__dot" style={color ? { background: color } : undefined} />
              <input
                className="field__input"
                type="text"
                defaultValue={room}
                aria-label={`Rename ${room}`}
                onBlur={(e) => onRename(room, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                autoComplete="off"
              />
              <span className="room-row__count">
                {count} circuit{count === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => onRemove(room)}
                aria-label={`Remove ${room}`}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <div className="sheet__footer">
        <span />
        <button type="button" className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
