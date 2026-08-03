import { useDroppable } from '@dnd-kit/core';

interface SlotProps {
  slot: number;
  column: number;
  row: number;
  occupied: boolean;
  /** null when nothing is being dragged; otherwise whether a drop lands here. */
  valid: boolean | null;
  onTap: (slot: number) => void;
}

export function Slot({ slot, column, row, occupied, valid, onTap }: SlotProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${slot}`, data: { slot } });

  const classes = ['slot'];
  if (occupied) classes.push('slot--occupied');
  if (valid === true) classes.push('slot--valid');
  if (valid === false) classes.push('slot--invalid');
  if (isOver && valid !== false) classes.push('slot--over');

  // A slot is only actionable while a breaker is selected or being dragged, so
  // it only enters the tab order then — otherwise it would add 48 dead stops.
  const actionable = valid !== null;

  return (
    <div
      ref={setNodeRef}
      className={classes.join(' ')}
      style={{ gridColumn: column, gridRow: row }}
      onClick={() => onTap(slot)}
      onKeyDown={(e) => {
        if (!actionable) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap(slot);
        }
      }}
      role="button"
      tabIndex={actionable ? 0 : -1}
      aria-label={`Panel slot ${slot}`}
    />
  );
}
