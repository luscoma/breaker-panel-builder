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

  return (
    <div
      ref={setNodeRef}
      className={classes.join(' ')}
      style={{ gridColumn: column, gridRow: row }}
      onClick={() => onTap(slot)}
      role="button"
      tabIndex={-1}
      aria-label={`Panel space ${slot}`}
    />
  );
}
