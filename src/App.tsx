import {
  CollisionDetection,
  DndContext,
  DragEndEvent,
  DragMoveEvent,
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
import { FileMenu } from './components/FileMenu';
import { Palette } from './components/Palette';
import { PanelGrid } from './components/PanelGrid';
import { RoomsSheet } from './components/RoomsSheet';
import { STAGING_DROPPABLE_ID, StagingBar } from './components/StagingBar';
import { copyPngToClipboard, downloadSvg } from './export/png';
import { downloadPanelJson } from './export/json';
import { parsePanelFile } from './model/panelFile';
import {
  addRoom,
  canPlace,
  commitCircuitRoom,
  emptyPanel,
  knownLabels,
  moveBreaker,
  placeBreaker,
  placeFromStaging,
  removeBreaker,
  removeFromStaging,
  removeRoom,
  renameRoom,
  roomColor,
  roomUsage,
  setCircuitLabel,
  setCircuitRoom,
  setConfig,
  setName,
  slotsFor,
  stageBreaker,
  stageNewBreaker,
  summarize,
} from './model/panel';
import { hashHasPanel, stateFromHash, stateToHash } from './model/serialize';
import { BreakerConfig, MAX_STAGING, PanelState, SLOT_COUNT } from './model/types';

type Action =
  | { type: 'place'; config: BreakerConfig; slot: number }
  | { type: 'move'; id: string; slot: number }
  | { type: 'remove'; id: string }
  | { type: 'stage'; id: string }
  | { type: 'stageNew'; config: BreakerConfig }
  | { type: 'unstage'; id: string; slot: number }
  | { type: 'discardStaged'; id: string }
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
    case 'stage':
      return stageBreaker(state, action.id);
    case 'stageNew':
      return stageNewBreaker(state, action.config);
    case 'unstage':
      return placeFromStaging(state, action.id, action.slot);
    case 'discardStaged':
      return removeFromStaging(state, action.id);
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

type ActiveDrag =
  | { kind: 'palette'; config: BreakerConfig }
  | { kind: 'breaker'; id: string }
  | { kind: 'staged'; id: string };

/**
 * Whatever the pointer is over *on screen* wins.
 *
 * The staging bar is a fixed overlay along the bottom edge, so panel rows
 * scroll underneath it. pointerWithin reports both the bar and the slot hidden
 * behind it, then ranks by distance to centre — which a 145x40 slot always wins
 * against a 390x92 bar. Left to itself that drops the breaker into a slot the
 * bar is covering, where it is genuinely invisible: elementFromPoint at the
 * breaker's own centre returns the staging bar.
 *
 * The bar's own rect is read live rather than taken from dnd-kit's measurement,
 * which is captured once at drag start and offset by page scroll — an
 * adjustment that is wrong for a fixed element that does not scroll.
 */
function detectCollisions(stagingRect: () => DOMRect | null): CollisionDetection {
  return (args) => {
    const pointer = args.pointerCoordinates;
    const bar = pointer && stagingRect();
    if (
      pointer &&
      bar &&
      pointer.x >= bar.left &&
      pointer.x <= bar.right &&
      pointer.y >= bar.top &&
      pointer.y <= bar.bottom
    ) {
      const staging = args.droppableContainers.find((c) => c.id === STAGING_DROPPABLE_ID);
      if (staging) return [{ id: staging.id }];
    }
    return pointerWithin(args);
  };
}

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
  // A staged breaker picked up by tap, waiting for a slot to land in. It and
  // selectedConfig are mutually exclusive: only one thing is ever in hand.
  const [armedStagedId, setArmedStagedId] = useState<string | null>(null);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  // Whether the pointer is over staging. A ref, not state: nothing renders from
  // it, and auto-scroll has to see the change without waiting for a render.
  const overStagingRef = useRef(false);
  const [toast, setToast] = useState<string | null>(null);
  const lastHashRef = useRef<string>('');

  // The staging bar's live rect, so collision detection can prefer it over any
  // slot it happens to be covering.
  const stagingRef = useRef<HTMLDivElement | null>(null);
  const collisionDetection = useMemo(
    () => detectCollisions(() => stagingRef.current?.getBoundingClientRect() ?? null),
    [],
  );

  /**
   * Auto-scroll and the staging bar both want the bottom of the viewport, so
   * they are split by target rather than by distance: scrolling runs everywhere
   * except over staging. Without that, lifting a staged breaker — pointer
   * already deep in the scroll band — ran the panel out from under the drag.
   *
   * The band is widened past dnd-kit's 20% default so a comfortable strip of it
   * still sits above the 92px bar: at 780px tall that is ~140px to hold the
   * pointer in when the goal really is to reach a lower slot.
   *
   * The check goes through canScroll rather than `enabled` because dnd-kit
   * re-runs the auto-scroll effect on every pointer move and calls canScroll
   * there — so a ref-backed answer takes effect a whole render earlier than a
   * state-backed one, which is the difference between crossing into the bar
   * cleanly and the panel lurching a row first.
   */
  const autoScroll = useMemo(
    () => ({ threshold: { x: 0, y: 0.3 }, canScroll: () => !overStagingRef.current }),
    [],
  );

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
        setArmedStagedId(null);
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

  /** The arrangement a pending action would place, whatever it came from. */
  const configOf = useCallback(
    (pending: ActiveDrag): BreakerConfig | undefined => {
      if (pending.kind === 'palette') return pending.config;
      const from = pending.kind === 'staged' ? state.staging : state.breakers;
      return from.find((b) => b.id === pending.id)?.config;
    },
    [state],
  );

  const validSlots = useMemo(() => {
    const armed: ActiveDrag | null = selectedConfig
      ? { kind: 'palette', config: selectedConfig }
      : armedStagedId
        ? { kind: 'staged', id: armedStagedId }
        : null;
    const pending = activeDrag ?? armed;
    if (!pending) return null;

    const config = configOf(pending);
    if (!config) return null;
    // Only a breaker already on the panel needs excluding from the collision
    // check — a staged one occupies no slots to begin with.
    const ignoreId = pending.kind === 'breaker' ? pending.id : undefined;

    const valid = new Set<number>();
    for (let slot = 1; slot <= SLOT_COUNT; slot++) {
      if (canPlace(state, config, slot, ignoreId)) valid.add(slot);
    }
    return valid;
  }, [activeDrag, armedStagedId, configOf, selectedConfig, state]);

  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as ActiveDrag | undefined;
    if (data?.kind === 'palette' || data?.kind === 'breaker' || data?.kind === 'staged') {
      setActiveDrag(data);
    }
    // Lifting a staged breaker starts with the pointer already inside the bar,
    // and no move event has fired yet — seed it, or the panel bolts downward
    // the instant the drag begins.
    overStagingRef.current = data?.kind === 'staged';
    setSelectedId(null);
    setArmedStagedId(null);
  };

  const onDragMove = (event: DragMoveEvent) => {
    overStagingRef.current = event.over?.id === STAGING_DROPPABLE_ID;
  };

  const endDrag = () => {
    setActiveDrag(null);
    overStagingRef.current = false;
  };

  const onDragEnd = (event: DragEndEvent) => {
    const drag = event.active.data.current as ActiveDrag | undefined;
    const droppedOnStaging = event.over?.id === STAGING_DROPPABLE_ID;
    const slot = event.over?.data.current?.slot as number | undefined;
    endDrag();
    if (!drag) return;

    if (droppedOnStaging) {
      // Dropping a staged breaker back on the bar it came from is a no-op, not
      // a duplicate.
      if (drag.kind === 'staged') return;
      if (state.staging.length >= MAX_STAGING) {
        showToast('Staging is full');
        return;
      }
      if (drag.kind === 'palette') dispatch({ type: 'stageNew', config: drag.config });
      else dispatch({ type: 'stage', id: drag.id });
      return;
    }

    if (slot === undefined) return;
    const config = configOf(drag);
    if (!config) return;
    const ignoreId = drag.kind === 'breaker' ? drag.id : undefined;
    if (!canPlace(state, config, slot, ignoreId)) {
      showToast('That breaker does not fit there');
      return;
    }

    if (drag.kind === 'palette') dispatch({ type: 'place', config, slot });
    else if (drag.kind === 'staged') dispatch({ type: 'unstage', id: drag.id, slot });
    else dispatch({ type: 'move', id: drag.id, slot });
  };

  const onSlotTap = (slot: number) => {
    // A staged breaker in hand wins: it is the more deliberate of the two, and
    // arming one already cleared the palette selection.
    if (armedStagedId) {
      const staged = state.staging.find((b) => b.id === armedStagedId);
      if (!staged) {
        setArmedStagedId(null);
        return;
      }
      if (!canPlace(state, staged.config, slot)) {
        showToast('That breaker does not fit there');
        return;
      }
      dispatch({ type: 'unstage', id: armedStagedId, slot });
      setArmedStagedId(null);
      return;
    }
    if (!selectedConfig) return;
    if (!canPlace(state, selectedConfig, slot)) {
      showToast('That breaker does not fit there');
      return;
    }
    dispatch({ type: 'place', config: selectedConfig, slot });
  };

  const onStageSelected = (id: string) => {
    if (state.staging.length >= MAX_STAGING) {
      showToast('Staging is full — place or discard one first');
      return;
    }
    dispatch({ type: 'stage', id });
    setSelectedId(null);
    showToast('Moved to staging');
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reading a file yields, and the user can keep working while it does. The
  // handler's captured `state` is a snapshot from before the read, so the
  // "is there anything to lose?" question has to be asked of the live panel.
  const stateRef = useRef(state);
  stateRef.current = state;

  const onImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset first so picking the same file twice in a row still fires onChange.
    event.target.value = '';
    if (!file) return;

    let result;
    try {
      result = parsePanelFile(await file.text());
    } catch {
      showToast('That file could not be read');
      return;
    }
    if (!result.ok) {
      showToast(result.reason);
      return;
    }

    // A name typed or rooms set up before any breaker is placed is still work
    // worth protecting, so the prompt is not gated on breakers alone.
    const current = stateRef.current;
    const hasWork =
      current.breakers.length > 0 ||
      current.staging.length > 0 ||
      current.rooms.length > 0 ||
      current.name !== emptyPanel().name;
    if (hasWork && !window.confirm('Replace the current panel with the imported one?')) {
      return;
    }

    // The imported breakers are unrelated to whatever was selected, so drop the
    // selection rather than let the editor rebind to a stranger.
    setSelectedId(null);
    setArmedStagedId(null);
    setRoomsOpen(false);
    dispatch({ type: 'load', state: result.state });

    const placed = result.state.breakers.length;
    const staged = result.state.staging.length;
    const count = `${placed} breaker${placed === 1 ? '' : 's'}`;
    const withStaging = staged > 0 ? `${count} and ${staged} in staging` : count;
    showToast(
      result.dropped > 0
        ? `Imported ${withStaging}, skipped ${result.dropped} that did not fit`
        : `Imported ${withStaging}`,
    );
  };

  const onClear = () => {
    if (state.breakers.length === 0 && state.staging.length === 0) return;
    const question =
      state.staging.length > 0
        ? 'Remove every breaker from this panel and from staging?'
        : 'Remove every breaker from this panel?';
    if (window.confirm(question)) {
      dispatch({ type: 'clear' });
      setSelectedId(null);
      setArmedStagedId(null);
    }
  };

  const selected = state.breakers.find((b) => b.id === selectedId) ?? null;
  const stats = summarize(state);
  const activeBreaker =
    activeDrag?.kind === 'breaker'
      ? state.breakers.find((b) => b.id === activeDrag.id) ?? null
      : activeDrag?.kind === 'staged'
        ? state.staging.find((b) => b.id === activeDrag.id) ?? null
        : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      autoScroll={autoScroll}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={endDrag}
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
            <FileMenu
              onCopyPng={onCopyImage}
              onDownloadSvg={() => downloadSvg(state)}
              onExportJson={() => downloadPanelJson(state)}
              onImportJson={() => fileInputRef.current?.click()}
            />
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
          {stats.staged > 0 && (
            <span>
              <strong>{stats.staged}</strong> staged
            </span>
          )}
        </div>

        <Palette
          selectedConfig={selectedConfig}
          onSelectConfig={(config) => {
            // Only one breaker is ever in hand, so picking from the palette
            // puts down whatever was taken out of staging.
            setArmedStagedId(null);
            setSelectedConfig((current) => (current === config ? null : config));
          }}
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
            onStage={() => onStageSelected(selected.id)}
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

        <StagingBar
          barRef={stagingRef}
          staging={state.staging}
          armedId={armedStagedId}
          dragging={activeDrag !== null}
          roomColor={colorForRoom}
          onArm={(id) => {
            setSelectedConfig(null);
            setSelectedId(null);
            setArmedStagedId((current) => (current === id ? null : id));
          }}
          onDiscard={(id) => {
            setArmedStagedId((current) => (current === id ? null : current));
            dispatch({ type: 'discardStaged', id });
          }}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={onImportFile}
        />

        {toast && <div className="toast">{toast}</div>}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag?.kind === 'palette' && (
          <div
            className={`breaker breaker--${activeDrag.config} breaker--overlay`}
            style={{ '--overlay-slots': slotsFor(activeDrag.config) } as CSSProperties}
          >
            <BreakerBody
              breaker={{ id: 'preview', config: activeDrag.config, circuits: [] }}
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
