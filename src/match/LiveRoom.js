import { mergeShots, newFeed } from '../game/remoteBall.js';

/**
 * Canal en tiempo real de una partida (Supabase Realtime, broadcast). Cada
 * jugador manda sus tiros según los hace y su resultado al acabar cada hoyo;
 * los demás repiten los tiros con la física y ven su bola moverse.
 *
 * Es solo para verlo en directo: los golpes que cuentan son los que el
 * servidor repite en submit-hole. Si el canal falla, la partida sigue igual
 * (solo dejas de ver las bolas de los demás).
 */
export class LiveRoom {
  constructor(db, matchId, mySeat, seats) {
    this.db = db;
    this.seat = mySeat;
    this.seats = new Set(seats);
    this.feeds = new Map();
    this.onDone = null;
    this.channel = db.channel(`golf:${matchId}`, { config: { broadcast: { self: false } } });
    this.channel
      .on('broadcast', { event: 'shot' }, ({ payload }) => this.receiveShots(payload))
      .on('broadcast', { event: 'done' }, ({ payload }) => this.receiveDone(payload))
      .subscribe();
  }

  feed(seat, hole) {
    const key = `${seat}:${hole}`;
    if (!this.feeds.has(key)) this.feeds.set(key, newFeed());
    return this.feeds.get(key);
  }

  #valid(p) {
    return p && Number.isInteger(p.seat) && Number.isInteger(p.hole) && p.hole >= 0 && p.hole < 32 && p.seat !== this.seat && this.seats.has(p.seat);
  }

  receiveShots(p) {
    if (!this.#valid(p)) return;
    mergeShots(this.feed(p.seat, p.hole), p.shots);
  }

  receiveDone(p) {
    if (!this.#valid(p)) return;
    const f = this.feed(p.seat, p.hole);
    if (p.shots) mergeShots(f, p.shots);
    f.final = {
      strokes: Number.isInteger(p.strokes) ? p.strokes : null,
      sunk: !!p.sunk,
      sunkTick: Number.isInteger(p.sunkTick) ? p.sunkTick : null,
      dq: !!p.dq,
    };
    this.onDone?.(p.seat, p.hole, f.final);
  }

  #send(event, payload) {
    this.channel.send({ type: 'broadcast', event, payload: { seat: this.seat, ...payload } }).catch?.(() => { });
  }

  sendShots(hole, shots) {
    this.#send('shot', { hole, shots });
  }

  sendDone(hole, { shots, strokes, sunk, sunkTick, dq }) {
    this.#send('done', { hole, shots, strokes, sunk, sunkTick, dq });
  }

  close() {
    this.db.removeChannel(this.channel).catch?.(() => { });
  }
}
