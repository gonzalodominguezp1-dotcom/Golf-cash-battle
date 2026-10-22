import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalWallet } from '../src/wallet/LocalWallet.js';
import { MatchService, settle } from '../src/match/MatchService.js';
import { TIERS, STARTING_DEMO_CREDITS } from '../src/config.js';

const gold = TIERS.find((t) => t.id === 'gold');
const players = (totals) => totals.map((total, i) => ({ id: i ? `p${i}` : 'me', name: `P${i}`, total, scores: [total] }));

test('el ganador se lleva el bote menos la comisión', () => {
  const r = settle(players([7, 9, 10, 8, 11, 12, 9, 10]), gold);
  assert.equal(r.pot, 80);
  assert.equal(r.commission, 8);
  assert.equal(r.ranking[0].payout, 72);
  assert.equal(r.ranking.filter((p) => p.payout > 0).length, 1);
});

test('empate: el premio se divide', () => {
  const r = settle(players([7, 7, 10, 8, 11, 12, 9, 10]), gold);
  assert.deepEqual(r.ranking.filter((p) => p.payout).map((p) => p.payout), [36, 36]);
});

test('el wallet cobra la entrada y paga el premio', async () => {
  const wallet = new LocalWallet(null);
  const svc = new MatchService(wallet, () => 0.99); // bots fallan mucho
  const match = await svc.join(gold);
  assert.equal(await wallet.getBalance(), STARTING_DEMO_CREDITS - 10);
  for (let i = 0; i < 3; i++) svc.recordHole(match, i, 3, 1);
  const res = await svc.finish(match);
  assert.equal(res.me.payout, 72);
  assert.equal(await wallet.getBalance(), STARTING_DEMO_CREDITS - 10 + 72);
});

test('sin saldo no se puede entrar', async () => {
  const wallet = new LocalWallet(null);
  const svc = new MatchService(wallet);
  const diamond = TIERS.find((t) => t.id === 'diamond');
  for (let i = 0; i < 4; i++) await svc.join(diamond);
  await assert.rejects(svc.join(diamond), /Saldo insuficiente/);
});

test('desempate: gana quien queda más cerca del objetivo', () => {
  const r = settle(players([7, 7, 10, 8, 11, 12, 9, 10]), gold, { me: 1.4, p1: 0.6 });
  assert.equal(r.ranking[0].id, 'p1');
  assert.equal(r.ranking[0].payout, 72);
  assert.equal(r.ranking[1].id, 'me');
  assert.equal(r.ranking[1].position, 2);
  assert.equal(r.ranking[1].payout, 0);
});

test('desempate en práctica: posición 1 para el más cercano aunque el payout sea 0', () => {
  const practice = TIERS.find((t) => t.id === 'practice');
  const r = settle(players([7, 7, 10, 8, 11, 12, 9, 10]), practice, { me: 0.4, p1: 1.2 });
  assert.equal(r.ranking[0].id, 'me');
  assert.equal(r.ranking[0].position, 1);
  assert.equal(r.ranking[0].payout, 0);
});
