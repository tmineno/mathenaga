// テストの補助:路線図の札・札の中の文字と印・ラベル・線が重ならないことを確かめる(route-map.md 受け入れテスト 6)。
// 線と矩形の交わりは、map.js の計算を使わずに、線分の上の点を細かく調べて判定する。

import assert from 'node:assert/strict';
import { layoutBoxes } from '../../src/core/map.js';

/** @typedef {{ x: number, y: number, w: number, h: number }} Box */

/** @template {Box} T @param {T} b @returns {T} */
const shrink = (b) => ({ ...b, x: b.x + 0.5, y: b.y + 0.5, w: b.w - 1, h: b.h - 1 });
/** @param {Box} a @param {Box} b */
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** @param {Box} inner @param {Box} outer */
const inside = (inner, outer) =>
  inner.x >= outer.x - 0.01 &&
  inner.y >= outer.y - 0.01 &&
  inner.x + inner.w <= outer.x + outer.w + 0.01 &&
  inner.y + inner.h <= outer.y + outer.h + 0.01;

/**
 * @param {string} name
 * @param {any} layout  layoutMap の結果
 */
export function assertNoOverlap(name, layout) {
  const { boxes, segments } = layoutBoxes(layout);
  const cards = boxes.filter((b) => b.kind === 'card');
  const labels = boxes.filter((b) => b.kind === 'label');
  // 札どうし
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      assert.ok(!hit(cards[i], cards[j]), `${name}: ${cards[i].owner}と${cards[j].owner}の札が重なる`);
    }
  }
  // 札の中の文字と印:同じ札の中で重ならず、札からはみ出さない
  for (const c of cards) {
    const own = boxes.filter((b) => b.card !== null && `第${b.card}章` === c.owner);
    for (const b of own) assert.ok(inside(b, c), `${name}: ${b.kind}(${b.owner}) が${c.owner}の札からはみ出す`);
    for (let i = 0; i < own.length; i++) {
      for (let j = i + 1; j < own.length; j++) {
        const a = shrink(own[i]);
        const b = shrink(own[j]);
        assert.ok(!hit(a, b), `${name}: ${a.kind}(${a.owner}) と ${b.kind}(${b.owner}) が重なる`);
      }
    }
  }
  // ラベルは札ともほかのラベルとも重ならない
  for (const l of labels) {
    for (const c of cards) assert.ok(!hit(shrink(l), c), `${name}: ラベル「${l.owner}」が${c.owner}の札に重なる`);
    for (const m of labels) {
      if (m !== l) assert.ok(!hit(shrink(l), shrink(m)), `${name}: ラベル「${l.owner}」と「${m.owner}」が重なる`);
    }
  }
  // 線は札の中を通らず、ラベルに重ならない
  for (const s of segments) {
    for (const c of cards) {
      assert.ok(!segmentHitsBox(s, shrink(c)), `${name}: 線(${s.kind} ${s.id || s.lineId}) が${c.owner}の札の中を通る`);
    }
    for (const l of labels) {
      assert.ok(
        !segmentHitsBox(s, shrink(l)),
        `${name}: 線(${s.kind} ${s.id || s.lineId}) がラベル「${l.owner}」に重なる`,
      );
    }
  }
  // 同じ向きに進む区間どうしは、同じ位置で重ならない(溝の中のトラック)
  const straight = segments.filter((s) => s.x1 === s.x2 || s.y1 === s.y2);
  for (let i = 0; i < straight.length; i++) {
    for (let j = i + 1; j < straight.length; j++) {
      const a = straight[i];
      const b = straight[j];
      if (a.id === b.id) continue;
      const overlap = collinearOverlap(a, b);
      assert.ok(overlap <= 0.5, `${name}: 線(${a.kind} ${a.id}) と線(${b.kind} ${b.id}) が ${overlap}px 重なって進む`);
    }
  }
}

/** 縦か横の2つの線分が、同じ直線の上で重なる長さ。 @param {any} a @param {any} b */
function collinearOverlap(a, b) {
  const horiz = (/** @type {any} */ s) => s.y1 === s.y2 && s.x1 !== s.x2;
  const vert = (/** @type {any} */ s) => s.x1 === s.x2 && s.y1 !== s.y2;
  if (horiz(a) && horiz(b) && Math.abs(a.y1 - b.y1) < 0.5) {
    return Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2)) - Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2));
  }
  if (vert(a) && vert(b) && Math.abs(a.x1 - b.x1) < 0.5) {
    return Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2)) - Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2));
  }
  return 0;
}

/** @param {{ x1: number, y1: number, x2: number, y2: number }} s @param {Box} b */
function segmentHitsBox(s, b) {
  const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  const steps = Math.max(64, Math.ceil(len));
  for (let i = 0; i <= steps; i++) {
    const x = s.x1 + ((s.x2 - s.x1) * i) / steps;
    const y = s.y1 + ((s.y2 - s.y1) * i) / steps;
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
  }
  return false;
}
