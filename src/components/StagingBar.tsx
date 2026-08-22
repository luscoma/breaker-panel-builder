import { useDraggable, useDroppable } from '@dnd-kit/core';
import { BreakerBody } from './BreakerView';
import { CONFIGS, MAX_STAGING, StagedBreaker } from '../model/types';

/** The droppable's id, shared with the drag handler in App. */
export const STAGING_DROPPABLE_ID = 'staging';

interface StagedItemProps {
  breaker: StagedBreaker;
  armed: boolean;
  roomColor: (room: string) => string | null;
  onArm: (id: string) => void;
  onDiscard: (id: string) => void;
}

/**
 * One breaker waiting in staging, drawn with the same face it has on the panel
 * so it is recognisable at a glance. Draggable back onto a slot, or armed by a
 * tap — the same "pick it up, then tap a slot" gesture the palette uses.
 */
function StagedItem({ breaker, armed, roomColor, onArm, onDiscard }: StagedItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `staged-${breaker.id}`,
    data: { kind: 'staged', id: breaker.id },
  });

  const classes = ['staged'];
  if (armed) classes.push('staged--armed');
  if (isDragging) classes.push('staged--dragging');
  const name = CONFIGS[breaker.config].short;

  return (
    <div className={classes.join(' ')}>
      <div
        ref={setNodeRef}
        className="staged__grip"
        {...listeners}
        {...attributes}
        role="button"
        tabIndex={0}
        aria-pressed={armed}
        aria-label={`Staged ${name} breaker`}
        onClick={() => onArm(breaker.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onArm(breaker.id);
          }
        }}
      >
        <span className="staged__name">{name}</span>
        <div className={`breaker breaker--${breaker.config} staged__face`}>
          <BreakerBody breaker={breaker} roomColor={roomColor} compact />
        </div>
      </div>
      <button
        type="button"
        className="staged__discard"
        aria-label={`Discard staged ${name} breaker`}
        title="Discard this breaker"
        // The drag listeners sit on the sibling, but a press that reaches them
        // through bubbling would start a drag instead of a click. Stopping it
        // here keeps ✕ a button rather than a very small drag handle.
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onDiscard(breaker.id);
        }}
      >
        ✕
      </button>
    </div>
  );
}

interface StagingBarProps {
  staging: StagedBreaker[];
  /** The staged breaker waiting for a slot tap, if any. */
  armedId: string | null;
  /** True while any breaker is being dragged, so the bar can offer itself. */
  dragging: boolean;
  roomColor: (room: string) => string | null;
  onArm: (id: string) => void;
  onDiscard: (id: string) => void;
}

/**
 * Breakers set aside while the layout is rearranged, pinned to the bottom edge
 * on every screen size.
 *
 * The bar's height never changes — not when it fills, not when a drag starts.
 * dnd-kit measures droppables once per drag, so a target that grew as the drag
 * began would be measured at one size and hit-tested at another.
 */
export function StagingBar({
  staging,
  armedId,
  dragging,
  roomColor,
  onArm,
  onDiscard,
}: StagingBarProps) {
  const { setNodeRef, isOver } = useDroppable({ id: STAGING_DROPPABLE_ID });
  const full = staging.length >= MAX_STAGING;

  const classes = ['staging'];
  if (dragging) classes.push('staging--target');
  if (isOver) classes.push('staging--over');
  if (full) classes.push('staging--full');

  return (
    <div ref={setNodeRef} className={classes.join(' ')} aria-label="Staging area">
      <div className="staging__head">
        <span className="staging__title">Staging</span>
        <span className="staging__count">{staging.length}</span>
        {armedId && <span className="staging__hint">Tap an empty slot to place it</span>}
        {full && !armedId && <span className="staging__hint">Full</span>}
      </div>

      {staging.length === 0 ? (
        <p className="staging__empty">
          {dragging
            ? 'Drop here to set this breaker aside'
            : 'Drag a breaker here to set it aside while you rearrange'}
        </p>
      ) : (
        <div className="staging__items">
          {staging.map((breaker) => (
            <StagedItem
              key={breaker.id}
              breaker={breaker}
              armed={breaker.id === armedId}
              roomColor={roomColor}
              onArm={onArm}
              onDiscard={onDiscard}
            />
          ))}
        </div>
      )}
    </div>
  );
}
