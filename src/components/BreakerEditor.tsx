import { occupiedSlots, throwsFor } from '../model/panel';
import { ALL_CONFIGS, Breaker, BreakerConfig, CONFIGS } from '../model/types';

interface BreakerEditorProps {
  breaker: Breaker;
  rooms: string[];
  labels: string[];
  roomColor: (room: string) => string | null;
  canUseConfig: (config: BreakerConfig) => boolean;
  onConfigChange: (config: BreakerConfig) => void;
  onRoomChange: (circuit: number, room: string) => void;
  onLabelChange: (circuit: number, label: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function BreakerEditor({
  breaker,
  rooms,
  labels,
  roomColor,
  canUseConfig,
  onConfigChange,
  onRoomChange,
  onLabelChange,
  onRemove,
  onClose,
}: BreakerEditorProps) {
  const throws = throwsFor(breaker.config);
  const slots = occupiedSlots(breaker);
  const monitored = throws.length === 1;

  const oneSlot = ALL_CONFIGS.filter((c) => CONFIGS[c].slots === 1);
  const twoSlot = ALL_CONFIGS.filter((c) => CONFIGS[c].slots === 2);

  return (
    <div className="sheet" role="dialog" aria-label="Edit breaker">
      <datalist id="labels-list">
        {labels.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>

      <div className="sheet__header">
        <div>
          <h2 className="sheet__title">
            Slot{slots.length > 1 ? 's' : ''} {slots.join(' & ')}
          </h2>
          <p className="sheet__subtitle">
            {monitored ? 'Individually monitored' : 'Circuits share a monitoring channel'}
          </p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="sheet__section">
        <label className="field__label" htmlFor="breaker-config">
          Breaker
        </label>
        <select
          id="breaker-config"
          className="field__input"
          value={breaker.config}
          onChange={(e) => onConfigChange(e.target.value as BreakerConfig)}
        >
          <optgroup label="One slot">
            {oneSlot.map((config) => (
              <option key={config} value={config} disabled={!canUseConfig(config)}>
                {CONFIGS[config].label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Two slots">
            {twoSlot.map((config) => (
              <option key={config} value={config} disabled={!canUseConfig(config)}>
                {CONFIGS[config].label}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      <div className="sheet__section">
        {throws.map((t, i) => {
          const circuit = breaker.circuits[i] ?? { room: '', label: '' };
          return (
            <div className="circuit-editor" key={i}>
              <div className="field__label">
                Circuit {i + 1}
                <span className={`tag tag--${t.voltage}`}>
                  {t.voltage}V {t.poles === 2 ? '2-pole' : '1-pole'}
                </span>
              </div>

              {rooms.length > 0 && (
                <div className="chips">
                  {rooms.map((room) => {
                    const active = circuit.room === room;
                    const color = roomColor(room);
                    return (
                      <button
                        key={room}
                        type="button"
                        className={`chip${active ? ' chip--active' : ''}`}
                        style={color ? { borderColor: color, color: active ? undefined : color } : undefined}
                        onClick={() => onRoomChange(i, active ? '' : room)}
                      >
                        {room}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="circuit-editor__fields">
                <input
                  className="field__input"
                  type="text"
                  value={circuit.room}
                  placeholder="Room"
                  aria-label={`Circuit ${i + 1} room`}
                  onChange={(e) => onRoomChange(i, e.target.value)}
                  autoComplete="off"
                />
                <input
                  className="field__input"
                  type="text"
                  list="labels-list"
                  value={circuit.label}
                  placeholder="Label"
                  aria-label={`Circuit ${i + 1} label`}
                  onChange={(e) => onLabelChange(i, e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="sheet__footer">
        <button type="button" className="btn btn--danger" onClick={onRemove}>
          Remove breaker
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
