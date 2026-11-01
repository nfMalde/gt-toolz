// Race crew: lap times and sector splits against the own best lap, position, fuel and tyre strategy, and
// (cheeky style) a crew that gets annoyed by trips into the grass. Only in races, and independent of the
// reference: that is a solo lap, races run under other conditions. Laps come from GT7's own lap counter,
// sectors from the distance driven. GT7 sends nothing about other cars and no tyre wear; the wear is
// estimated from the pace dropping over a stint.

import type { Phrases } from '@gt-toolz/coach';
import { Flags, type TelemetryFrame } from '@gt-toolz/telemetry';
import type { CrewStatus, Patience, TalkLevel } from '@gt-toolz/runtime/app-api';
import { TyreWatch } from './tyres';

export interface CrewOptions {
  /** Seconds a pit stop costs (pit lane and stop), for the tyre advice. */
  pitLossSeconds: number;
  /** Fuel and tyre reports. */
  strategy: boolean;
  cheeky: boolean;
  patience: Patience;
  /** Sectors per lap for the splits (1 = only the lap). */
  sectors: number;
  /** How much the crew says ('little': at the line only the position, laps to go only near the end). */
  talk: TalkLevel;
}

/** Off track: at least this many wheels on grass or gravel ... */
const OFF_TRACK_WHEELS = 2;
/** ... for this long. */
const OFF_TRACK_MIN_MS = 300;
/** Back on track this long ends the excursion. */
const BACK_ON_TRACK_MS = 1000;
/** At most one off-track remark in this time. */
const OFF_TRACK_REMARK_GAP_MS = 30_000;
/** Repeated excursions at which the crew gets annoyed (level 2) and loses it (level 3), by patience. */
const CREW_PATIENCE: Record<Patience, [annoyed: number, lostIt: number]> = { high: [4, 7], normal: [3, 5], low: [2, 3] };
/** This many more after losing it, and the race engineer quits: the team boss takes the radio (level 4). */
const CREW_QUIT_AFTER = 2;
/** Fuel use per lap below this share of the tank: the session has no fuel use. */
const NO_FUEL_USE = 0.002;
/** A fuel rise above this share of the tank is a refuel (new stint). */
const REFUEL = 0.01;
/** Tyre loss (s per lap compared with fresh) from which it is worth a word. */
const TYRE_LOSS_REPORT_S = 0.3;
/** A new position counts once it holds this long (not while side by side). */
const POSITION_STABLE_MS = 3000;
/** Faster than this (m/s, about 18 km/h) in the first lap, for UNDERWAY_HOLD_MS: the race has started. */
const UNDERWAY_MS = 5;
const UNDERWAY_HOLD_MS = 1500;
/** Talk level 'little': "laps to go" only from this many laps on. */
const LAPS_LEFT_LITTLE = 3;
/** Between two position calls (a spin loses several places in a row: one call with the sum). */
const POSITION_CALL_GAP_MS = 20_000;
/** GT7's official lap time comes a moment after the line; until then the own measurement waits. */
const LAP_TIME_WAIT_MS = 3000;
/** A lap shorter than this is no lap (a restart, a jump); sectors need a real lap length. */
const MIN_LAP_M = 500;
/** Frames further apart than this, or a step longer than this, are a gap or a jump, not driven distance. */
const MAX_FRAME_GAP_S = 0.5;
const MAX_STEP_M = 50;
/** Tyres that cool down this much while (nearly) standing were changed (new stint). */
const TYRE_CHANGE_DROP_C = 15;

/** A lap at the line, until its official time comes. */
interface PendingLap {
  lap: number;
  ownMs: number;
  at: number;
  trace: [meters: number, ms: number][];
}

/** Times at the sector ends (meters from the line) from a lap's trace; the last sector ends with the lap time. */
function splitsAt(trace: [meters: number, ms: number][], ends: number[], timeMs: number): Map<number, number> {
  const splits = new Map<number, number>();
  let i = 0;
  ends.forEach((end, k) => {
    while (i < trace.length - 2 && trace[i + 1]![0] < end) i++;
    const [d0, t0] = trace[i] ?? [0, 0];
    const [d1, t1] = trace[i + 1] ?? [d0, t0];
    const f = d1 > d0 ? Math.min(1, Math.max(0, (end - d0) / (d1 - d0))) : 0;
    splits.set(k + 1, t0 + (t1 - t0) * f);
  });
  splits.set(ends.length + 1, timeMs);
  return splits;
}

/** The middle value (of an even number, the mean of the two in the middle). */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The ghost for the reports, when the reference fits the track (GhostWatch). */
export interface CrewGhost {
  timeAt(frame: TelemetryFrame): number | undefined;
  lapGap(timeMs: number): number | undefined;
  lengthMeters(): number | undefined;
}

export class RaceCrew {
  /** Elapsed time at each sector end, current lap and last lap; the best lap's too. */
  private current = new Map<number, number>();
  private last = new Map<number, number>();
  private best: { timeMs: number; splits?: Map<number, number> } | undefined;
  /** GT7's lap counter at the last frame, when the current lap began (frame time) and the meters driven in it. */
  private lapCount: number | undefined;
  private lapStartAt: number | undefined;
  private distance = 0;
  private lastFrameAt: number | undefined;
  private lastPosition: { x: number; y: number; z: number } | undefined;
  /** Distance and time since the lap start, for the sector times at the line. */
  private trace: [meters: number, ms: number][] = [];
  /**
   * Length of the first lap from line to line (lap 1 starts on the grid). The sectors end at fixed meters
   * from it, in every lap the same, so sectors compare fairly (a wider line changes a lap's length).
   */
  private lapLength: number | undefined;
  /** A lap just ended: waiting for GT7's official time (lastLapMs changes after the line). */
  private pendingLap: PendingLap | undefined;
  private lastLapMs = 0;
  private positionSaidAt = 0;
  /** The reference lap, in addition to the own best lap, when it fits the track. */
  private ghost: CrewGhost | undefined;

  private fuelAtLapStart: number | undefined;
  private fuelPerLap: number[] = [];
  /** Lap times of the current stint (laps without excursions), for the tyre estimate. */
  private stint: number[] = [];
  private lapHadExcursion = false;
  /** Tyre temperatures: state, fast changes, a tyre that ran hot (tyres.ts). */
  private readonly tyres: TyreWatch;
  private lastTemps: { at: number; mean: number } | undefined;

  /** Position at the last report, for places gained or lost; a changed position waits until it holds. */
  private reportedPosition: number | undefined;
  private candidatePosition: number | undefined;
  private candidateSince = 0;
  /**
   * The race has started: the first lap counts and the car moves, on track, not paused or loading. Before that the
   * crew says nothing (the user, 2026-10-28: "Positionsmeldungen der Crew etc. erst ab Rennstart").
   */
  private underway = false;
  private movingSince: number | undefined;

  private offSince = 0;
  private onSince = 0;
  private offTrack = false;
  private excursions = 0;
  /** Excursions not yet forgiven: one more with every excursion, one less with every lap without one. */
  private annoyance = 0;
  /** The team boss has the radio (the race engineer quit, level 4). */
  private boss = false;
  /** The one on the radio has said a level 3 remark: only then can he quit (the escalation is heard step by step). */
  private lostItSaid = false;
  private lastRemarkAt = 0;

  /** After the chequered flag the crew stays quiet. */
  private finished = false;

  private state: CrewStatus = { active: false, sectors: [], lap: 0, laps: 0, mood: 0, excursions: 0 };

  constructor(
    private phrases: Phrases,
    private options: CrewOptions,
  ) {
    this.tyres = new TyreWatch(phrases);
  }

  get status(): CrewStatus {
    return this.state;
  }

  /** The crew speaks its own language, which can change during a session. */
  setPhrases(phrases: Phrases): void {
    this.phrases = phrases;
    this.tyres.setPhrases(phrases);
  }

  setOptions(options: CrewOptions): void {
    this.options = options;
  }

  setGhost(ghost: CrewGhost | undefined): void {
    this.ghost = ghost;
  }

  /** A race: everything from scratch. The crew speaks once the race runs (the radio check first). */
  start(frame: TelemetryFrame): void {
    this.underway = false;
    this.movingSince = undefined;
    this.current.clear();
    this.last.clear();
    this.best = undefined;
    this.lapCount = frame.lapCount;
    this.lapStartAt = frame.lapCount >= 1 ? frame.time : undefined;
    this.distance = 0;
    this.lastFrameAt = frame.time;
    this.lastPosition = undefined;
    this.lapLength = undefined;
    this.trace = [];
    this.pendingLap = undefined;
    this.lastLapMs = frame.lastLapMs;
    this.fuelAtLapStart = frame.fuelLevel;
    this.fuelPerLap = [];
    this.stint = [];
    this.excursions = 0;
    this.annoyance = 0;
    this.boss = false;
    this.lostItSaid = false;
    this.reportedPosition = frame.racePosition > 0 ? frame.racePosition : undefined;
    this.state = {
      active: true,
      sectors: [],
      lap: Math.max(0, frame.lapCount),
      laps: frame.lapsInRace,
      ...this.positionOf(frame),
      mood: 0,
      excursions: 0,
    };
  }

  stop(): void {
    this.state = { ...this.state, active: false };
  }

  /** Laps by GT7's counter, sectors by the distance driven; returns the reports to say. */
  private trackLap(frame: TelemetryFrame): string[] {
    const messages: string[] = [];
    const paused = (frame.flags & (Flags.Paused | Flags.Loading)) !== 0;
    const dt = this.lastFrameAt === undefined ? 0 : (frame.time - this.lastFrameAt) / 1000;
    this.lastFrameAt = frame.time;
    // A paused game is no lap time. The distance comes from the positions: a results screen repeats the last
    // packet with its speed, but the car does not move; a jump (restart) is no distance either.
    if (paused && this.lapStartAt !== undefined) this.lapStartAt += dt * 1000;
    const position = { x: frame.x, y: frame.y, z: frame.z };
    if (this.lastPosition && !paused) {
      const step = Math.hypot(position.x - this.lastPosition.x, position.y - this.lastPosition.y, position.z - this.lastPosition.z);
      if (step < MAX_STEP_M && dt < MAX_FRAME_GAP_S) this.distance += step;
    }
    this.lastPosition = position;

    // The line: GT7's counter goes up (lap 0 is the time before the start).
    if (this.lapCount !== undefined && frame.lapCount > this.lapCount) {
      if (this.lapCount >= 1 && this.lapStartAt !== undefined) {
        if (this.lapCount >= 2 && this.lapLength === undefined && this.distance >= MIN_LAP_M) this.lapLength = this.distance;
        this.pendingLap = { lap: this.lapCount, ownMs: frame.time - this.lapStartAt, at: frame.time, trace: this.trace };
      }
      this.lapStartAt = frame.time;
      this.distance = 0;
      this.trace = [];
      this.current.clear();
      // The lap shown in the app is the one being driven.
      this.state = { ...this.state, lap: frame.lapCount };
    }
    this.lapCount = frame.lapCount;
    // The reference fits the track: its length gives the sector ends from lap 2 on (lap 1 starts on the grid).
    if (this.lapLength === undefined && frame.lapCount >= 2) this.lapLength = this.ghost?.lengthMeters();
    if (this.lapStartAt !== undefined && !paused) this.trace.push([this.distance, frame.time - this.lapStartAt]);

    // The lap's time: GT7's own as soon as it comes, else the own measurement.
    const official = frame.lastLapMs > 0 && frame.lastLapMs !== this.lastLapMs ? frame.lastLapMs : undefined;
    this.lastLapMs = frame.lastLapMs;
    const pending = this.pendingLap;
    if (pending && (official !== undefined || frame.time - pending.at >= LAP_TIME_WAIT_MS)) {
      this.pendingLap = undefined;
      messages.push(...this.lapDone(pending, official ?? pending.ownMs, frame));
    }

    // Sector ends within the lap.
    const ends = this.sectorEnds();
    if (this.lapStartAt !== undefined && ends.length && !paused) {
      const sector = this.current.size + 1;
      const end = ends[sector - 1];
      if (end !== undefined && this.distance >= end) messages.push(...this.sectorDone(sector, frame.time - this.lapStartAt, frame));
    }
    return messages;
  }

  /** Where the sectors end (meters from the line), once a lap from line to line is known; the last one at the line. */
  private sectorEnds(): number[] {
    const sectors = Math.max(1, Math.round(this.options.sectors));
    const length = this.lapLength;
    return length ? Array.from({ length: sectors - 1 }, (_, i) => (length * (i + 1)) / sectors) : [];
  }

  /** A sector within the lap: its time against the same sector of the own best lap, and the ghost when it fits. */
  private sectorDone(sector: number, elapsedMs: number, frame: TelemetryFrame): string[] {
    this.current.set(sector, elapsedMs);
    const deltaMs = this.sectorDelta(this.current, sector);
    const ghostTime = this.ghost?.timeAt(frame);
    const ghostMs = ghostTime === undefined ? undefined : elapsedMs - ghostTime;
    this.updateSectors(this.current, sector, deltaMs, ghostMs);
    // Nothing to compare yet (first laps, no ghost): the crew waits for the lap.
    const report = this.phrases.crewSector(sector, deltaMs, ghostMs);
    return report ? [report] : [];
  }

  /** A sector's time against the same sector of the best lap (when that lap has sector times). */
  private sectorDelta(splits: Map<number, number>, sector: number): number | undefined {
    const best = this.best?.splits;
    const own = splits.get(sector);
    const bestEnd = best?.get(sector);
    if (!best || own === undefined || bestEnd === undefined) return undefined;
    return own - (splits.get(sector - 1) ?? 0) - (bestEnd - (best.get(sector - 1) ?? 0));
  }

  private updateSectors(splits: Map<number, number>, sector: number, deltaMs: number | undefined, ghostMs?: number): void {
    const sectors = Math.max(1, Math.round(this.options.sectors));
    this.state = {
      ...this.state,
      sectors: Array.from({ length: sectors }, (_, i) => {
        const n = i + 1;
        const own = splits.get(n);
        const before = splits.get(n - 1) ?? 0;
        const lastOwn = this.last.get(n);
        const lastBefore = this.last.get(n - 1) ?? 0;
        return {
          sector: n,
          timeMs: own === undefined ? undefined : own - before,
          lastMs: lastOwn === undefined ? undefined : lastOwn - lastBefore,
          deltaMs: n === sector ? deltaMs : this.state.sectors[i]?.deltaMs,
          ghostMs: n === sector ? ghostMs : this.state.sectors[i]?.ghostMs,
        };
      }),
    };
  }

  /** The line: lap time against the own best lap, and the position (always at the line). */
  private lapDone(pending: PendingLap, timeMs: number, frame: TelemetryFrame): string[] {
    if (this.finished) return [];
    const sectors = Math.max(1, Math.round(this.options.sectors));
    // Sector times at the same meters as in every lap; lap 1 starts on the grid and has none.
    const ends = this.sectorEnds();
    const splits = pending.lap >= 2 && ends.length ? splitsAt(pending.trace, ends, timeMs) : undefined;
    const vsBest = !this.best ? undefined : timeMs < this.best.timeMs ? ('new' as const) : timeMs - this.best.timeMs;
    const lastSectorDelta = splits ? this.sectorDelta(splits, sectors) : undefined;
    if (!this.best || timeMs < this.best.timeMs) this.best = { timeMs, splits };
    const ghostMs = this.ghost?.lapGap(timeMs);
    if (splits) {
      this.updateSectors(splits, sectors, lastSectorDelta, ghostMs);
      this.last = splits;
    }

    const report = this.phrases.crewLap(pending.lap, timeMs, vsBest, ghostMs);
    const { position, cars } = this.positionOf(frame);
    this.state = { ...this.state, position, cars };
    let where = '';
    if (position !== undefined && cars !== undefined && cars > 1) {
      const change = this.reportedPosition !== undefined ? this.reportedPosition - position : 0;
      where = this.phrases.crewPosition(position, cars, change);
      this.reportedPosition = position;
      this.positionSaidAt = frame.time;
    }
    // Talk level 'little': the lap time is left out, the position stays.
    return [[this.options.talk === 'little' ? '' : report, where].filter(Boolean).join(' '), ...this.lap(pending.lap, timeMs, frame)].filter(Boolean);
  }

  private positionOf(frame: TelemetryFrame): { position?: number; cars?: number } {
    return frame.racePosition > 0 && frame.carsInRace > 0 ? { position: frame.racePosition, cars: frame.carsInRace } : {};
  }

  /** A lap is done: fuel, tyres, laps left; stint bookkeeping. */
  private lap(completed: number, lapTimeMs: number, frame: TelemetryFrame): string[] {
    if (this.finished) return [];
    const messages: string[] = [];
    this.state = { ...this.state, lap: completed + 1, laps: frame.lapsInRace };
    const remaining = frame.lapsInRace > 0 ? frame.lapsInRace - completed : 0;

    // Tyres: lap times of this stint, without laps with excursions and without the start (lap 1 from the grid). A lap
    // without an excursion calms the crew down a little.
    if (!this.lapHadExcursion) {
      if (completed >= 2) this.stint.push(lapTimeMs);
      if (this.annoyance > 0) this.setAnnoyance(this.annoyance - 1);
    }
    this.lapHadExcursion = false;
    const { temps, hot } = this.tyres.lap(completed, this.options.strategy);

    // Fuel: use per lap, laps left, pit lap.
    let fuelStopAhead = false;
    if (this.fuelAtLapStart !== undefined && frame.fuelCapacity > 0) {
      const used = this.fuelAtLapStart - frame.fuelLevel;
      if (used > frame.fuelCapacity * NO_FUEL_USE) this.fuelPerLap = [...this.fuelPerLap, used].slice(-3);
    }
    this.fuelAtLapStart = frame.fuelLevel;
    const perLap = this.fuelPerLap.length ? this.fuelPerLap.reduce((a, b) => a + b, 0) / this.fuelPerLap.length : undefined;
    if (perLap) {
      const lapsLeft = frame.fuelLevel / perLap;
      const toFinish = remaining > 0 && lapsLeft >= remaining + 0.1;
      const pitLap = remaining > 0 && !toFinish ? completed + Math.max(1, Math.floor(lapsLeft)) : undefined;
      fuelStopAhead = pitLap !== undefined;
      this.state = { ...this.state, fuel: { level: frame.fuelLevel, capacity: frame.fuelCapacity, perLap, lapsLeft, pitLap, toFinish } };
      if (this.options.strategy) messages.push(this.phrases.crewFuel({ lapsLeft, perLap, toFinish, pitLap: lapsLeft < 1.05 ? 'now' : pitLap }));
    }

    // Tyres: pace loss compared with the stint's best early laps. The pace now is the best of the last three laps: a
    // spin, a crash or traffic only make laps slower, worn tyres make every lap slower (the user's Manufacturers Cup,
    // 2026-10-31: after a lap with a spin, 16 s slower, "Reifen bauen ab, 8,1 Sekunden", twice, the second time with
    // the advice to pit; 2026-10-30: two slow laps after a crash, "18 Sekunden" for five laps at best pace again).
    if (this.stint.length >= 3) {
      const baseline = Math.min(...this.stint.slice(0, 3));
      const lossS = (Math.min(...this.stint.slice(-3)) - baseline) / 1000;
      const perLapS = this.slope(this.stint) / 1000;
      // Fresh tyres win back the loss on every remaining lap, minus their own wear on the way.
      const savingS = remaining * lossS - (Math.max(0, perLapS) * remaining * remaining) / 2;
      const pitNow = remaining > 1 && savingS > this.options.pitLossSeconds;
      this.state = { ...this.state, tyres: { temps, lossS, perLapS, pitNow } };
      if (this.options.strategy && lossS >= TYRE_LOSS_REPORT_S) messages.push(this.phrases.crewTyres({ lossS, pitNow, withFuel: fuelStopAhead }));
    } else if (temps) {
      this.state = { ...this.state, tyres: { ...this.state.tyres, temps } };
    }
    if (hot) messages.push(hot);

    if (remaining >= 2 && (this.options.talk !== 'little' || remaining <= LAPS_LEFT_LITTLE)) messages.push(this.phrases.crewLapsLeft(remaining));
    if (remaining === 1) messages.push(this.phrases.crewLastLap);
    if (frame.lapsInRace > 0 && remaining <= 0) {
      messages.push(this.phrases.crewFinish);
      // Chequered flag: the crew is done for this race.
      this.finished = true;
    }
    return messages;
  }

  /** Every frame: tyre temperatures, refuels, tyre changes, excursions. Returns remarks to say. */
  frame(frame: TelemetryFrame, now: number): string[] {
    if (this.finished) return [];
    const started = this.watchStart(frame, now);
    // The line and sector ends first: they are said right away.
    const reports = this.trackLap(frame);
    if (!this.underway) return [];
    if (this.finished) return reports;
    return [...(started ? [this.phrases.crewRaceStart] : []), ...reports, ...this.frameRemarks(frame, now)];
  }

  /**
   * Until the race runs: the position is the baseline (on an online grid it changes while players join, stream
   * feedback 2026-10-25). True on the frame the race starts.
   */
  private watchStart(frame: TelemetryFrame, now: number): boolean {
    if (this.underway) return false;
    const position = frame.racePosition > 0 && frame.carsInRace > 1 ? frame.racePosition : undefined;
    this.reportedPosition = position;
    this.candidatePosition = position;
    this.candidateSince = now;
    const moving =
      frame.lapCount >= 1 && frame.speed > UNDERWAY_MS && (frame.flags & Flags.CarOnTrack) !== 0 && !(frame.flags & (Flags.Paused | Flags.Loading));
    if (!moving) {
      this.movingSince = undefined;
      return false;
    }
    this.movingSince ??= now;
    if (now - this.movingSince < UNDERWAY_HOLD_MS) return false;
    this.underway = true;
    return true;
  }

  /** Tyre temperatures, refuels, tyre changes, positions, excursions. */
  private frameRemarks(frame: TelemetryFrame, now: number): string[] {
    const t = frame.tyreTemps;
    const tyreCalls = this.tyres.frame(frame, now, this.options.strategy);

    // Refuel or new tyres: a new stint for the tyre estimate.
    if (this.fuelAtLapStart !== undefined && frame.fuelLevel > this.fuelAtLapStart + frame.fuelCapacity * REFUEL) {
      this.fuelAtLapStart = frame.fuelLevel;
      this.stint = [];
    }
    const mean = (t[0] + t[1] + t[2] + t[3]) / 4;
    if (frame.speed < 2) {
      if (!this.lastTemps) this.lastTemps = { at: now, mean };
      else if (this.lastTemps.mean - mean >= TYRE_CHANGE_DROP_C) {
        this.stint = [];
        this.lastTemps = { at: now, mean };
      }
    } else {
      this.lastTemps = undefined;
    }

    if (tyreCalls.length) return tyreCalls;

    // Position changes, once they hold (the race runs: the position at the start is the baseline).
    const position = frame.racePosition > 0 && frame.carsInRace > 1 ? frame.racePosition : undefined;
    if (position !== this.candidatePosition) {
      this.candidatePosition = position;
      this.candidateSince = now;
    }
    // A spin loses several places in a row: one call with the sum, not one per car.
    if (
      position !== undefined &&
      this.reportedPosition !== undefined &&
      position !== this.reportedPosition &&
      now - this.candidateSince >= POSITION_STABLE_MS &&
      frame.time - this.positionSaidAt >= POSITION_CALL_GAP_MS
    ) {
      this.positionSaidAt = frame.time;
      const change = this.reportedPosition - position;
      this.reportedPosition = position;
      this.state = { ...this.state, position, cars: frame.carsInRace };
      return [this.phrases.crewPosition(position, frame.carsInRace, change)];
    }
    if (position !== undefined && this.reportedPosition === undefined) this.reportedPosition = position;

    // Excursions into grass or gravel.
    const off = (frame.offTrackWheels ?? 0) >= OFF_TRACK_WHEELS && frame.speed > 3;
    if (off) {
      this.onSince = 0;
      if (!this.offSince) this.offSince = now;
      if (!this.offTrack && now - this.offSince >= OFF_TRACK_MIN_MS) {
        this.offTrack = true;
        this.lapHadExcursion = true;
        this.excursions++;
        this.annoyance++;
        return this.offTrackRemark(now);
      }
    } else {
      this.offSince = 0;
      if (this.offTrack) {
        if (!this.onSince) this.onSince = now;
        if (now - this.onSince >= BACK_ON_TRACK_MS) this.offTrack = false;
      }
    }
    return [];
  }

  /** How annoyed the crew is: 0 none (the first excursion is free), 1 cheeky, 2 annoyed, 3 lost it. */
  private level(): 0 | 1 | 2 | 3 {
    const [annoyed, lostIt] = CREW_PATIENCE[this.options.patience];
    const repeats = this.annoyance - 1;
    return repeats <= 0 ? 0 : repeats < annoyed ? 1 : repeats < lostIt ? 2 : 3;
  }

  private setAnnoyance(value: number): void {
    this.annoyance = Math.max(0, value);
    this.state = { ...this.state, mood: this.boss ? 4 : this.level(), excursions: this.excursions };
  }

  /**
   * Lost it, and it keeps going: the race engineer quits and the team boss takes the radio (the runner swaps the
   * voices). With the boss on the radio already: the boss has had enough too.
   */
  get wantsToQuit(): boolean {
    const [, lostIt] = CREW_PATIENCE[this.options.patience];
    return this.options.cheeky && this.lostItSaid && this.annoyance - 1 >= lostIt + CREW_QUIT_AFTER;
  }

  /**
   * The team boss takes the radio (true) or the race engineer is back (false); annoyance: where the one taking
   * over starts (the boss starts relaxed).
   */
  setBoss(active: boolean, annoyance: number): void {
    this.boss = active;
    this.lostItSaid = false;
    this.setAnnoyance(annoyance);
  }

  /** The annoyance from which the crew has lost it: the race engineer coming back early starts there. */
  get lostItAnnoyance(): number {
    return CREW_PATIENCE[this.options.patience][1] + 1;
  }

  private offTrackRemark(now: number): string[] {
    this.setAnnoyance(this.annoyance);
    const level = this.level();
    if (!this.options.cheeky || level === 0 || now - this.lastRemarkAt < OFF_TRACK_REMARK_GAP_MS) return [];
    const text = this.phrases.crewOffTrack(level, this.excursions);
    if (!text) return [];
    this.lastRemarkAt = now;
    if (level === 3) this.lostItSaid = true;
    return [text];
  }

  /** Least-squares slope of the lap times (ms per lap). */
  /** The lap times' trend (ms per lap): the middle one of the slopes between every two laps, a single slow lap does not tilt it. */
  private slope(times: number[]): number {
    const slopes: number[] = [];
    for (let i = 0; i < times.length; i++) for (let j = i + 1; j < times.length; j++) slopes.push((times[j]! - times[i]!) / (j - i));
    return slopes.length ? median(slopes) : 0;
  }
}

