import { circuitsFor, isIndividuallyMonitored, occupiedSlots } from '../model/panel';
import {
  BREAKER_TYPE_LABELS,
  Breaker,
  QUAD_CONFIG_LABELS,
  QuadConfig,
} from '../model/types';

const QUAD_CONFIGS: QuadConfig[] = ['four-120', 'two-240', '240-plus-two-120'];

interface BreakerEditorProps {
  breaker: Breaker;
  onLabelChange: (circuit: number, label: string) => void;
  onQuadConfigChange: (quadConfig: QuadConfig) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function BreakerEditor({
  breaker,
  onLabelChange,
  onQuadConfigChange,
  onRemove,
  onClose,
}: BreakerEditorProps) {
  const circuits = circuitsFor(breaker.type, breaker.quadConfig);
  const spaces = occupiedSlots(breaker);
  const monitored = isIndividuallyMonitored(breaker.type);

  return (
    <div className="sheet" role="dialog" aria-label="Edit breaker">
      <div className="sheet__header">
        <div>
          <h2 className="sheet__title">{BREAKER_TYPE_LABELS[breaker.type]}</h2>
          <p className="sheet__subtitle">
            Space{spaces.length > 1 ? 's' : ''} {spaces.join(' & ')}
            {monitored ? ' · individually monitored' : ' · shares a monitoring channel'}
          </p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      {breaker.type === 'quad' && (
        <div className="sheet__section">
          <label className="field__label" htmlFor="quad-config">
            Configuration
          </label>
          <select
            id="quad-config"
            className="field__input"
            value={breaker.quadConfig ?? 'two-240'}
            onChange={(e) => onQuadConfigChange(e.target.value as QuadConfig)}
          >
            {QUAD_CONFIGS.map((config) => (
              <option key={config} value={config}>
                {QUAD_CONFIG_LABELS[config]}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="sheet__section">
        {circuits.map((circuit, i) => (
          <div className="field" key={i}>
            <label className="field__label" htmlFor={`label-${breaker.id}-${i}`}>
              Circuit {i + 1}
              <span className={`tag tag--${circuit.voltage}`}>
                {circuit.voltage}V {circuit.poles === 2 ? '2-pole' : '1-pole'}
              </span>
            </label>
            <input
              id={`label-${breaker.id}-${i}`}
              className="field__input"
              type="text"
              value={breaker.labels[i] ?? ''}
              placeholder="e.g. Kitchen receptacles"
              onChange={(e) => onLabelChange(i, e.target.value)}
              autoComplete="off"
            />
          </div>
        ))}
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
