import {
  DEFAULT_ROUND_FRAMES,
  DEFAULT_STAGE,
  SELECTABLE_FIGHTERS,
  type ClientMsg,
  type IceServer,
  type MatchConfig,
  type PlayerInfo,
  type RoomPhase,
  type ServerMsg,
} from '@neonfist/shared';

/**
 * Platform-independent room logic (PLAN §4.7). The Cloudflare Durable Object and the Node dev
 * server are thin adapters around this class, so both behave identically and it's unit-testable.
 */

export type Slot = 0 | 1;

export interface PlayerSlot {
  clientId: string;
  name: string;
  fighter: string | null;
  ready: boolean;
  connected: boolean;
  loaded: boolean;
  rematch: boolean;
  viewMirrored: boolean;
}

export interface RoomState {
  code: string;
  created: number;
  phase: RoomPhase;
  simVersion: string | null;
  roundsToWin: 2 | 3;
  players: [PlayerSlot | null, PlayerSlot | null];
  config: MatchConfig | null;
  relay: boolean;
  lastActivity: number;
}

export interface RoomIO {
  send(slot: Slot, msg: ServerMsg): void;
  sendBinary(slot: Slot, data: ArrayBuffer): void;
  /** Close every connection of this slot (e.g. a stale socket after a reconnect). */
  closeSlot(slot: Slot, code: number, reason: string): void;
  getIceServers(): Promise<IceServer[]>;
  /** Random uint32 (match seeds). */
  randomUint32(): number;
  now(): number;
}

export function newRoomState(code: string, now: number): RoomState {
  return {
    code,
    created: now,
    phase: 'waiting',
    simVersion: null,
    roundsToWin: 2,
    players: [null, null],
    config: null,
    relay: false,
    lastActivity: now,
  };
}

export type HelloResult = { ok: true; slot: Slot; reconnected: boolean } | { ok: false };

export class RoomLogic {
  constructor(
    public state: RoomState,
    private io: RoomIO,
  ) {}

  get connectedCount(): number {
    return this.state.players.filter((p) => p?.connected).length;
  }

  /** A connection introduces itself. Returns the slot it gets, or fails (an error was sent). */
  hello(msg: Extract<ClientMsg, { t: 'hello' }>, reply: (m: ServerMsg) => void): HelloResult {
    const st = this.state;
    this.touch();
    if (st.simVersion && msg.simVersion !== st.simVersion) {
      reply({
        t: 'error',
        code: 'VERSION_MISMATCH',
        message: 'Your friend is on a different version of the game. Refresh the page.',
      });
      return { ok: false };
    }
    const existing = st.players.findIndex((p) => p?.clientId === msg.clientId);
    const reconnected = existing >= 0;
    let slot: Slot;
    if (reconnected) {
      slot = existing as Slot;
      const p = st.players[slot]!;
      p.connected = true;
      p.name = msg.name;
    } else {
      const free = st.players.findIndex((p) => p === null);
      if (free < 0) {
        reply({ t: 'error', code: 'ROOM_FULL', message: 'This room already has two players.' });
        return { ok: false };
      }
      slot = free as Slot;
      st.players[slot] = {
        clientId: msg.clientId,
        name: msg.name,
        fighter: null,
        ready: false,
        connected: true,
        loaded: false,
        rematch: false,
        viewMirrored: false,
      };
    }
    st.simVersion ??= msg.simVersion;
    if (st.phase === 'waiting' && st.players[0] && st.players[1]) st.phase = 'select';
    return { ok: true, slot, reconnected };
  }

  /** After the adapter has bound the connection to its slot: tell everyone. */
  welcome(slot: Slot, reconnected: boolean): void {
    const st = this.state;
    this.broadcastRoom();
    if (reconnected && st.config && (st.phase === 'loading' || st.phase === 'match')) {
      this.io.send(slot, { t: 'config', config: st.config });
      if (st.relay) this.io.send(slot, { t: 'relay', on: true });
    }
  }

  async sendIce(slot: Slot): Promise<void> {
    this.io.send(slot, { t: 'ice', iceServers: await this.io.getIceServers() });
  }

  message(slot: Slot, msg: ClientMsg): void {
    const st = this.state;
    const me = st.players[slot];
    if (!me) return;
    this.touch();
    const other = (slot === 0 ? 1 : 0) as Slot;

    switch (msg.t) {
      case 'hello':
        return; // handled by hello()
      case 'ping':
        this.io.send(slot, { t: 'pong' });
        return;
      case 'select':
        if (st.phase !== 'select') return this.badState(slot, 'not selecting');
        if (!(SELECTABLE_FIGHTERS as readonly string[]).includes(msg.fighter)) {
          return this.io.send(slot, { t: 'error', code: 'BAD_MESSAGE', message: 'Unknown fighter' });
        }
        me.fighter = msg.fighter;
        me.ready = false;
        this.broadcastRoom();
        return;
      case 'ready':
        if (st.phase !== 'select') return this.badState(slot, 'not selecting');
        if (!me.fighter) return this.badState(slot, 'pick a fighter first');
        me.ready = msg.ready;
        me.viewMirrored = msg.viewMirrored;
        if (st.players[0]?.ready && st.players[1]?.ready) this.startLoading();
        else this.broadcastRoom();
        return;
      case 'signal':
        if (st.players[other]?.connected) this.io.send(other, { t: 'signal', data: msg.data });
        return;
      case 'relay':
        st.relay = msg.on;
        if (st.players[other]?.connected) this.io.send(other, { t: 'relay', on: msg.on });
        return;
      case 'loaded':
        if (st.phase !== 'loading') return;
        me.loaded = true;
        if (st.players[0]?.loaded && st.players[1]?.loaded) {
          st.phase = 'match';
          this.broadcastRoom();
          this.broadcast({ t: 'start' });
        } else {
          this.broadcastRoom();
        }
        return;
      case 'result':
        if (st.phase !== 'match') return;
        st.phase = 'results';
        for (const p of st.players) if (p) p.rematch = false;
        this.broadcastRoom();
        return;
      case 'rematch':
        if (st.phase !== 'results') return;
        me.rematch = true;
        if (st.players[0]?.rematch && st.players[1]?.rematch) this.startLoading();
        else this.broadcastRoom();
        return;
      case 'reselect':
        if (st.phase !== 'results' && st.phase !== 'select') return;
        this.backToSelect();
        return;
      case 'leave':
        this.removePlayer(slot, 'left');
        return;
    }
  }

  /** Relay fallback: forward binary frames (inputs + control) to the other player. */
  binary(slot: Slot, data: ArrayBuffer): void {
    const other = (slot === 0 ? 1 : 0) as Slot;
    if (this.state.relay && this.state.players[other]?.connected) this.io.sendBinary(other, data);
  }

  disconnect(slot: Slot): void {
    const st = this.state;
    const me = st.players[slot];
    if (!me) return;
    this.touch();
    if (st.phase === 'loading' || st.phase === 'match') {
      // The P2P match may continue without the lobby; keep the seat for a reconnect.
      me.connected = false;
      const other = (slot === 0 ? 1 : 0) as Slot;
      if (st.relay && st.players[other]?.connected) this.io.send(other, { t: 'peer_left', reason: 'closed' });
      this.broadcastRoom();
      return;
    }
    this.removePlayer(slot, 'closed');
  }

  private removePlayer(slot: Slot, reason: 'closed' | 'left'): void {
    const st = this.state;
    st.players[slot] = null;
    const other = (slot === 0 ? 1 : 0) as Slot;
    if (st.players[other]?.connected) this.io.send(other, { t: 'peer_left', reason });
    if (!st.players[0] && !st.players[1]) st.simVersion = null;
    st.phase = 'waiting';
    st.config = null;
    st.relay = false;
    for (const p of st.players) {
      if (!p) continue;
      p.ready = false;
      p.loaded = false;
      p.rematch = false;
    }
    this.broadcastRoom();
  }

  private backToSelect(): void {
    const st = this.state;
    st.phase = 'select';
    st.config = null;
    for (const p of st.players) {
      if (!p) continue;
      p.ready = false;
      p.loaded = false;
      p.rematch = false;
    }
    this.broadcastRoom();
  }

  private startLoading(): void {
    const st = this.state;
    const [a, b] = st.players;
    if (!a || !b || !a.fighter || !b.fighter) return;
    st.phase = 'loading';
    st.config = {
      seed: this.io.randomUint32() | 0,
      fighters: [a.fighter, b.fighter],
      stage: DEFAULT_STAGE,
      roundsToWin: st.roundsToWin,
      roundFrames: DEFAULT_ROUND_FRAMES,
      viewMirrored: [a.viewMirrored, b.viewMirrored],
      simVersion: st.simVersion ?? 'dev',
    };
    for (const p of st.players) {
      if (!p) continue;
      p.loaded = false;
      p.rematch = false;
    }
    this.broadcastRoom();
    this.broadcast({ t: 'config', config: st.config });
  }

  private badState(slot: Slot, message: string): void {
    this.io.send(slot, { t: 'error', code: 'BAD_STATE', message });
  }

  private touch(): void {
    this.state.lastActivity = this.io.now();
  }

  private broadcast(msg: ServerMsg): void {
    for (const s of [0, 1] as const) if (this.state.players[s]?.connected) this.io.send(s, msg);
  }

  private publicPlayer(p: PlayerSlot | null): PlayerInfo | null {
    if (!p) return null;
    return {
      name: p.name,
      fighter: p.fighter,
      ready: p.ready,
      connected: p.connected,
      loaded: p.loaded,
      rematch: p.rematch,
    };
  }

  broadcastRoom(): void {
    const st = this.state;
    const players: [PlayerInfo | null, PlayerInfo | null] = [
      this.publicPlayer(st.players[0]),
      this.publicPlayer(st.players[1]),
    ];
    for (const s of [0, 1] as const) {
      if (!st.players[s]?.connected) continue;
      this.io.send(s, { t: 'room', code: st.code, you: s, players, phase: st.phase, roundsToWin: st.roundsToWin });
    }
  }
}
