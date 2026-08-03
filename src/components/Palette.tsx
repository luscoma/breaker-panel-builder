import { useDraggable } from '@dnd-kit/core';
import { useState } from 'react';
import { circuitCount, slotsFor } from '../model/panel';
import { BreakerConfig, CONFIGS, OVERFLOW_CONFIGS, PALETTE_CONFIGS } from '../model/types';

function describe(config: BreakerConfig): string {
  const slots = slotsFor(config);
  const throws = circuitCount(config);
  return `${slots} slot${slots > 1 ? 's' : ''} · ${throws} throw${throws > 1 ? 's' : ''}`;
}

interface PaletteItemProps {
  config: BreakerConfig;
  selected: boolean;
  onSelect: (config: BreakerConfig) => void;
}

function PaletteItem({ config, selected, onSelect }: PaletteItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${config}`,
    data: { kind: 'palette', config },
  });

  const classes = ['palette__item', `palette__item--${config}`];
  if (selected) classes.push('palette__item--selected');
  if (isDragging) classes.push('palette__item--dragging');

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={classes.join(' ')}
      onClick={() => onSelect(config)}
      {...listeners}
      {...attributes}
    >
      <span className="palette__name">{CONFIGS[config].short}</span>
      <span className="palette__meta">{describe(config)}</span>
    </button>
  );
}

interface PaletteProps {
  selectedConfig: BreakerConfig | null;
  onSelectConfig: (config: BreakerConfig) => void;
}

export function Palette({ selectedConfig, onSelectConfig }: PaletteProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const rareSelected = selectedConfig !== null && OVERFLOW_CONFIGS.includes(selectedConfig);

  return (
    <div className="palette">
      <div className="palette__items">
        {PALETTE_CONFIGS.map((config) => (
          <PaletteItem
            key={config}
            config={config}
            selected={selectedConfig === config}
            onSelect={onSelectConfig}
          />
        ))}
        <button
          type="button"
          className={`palette__more-btn${rareSelected ? ' palette__more-btn--selected' : ''}`}
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
        >
          <span className="palette__name">
            {rareSelected ? CONFIGS[selectedConfig].short : 'More'}
          </span>
          <span className="palette__meta">{moreOpen ? 'Hide ▲' : `${OVERFLOW_CONFIGS.length} more ▾`}</span>
        </button>
      </div>

      {moreOpen && (
        <div className="palette__overflow">
          {OVERFLOW_CONFIGS.map((config) => (
            <PaletteItem
              key={config}
              config={config}
              selected={selectedConfig === config}
              onSelect={(c) => {
                onSelectConfig(c);
                setMoreOpen(false);
              }}
            />
          ))}
        </div>
      )}

      <p className="palette__hint">
        {selectedConfig
          ? `Tap an empty slot to place a ${CONFIGS[selectedConfig].short} breaker, or tap it again to cancel.`
          : 'Drag a breaker onto the panel, or tap one then tap an empty slot. Press and hold a placed breaker to move it; tap it to set rooms and labels.'}
      </p>
    </div>
  );
}
