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
import { CSSProperties, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { BreakerBody } from './components/BreakerView';
import { BreakerEditor } from './components/BreakerEditor';
import { Palette } from './components/Palette';
import { PanelGrid } from './components/PanelGrid';
import { RoomsSheet } from './components/RoomsSheet';
import { copyPngToClipboard, downloadSvg } from './export/png';
import {
  addRoom,
  canPlace,
  commitCircuitRoom,
  emptyPanel,
  knownLabels,
  moveBreaker,
  placeBreaker,
  removeBreaker,
  removeRoom,
  renameRoom,
  roomColor,
  roomUsage,
  setCircuitLabel,
  setCircuitRoom,
  setConfig,
  setName,
  slotsFor,
  summarize,
} from './model/panel';
import { hashHasPanel, stateFromHash, stateToHash } from './model/serialize';
import { BreakerConfig, PanelState, SLOT_COUNT } from './model/types';

type Action =
  | { type: 'place'; config: BreakerConfig; slot: number }
  | { type: 'move'; id: string; slot: number }
  | { type: 'remove'; id: string }
  | { type: 'config'; id: string; config: BreakerConfig }
  | { type: 'room'; id: string; circuit: number; room: string }
  | { type: 'commitRoom'; id: string; circuit: number; room: string }
  | { type: 'label'; id: string; circuit: number; label: string }
  | { type: 'addRoom'; room: string }
  | { type: 'renameRoom'; from: string; to: string }
  | { type: 'removeRoom'; room: string }
  | { type: 'name'; name: string }
  | { type: 'load'; state: PanelState }
  | { type: 'clear' };

function reducer(state: PanelState, action: Action): PanelState {
  switch (action.type) {
    case 'place':
      return placeBreaker(state, action.config, action.slot);
    case 'move':
      return moveBreaker(state, action.id, action.slot);
    case 'remove':
      return removeBreaker(state, action.id);
    case 'config':
      return setConfig(state, action.id, action.config);
    case 'room':
      return setCircuitRoom(state, action.id, action.circuit, action.room);
    case 'commitRoom':
      return commitCircuitRoom(state, action.id, action.circuit, action.room);
    case 'label':
      return setCircuitLabel(state, action.id, action.circuit, action.label);
    case 'addRoom':
      return addRoom(state, action.room);
    case 'renameRoom':
      return renameRoom(state, action.from, action.to);
    case 'removeRoom':
      return removeRoom(state, action.room);
    case 'name':
      return setName(state, action.name);
    case 'load':
      return action.state;
    case 'clear':
      return { ...emptyPanel(), name: state.name, rooms: state.rooms };
  }
}

type ActiveDrag = { kind: 'palette'; config: BreakerConfig } | { kind: 'breaker'; id: string };

const REJECTED_LINK = 'That link could not be read — starting a new panel';

/**
 * Read the panel out of the address bar once, remembering whether a link was
 * present but unreadable so the app can say so instead of silently starting over.
 */
function readInitialHash(): { state: PanelState; rejected: boolean } {
  if (typeof window === 'undefined') return { state: emptyPanel(), rejected: false };
  const hash = window.location.hash;
  const loaded = stateFromHash(hash);
  if (loaded) return { state: loaded, rejected: false };
  return { state: emptyPanel(), rejected: hashHasPanel(hash) };
}

export default function App() {
  const [initial] = useState(readInitialHash);
  const [state, dispatch] = useReducer(reducer, initial.state);
  const [selectedConfig, setSelectedConfig] = useState<BreakerConfig | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const lastHashRef = useRef<string>('');

  const sensors = useSensors(
    // A small drag threshold keeps taps working for select/edit, and the
    // touch delay lets a finger scroll the panel instead of dragging.
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const toastTimer = useRef<number | undefined>(undefined);
  const showToast = useCallback((message: string) => {
    // One timer, cleared on each call: two identical messages in a row would
    // otherwise have the first one's timer dismiss the second early.
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

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
      if (loaded) {
        // The incoming panel's breakers are unrelated to whatever was selected,
        // so drop the selection rather than let the editor rebind to a stranger.
        setSelectedId(null);
        setRoomsOpen(false);
        dispatch({ type: 'load', state: loaded });
        return;
      }
      if (hashHasPanel(window.location.hash)) showToast(REJECTED_LINK);
      // Nothing dispatched means the sync effect won't run, so put the panel's
      // own link back rather than leaving an unreadable one on screen.
      window.history.replaceState(null, '', lastHashRef.current || window.location.pathname);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [showToast]);

  // A link that arrived unreadable is cleared out rather than left in the bar.
  useEffect(() => {
    if (!initial.rejected) return;
    showToast(REJECTED_LINK);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, [initial.rejected, showToast]);

  const colorForRoom = useCallback((room: string) => roomColor(state, room), [state]);
  const labels = useMemo(() => knownLabels(state), [state]);

  const validSlots = useMemo(() => {
    const pending =
      activeDrag ?? (selectedConfig ? { kind: 'palette' as const, config: selectedConfig } : null);
    if (!pending) return null;

    const config =
      pending.kind === 'palette'
        ? pending.config
        : state.breakers.find((b) => b.id === pending.id)?.config;
    if (!config) return null;
    const ignoreId = pending.kind === 'breaker' ? pending.id : undefined;

    const valid = new Set<number>();
    for (let slot = 1; slot <= SLOT_COUNT; slot++) {
      if (canPlace(state, config, slot, ignoreId)) valid.add(slot);
    }
    return valid;
  }, [activeDrag, selectedConfig, state]);

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
      if (!canPlace(state, drag.config, slot)) {
        showToast('That breaker does not fit there');
        return;
      }
      dispatch({ type: 'place', config: drag.config, slot });
    } else {
      const breaker = state.breakers.find((b) => b.id === drag.id);
      if (breaker && !canPlace(state, breaker.config, slot, breaker.id)) {
        showToast('That breaker does not fit there');
        return;
      }
      dispatch({ type: 'move', id: drag.id, slot });
    }
  };

  const onSlotTap = (slot: number) => {
    if (!selectedConfig) return;
    if (!canPlace(state, selectedConfig, slot)) {
      showToast('That breaker does not fit there');
      return;
    }
    dispatch({ type: 'place', config: selectedConfig, slot });
  };

  const onCopyLink = async () => {
    const { origin, pathname, search } = window.location;
    const url = `${origin}${pathname}${search}${stateToHash(state)}`;
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
            <button type="button" className="btn" onClick={() => setRoomsOpen(true)}>
              Rooms
            </button>
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
            <strong>{stats.usedSlots}</strong>/{SLOT_COUNT} slots
          </span>
          <span className="stats__legend">
            <span className="spine__num spine__num--shared" aria-hidden="true">
              7
            </span>
            marked slots share a monitoring channel
          </span>
        </div>

        <Palette
          selectedConfig={selectedConfig}
          onSelectConfig={(config) =>
            setSelectedConfig((current) => (current === config ? null : config))
          }
        />

        <PanelGrid
          state={state}
          selectedId={selectedId}
          validSlots={validSlots}
          roomColor={colorForRoom}
          onSlotTap={onSlotTap}
          onBreakerSelect={(id) => setSelectedId((current) => (current === id ? null : id))}
          onExplainSlot={(slot) =>
            showToast(`Slot ${slot} shares a monitoring channel — its breaker puts more than one circuit on it`)
          }
        />

        {selected && !roomsOpen && (
          <BreakerEditor
            breaker={selected}
            rooms={state.rooms}
            labels={labels}
            roomColor={colorForRoom}
            canUseConfig={(config) => canPlace(state, config, selected.slot, selected.id)}
            onConfigChange={(config) => {
              if (!canPlace(state, config, selected.slot, selected.id)) {
                showToast('Not enough room in the panel for that breaker');
                return;
              }
              dispatch({ type: 'config', id: selected.id, config });
            }}
            onRoomChange={(circuit, room) =>
              dispatch({ type: 'room', id: selected.id, circuit, room })
            }
            onRoomCommit={(circuit, room) =>
              dispatch({ type: 'commitRoom', id: selected.id, circuit, room })
            }
            onLabelChange={(circuit, label) =>
              dispatch({ type: 'label', id: selected.id, circuit, label })
            }
            onRemove={() => {
              dispatch({ type: 'remove', id: selected.id });
              setSelectedId(null);
            }}
            onClose={() => setSelectedId(null)}
          />
        )}

        {roomsOpen && (
          <RoomsSheet
            rooms={state.rooms}
            usage={(room) => roomUsage(state, room)}
            roomColor={colorForRoom}
            onAdd={(room) => dispatch({ type: 'addRoom', room })}
            onRename={(from, to) => dispatch({ type: 'renameRoom', from, to })}
            onRemove={(room) => dispatch({ type: 'removeRoom', room })}
            onClose={() => setRoomsOpen(false)}
          />
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag?.kind === 'palette' && (
          <div
            className={`breaker breaker--${activeDrag.config} breaker--overlay`}
            style={{ '--overlay-slots': slotsFor(activeDrag.config) } as CSSProperties}
          >
            <BreakerBody
              breaker={{ id: 'preview', config: activeDrag.config, slot: 1, circuits: [] }}
              roomColor={colorForRoom}
              compact
            />
          </div>
        )}
        {activeBreaker && (
          <div
            className={`breaker breaker--${activeBreaker.config} breaker--overlay`}
            style={{ '--overlay-slots': slotsFor(activeBreaker.config) } as CSSProperties}
          >
            <BreakerBody breaker={activeBreaker} roomColor={colorForRoom} compact />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
