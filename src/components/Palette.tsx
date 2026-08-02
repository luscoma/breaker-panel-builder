import { useDraggable } from '@dnd-kit/core';
import { circuitCount, spacesFor } from '../model/panel';
import { BREAKER_TYPE_LABELS, BreakerType } from '../model/types';

const TYPES: BreakerType[] = ['single', 'tandem', 'double', 'quad'];

function describe(type: BreakerType): string {
  const spaces = spacesFor(type);
  const spaceText = `${spaces} space${spaces > 1 ? 's' : ''}`;
  if (type === 'quad') return `${spaceText} · 2–4 circuits`;
  const circuits = circuitCount(type);
  return `${spaceText} · ${circuits} circuit${circuits > 1 ? 's' : ''}`;
}

interface PaletteItemProps {
  type: BreakerType;
  selected: boolean;
  onSelect: (type: BreakerType) => void;
}

function PaletteItem({ type, selected, onSelect }: PaletteItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${type}`,
    data: { kind: 'palette', breakerType: type },
  });

  const classes = ['palette__item', `palette__item--${type}`];
  if (selected) classes.push('palette__item--selected');
  if (isDragging) classes.push('palette__item--dragging');

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={classes.join(' ')}
      onClick={() => onSelect(type)}
      {...listeners}
      {...attributes}
    >
      <span className="palette__name">{BREAKER_TYPE_LABELS[type]}</span>
      <span className="palette__meta">{describe(type)}</span>
    </button>
  );
}

interface PaletteProps {
  selectedType: BreakerType | null;
  onSelectType: (type: BreakerType) => void;
}

export function Palette({ selectedType, onSelectType }: PaletteProps) {
  return (
    <div className="palette">
      <div className="palette__items">
        {TYPES.map((type) => (
          <PaletteItem
            key={type}
            type={type}
            selected={selectedType === type}
            onSelect={onSelectType}
          />
        ))}
      </div>
      <p className="palette__hint">
        {selectedType
          ? `Tap an empty space to place a ${BREAKER_TYPE_LABELS[selectedType].toLowerCase()} breaker, or tap the breaker again to cancel.`
          : 'Drag a breaker onto the panel, or tap one then tap an empty space. Press and hold a placed breaker to move it.'}
      </p>
    </div>
  );
}
