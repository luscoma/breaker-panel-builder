import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { BreakerBody } from './components/BreakerView';
import { BreakerEditor } from './components/BreakerEditor';
import { Palette } from './components/Palette';
import { PanelGrid } from './components/PanelGrid';
import { copyPngToClipboard, downloadSvg } from './export/png';
import {
  canPlace,
  emptyPanel,
  moveBreaker,
  placeBreaker,
  removeBreaker,
  setLabel,
  setName,
  setQuadConfig,
  summarize,
} from './model/panel';
import { stateFromHash, stateToHash } from './model/serialize';
import { BreakerType, PanelState, QuadConfig, SLOT_COUNT } from './model/types';

type Action =
  | { type: 'place'; breakerType: BreakerType; slot: number }
  | { type: 'move'; id: string; slot: number }
  | { type: 'remove'; id: string }
  | { type: 'label'; id: string; circuit: number; label: string }
  | { type: 'quadConfig'; id: string; quadConfig: QuadConfig }
  | { type: 'name'; name: string }
  | { type: 'load'; state: PanelState }
  | { type: 'clear' };

function reducer(state: PanelState, action: Action): PanelState {
  switch (action.type) {
    case 'place':
      return placeBreaker(state, action.breakerType, action.slot);
    case 'move':
      return moveBreaker(state, action.id, action.slot);
    case 'remove':
      return removeBreaker(state, action.id);
    case 'label':
      return setLabel(state, action.id, action.circuit, action.label);
    case 'quadConfig':
      return setQuadConfig(state, action.id, action.quadConfig);
    case 'name':
      return setName(state, action.name);
    case 'load':
      return action.state;
    case 'clear':
      return { ...emptyPanel(), name: state.name };
  }
}

type ActiveDrag =
  | { kind: 'palette'; breakerType: BreakerType }
  | { kind: 'breaker'; id: string };

function initialState(): PanelState {
  if (typeof window === 'undefined') return emptyPanel();
  return stateFromHash(window.location.hash) ?? emptyPanel();
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [selectedType, setSelectedType] = useState<BreakerType | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const lastHashRef = useRef<string>('');

  const sensors = useSensors(
    // A small drag threshold keeps taps working for select/edit, and the
    // touch delay lets a finger scroll the panel instead of dragging.
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  // Keep the URL in step with the panel so the address bar is always shareable.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const hash = stateToHash(state);
      lastHashRef.current = hash;
      window.history.replaceState(null, '', hash);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [state]);

  // Adopt panels pasted into the address bar, but ignore our own writes.
  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash === lastHashRef.current) return;
      const loaded = stateFromHash(window.location.hash);
      if (loaded) dispatch({ type: 'load', state: loaded });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 2400);
  }, []);

  const validSlots = useMemo(() => {
    const pending = activeDrag ?? (selectedType ? { kind: 'palette' as const, breakerType: selectedType } : null);
    if (!pending) return null;

    const type =
      pending.kind === 'palette'
        ? pending.breakerType
        : state.breakers.find((b) => b.id === pending.id)?.type;
    if (!type) return null;
    const ignoreId = pending.kind === 'breaker' ? pending.id : undefined;

    const valid = new Set<number>();
    for (let slot = 1; slot <= SLOT_COUNT; slot++) {
      if (canPlace(state, type, slot, ignoreId)) valid.add(slot);
    }
    return valid;
  }, [activeDrag, selectedType, state]);

  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as ActiveDrag | undefined;
    if (data?.kind === 'palette' || data?.kind === 'breaker') setActiveDrag(data);
    setSelectedId(null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const drag = event.active.data.current as ActiveDrag | undefined;
    const slot = event.over?.data.current?.slot as number | undefined;
    setActiveDrag(null);
    if (!drag || slot === undefined) return;

    if (drag.kind === 'palette') {
      if (!canPlace(state, drag.breakerType, slot)) {
        showToast('That breaker does not fit there');
        return;
      }
      dispatch({ type: 'place', breakerType: drag.breakerType, slot });
    } else {
      dispatch({ type: 'move', id: drag.id, slot });
    }
  };

  const onSlotTap = (slot: number) => {
    if (!selectedType) return;
    if (!canPlace(state, selectedType, slot)) {
      showToast('That breaker does not fit there');
      return;
    }
    dispatch({ type: 'place', breakerType: selectedType, slot });
  };

  const onCopyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}${stateToHash(state)}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Share link copied');
    } catch {
      showToast('Copy failed — the link is in your address bar');
    }
  };

  const onCopyImage = async () => {
    try {
      const result = await copyPngToClipboard(state);
      showToast(result === 'copied' ? 'PNG copied to clipboard' : 'PNG downloaded');
    } catch {
      showToast('Could not create the PNG');
    }
  };

  const onClear = () => {
    if (state.breakers.length === 0) return;
    if (window.confirm('Remove every breaker from this panel?')) {
      dispatch({ type: 'clear' });
      setSelectedId(null);
    }
  };

  const selected = state.breakers.find((b) => b.id === selectedId) ?? null;
  const stats = summarize(state);
  const activeBreaker =
    activeDrag?.kind === 'breaker'
      ? state.breakers.find((b) => b.id === activeDrag.id) ?? null
      : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
      <div className="app">
        <header className="topbar">
          <input
            className="topbar__name"
            value={state.name}
            onChange={(e) => dispatch({ type: 'name', name: e.target.value })}
            aria-label="Panel name"
            placeholder="Panel name"
          />
          <div className="topbar__actions">
            <button type="button" className="btn" onClick={onCopyLink}>
              Copy link
            </button>
            <button type="button" className="btn" onClick={onCopyImage}>
              Copy PNG
            </button>
            <button type="button" className="btn" onClick={() => downloadSvg(state)}>
              SVG
            </button>
            <button type="button" className="btn btn--ghost" onClick={onClear}>
              Clear
            </button>
          </div>
        </header>

        <div className="stats">
          <span>
            <strong>{stats.breakers}</strong> breakers
          </span>
          <span>
            <strong>{stats.circuits}</strong> circuits
          </span>
          <span>
            <strong>{stats.monitoredCircuits}</strong> individually monitored
          </span>
          <span>
            <strong>{stats.usedSpaces}</strong>/{SLOT_COUNT} spaces
          </span>
        </div>

        <Palette
          selectedType={selectedType}
          onSelectType={(type) => setSelectedType((current) => (current === type ? null : type))}
        />

        <PanelGrid
          state={state}
          selectedId={selectedId}
          validSlots={validSlots}
          onSlotTap={onSlotTap}
          onBreakerSelect={(id) => setSelectedId((current) => (current === id ? null : id))}
        />

        {selected && (
          <BreakerEditor
            breaker={selected}
            onLabelChange={(circuit, label) =>
              dispatch({ type: 'label', id: selected.id, circuit, label })
            }
            onQuadConfigChange={(quadConfig) =>
              dispatch({ type: 'quadConfig', id: selected.id, quadConfig })
            }
            onRemove={() => {
              dispatch({ type: 'remove', id: selected.id });
              setSelectedId(null);
            }}
            onClose={() => setSelectedId(null)}
          />
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag?.kind === 'palette' && (
          <div className={`breaker breaker--${activeDrag.breakerType} breaker--overlay`}>
            <BreakerBody
              breaker={{
                id: 'preview',
                type: activeDrag.breakerType,
                slot: 1,
                labels: [],
              }}
              compact
            />
          </div>
        )}
        {activeBreaker && (
          <div className={`breaker breaker--${activeBreaker.type} breaker--overlay`}>
            <BreakerBody breaker={activeBreaker} compact />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
