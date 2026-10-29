import {
  inputDelayForPing,
  type ControlMsg,
  type IceServer,
  type MatchConfig,
  type PlayerInfo,
  type RoomPhase,
  type ServerMsg,
} from '@neonfist/shared';
import {
  isSignalData,
  measureRtt,
  RelayLink,
  WebRtcLink,
  withPongs,
  type LinkKind,
  type PeerLink,
  type SignalData,
} from '@neonfist/netcode';
import { createPlayerInput } from '../game/input/sampler';
import { SOLO_KEYS } from '../game/input/bindings';
import { OnlineDriver, type DesyncBundle } from '../game/driver';
import { clientId, loadSettings } from '../ui/settings';
import { LobbyClient } from './lobby';

export type RoomStatus =
  | 'connecting' // lobby socket opening
  | 'lobby' // waiting / character select
  | 'linking' // match config received, connecting to the other browser
  | 'syncing' // measuring ping, agreeing on input delay, waiting for the start signal
  | 'fighting'
  | 'results'
  | 'error';

export interface RoomView {
  status: RoomStatus;
  code: string;
  you: 0 | 1 | null;
  phase: RoomPhase | null;
  players: [PlayerInfo | null, PlayerInfo | null];
  config: MatchConfig | null;
  link: LinkKind | null;
  pingMs: number | null;
  inputDelay: number | null;
  error: string | null;
  notice: string | null;
  peerPaused: boolean;
  driver: OnlineDriver | null;
  desync: DesyncBundle | null;
  steps: string[];
}

const SIM_VERSION = process.env.NEXT_PUBLIC_SIM_VERSION ?? 'dev';

/**
 * Everything about one online room: the lobby socket, the link to the other browser
 * (WebRTC → relay fallback), the ping handshake and the rollback session (PLAN §4.6–4.8).
 * React reads it with useSyncExternalStore.
 */
export class RoomController {
  private lobby: LobbyClient;
  private link: PeerLink | null = null;
  private iceServers: IceServer[] = [];
  private pendingSignals: SignalData[] = [];
  private listeners = new Set<() => void>();
  private delayWaiter: ((d: number) => void) | null = null;
  private wantRelay: boolean;
  private linkGeneration = 0;
  private disposed = false;
  view: RoomView;

  constructor(
    code: string,
    private name: string,
    opts: { forceRelay?: boolean } = {},
  ) {
    this.wantRelay = !!opts.forceRelay;
    this.view = {
      status: 'connecting',
      code,
      you: null,
      phase: null,
      players: [null, null],
      config: null,
      link: null,
      pingMs: null,
      inputDelay: null,
      error: null,
      notice: null,
      peerPaused: false,
      driver: null,
      desync: null,
      steps: [],
    };
    this.lobby = new LobbyClient(code);
    this.lobby.onOpen = () =>
      this.lobby.send({ t: 'hello', name, simVersion: SIM_VERSION, clientId: clientId() });
    this.lobby.onMessage = (m) => this.onLobby(m);
    this.lobby.onClose = (code) => {
      if (this.disposed) return;
      if (this.view.status === 'fighting' && this.link?.kind !== 'relay') return; // P2P continues
      if (code === 4004 || code === 4001) return; // error already shown
      this.set({ status: 'error', error: 'Lost the connection to the lobby. Reload the page to rejoin.' });
    };
  }

  /* ---------------------------------------------------------------- store */

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.view;

  private set(patch: Partial<RoomView>) {
    this.view = { ...this.view, ...patch };
    for (const l of this.listeners) l();
  }

  private step(text: string) {
    this.set({ steps: [...this.view.steps, text] });
  }

  /* ---------------------------------------------------------------- actions */

  select(fighter: string) {
    this.lobby.send({ t: 'select', fighter });
  }

  ready(ready: boolean) {
    const s = loadSettings();
    // "Always on the left" only changes anything for P2.
    this.lobby.send({ t: 'ready', ready, viewMirrored: this.view.you === 1 && s.alwaysLeft });
  }

  rematch() {
    this.lobby.send({ t: 'rematch' });
  }

  reselect() {
    this.endDriver();
    this.lobby.send({ t: 'reselect' });
  }

  /** The fight is over on this screen (state reached MATCH_END). */
  reportResult(winner: 0 | 1 | -1, finalChecksum: number) {
    if (this.view.status !== 'fighting') return;
    this.lobby.send({ t: 'result', winner, finalChecksum });
  }

  leave() {
    this.lobby.send({ t: 'leave' });
    this.dispose();
  }

  /* ---------------------------------------------------------------- lobby */

  private onLobby(m: ServerMsg) {
    switch (m.t) {
      case 'room': {
        const patch: Partial<RoomView> = { you: m.you, phase: m.phase, players: m.players };
        if (m.phase === 'waiting' || m.phase === 'select') {
          if (this.view.status !== 'lobby') this.endDriver();
          patch.status = 'lobby';
          patch.config = null;
        } else if (m.phase === 'results' && this.view.status === 'fighting') {
          patch.status = 'results';
        }
        this.set(patch);
        break;
      }
      case 'ice':
        this.iceServers = m.iceServers;
        break;
      case 'config':
        void this.startMatch(m.config);
        break;
      case 'signal':
        if (!isSignalData(m.data)) return;
        if (this.link instanceof WebRtcLink) void this.link.handleSignal(m.data);
        else this.pendingSignals.push(m.data);
        break;
      case 'relay':
        if (m.on && this.link?.kind !== 'relay') {
          this.wantRelay = true;
          this.useRelay();
        }
        break;
      case 'start':
        this.beginFight();
        break;
      case 'peer_left':
        this.set({ notice: 'Your opponent left the room.' });
        this.endDriver();
        this.closeLink();
        break;
      case 'error':
        this.set({ status: 'error', error: m.message });
        break;
    }
  }

  /* ---------------------------------------------------------------- linking */

  private closeLink() {
    this.link?.close();
    this.link = null;
    this.set({ link: null });
  }

  private useRelay() {
    if (this.link?.kind === 'relay') return;
    this.link?.close();
    this.link = new RelayLink(this.lobby);
    this.installLinkHandlers(this.link);
    this.set({ link: 'relay' });
    this.step('Connected through the relay server');
  }

  private installLinkHandlers(link: PeerLink) {
    link.onControl = withPongs(link, (msg) => this.onControl(msg));
    link.onClose = (reason) => {
      if (this.link !== link || this.disposed) return;
      this.link = null;
      if (this.view.status === 'fighting' || this.view.status === 'syncing') {
        this.set({ notice: `Connection to your opponent was lost (${reason}).`, link: null });
      }
    };
  }

  private onControl(msg: ControlMsg) {
    if (msg.t === 'delay') {
      this.delayWaiter?.(msg.inputDelay);
      this.delayWaiter = null;
      return;
    }
    this.view.driver?.control(msg);
  }

  /** Make sure there is an open link to the other browser: WebRTC first, relay as the fallback. */
  private async ensureLink(): Promise<PeerLink> {
    if (this.link?.open) return this.link;
    const gen = ++this.linkGeneration;
    if (this.wantRelay) {
      this.lobby.send({ t: 'relay', on: true });
      this.useRelay();
      return this.link!;
    }
    this.step('Connecting directly to your opponent');
    const rtc = new WebRtcLink({
      iceServers: this.iceServers,
      initiator: this.view.you === 0,
      signal: (data) => this.lobby.send({ t: 'signal', data }),
    });
    this.link = rtc;
    this.installLinkHandlers(rtc);
    for (const s of this.pendingSignals.splice(0)) void rtc.handleSignal(s);
    try {
      await rtc.ready(15000);
      if (gen !== this.linkGeneration || this.link !== rtc) return this.link!;
      const kind = await rtc.detectPath();
      this.set({ link: kind });
      this.step(kind === 'turn' ? 'Connected through a TURN relay' : 'Connected peer-to-peer');
      return rtc;
    } catch {
      if (this.link !== rtc) return this.link!; // the peer already switched us to relay
      this.step('Direct connection failed, switching to the relay');
      rtc.close();
      this.wantRelay = true;
      this.lobby.send({ t: 'relay', on: true });
      this.useRelay();
      return this.link!;
    }
  }

  private async startMatch(config: MatchConfig) {
    this.endDriver();
    this.set({ status: 'linking', config, notice: null, desync: null, steps: [], peerPaused: false });
    const link = await this.ensureLink();
    if (this.disposed) return;
    this.set({ status: 'syncing' });

    // Ping handshake: the host measures, picks the input delay, tells the guest (PLAN §4.8).
    let delay: number;
    const override = loadSettings().inputDelay;
    if (this.view.you === 0) {
      const ping = await measureRtt(link, 10, 6000).catch(() => null);
      delay = override || inputDelayForPing(ping ?? 120);
      link.sendControl({ t: 'delay', inputDelay: delay });
      this.set({ pingMs: ping });
    } else {
      delay = await new Promise<number>((resolve) => {
        this.delayWaiter = resolve;
        setTimeout(() => {
          if (this.delayWaiter === resolve) {
            this.delayWaiter = null;
            resolve(override || 2);
          }
        }, 8000);
      });
    }
    if (this.disposed) return;
    this.set({ inputDelay: delay });
    this.step(`Input delay ${delay} frame${delay === 1 ? '' : 's'}`);
    this.lobby.send({ t: 'loaded' });
  }

  private beginFight() {
    const { config, you, inputDelay } = this.view;
    if (!config || you === null || !this.link) return;
    this.endDriver();
    const link = this.link;
    const driver = new OnlineDriver({
      config: {
        seed: config.seed,
        fighters: config.fighters,
        roundsToWin: config.roundsToWin,
        roundFrames: config.roundFrames,
        viewMirrored: config.viewMirrored,
      },
      localPlayer: you,
      inputDelay: inputDelay ?? 2,
      epoch: config.seed & 0xff,
      link,
      input: createPlayerInput(SOLO_KEYS, 'any', true),
      pingMs: this.view.pingMs,
      onDesync: (bundle) => this.set({ desync: bundle }),
      onPeerPause: (paused) => this.set({ peerPaused: paused }),
    });
    this.set({ status: 'fighting', driver });
  }

  private endDriver() {
    if (this.view.driver) {
      this.view.driver.dispose();
      this.set({ driver: null });
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.endDriver();
    this.link?.close();
    this.lobby.close();
    this.listeners.clear();
  }
}
