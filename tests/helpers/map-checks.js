// テストの補助:路線図の札・駅名・印・章の札・線が重ならないことを確かめる(route-map.md 受け入れテスト 6)。

import assert from 'node:assert/strict';
import { layoutBoxes } from '../../src/core/map.js';

/**
 * @param {string} name
 * @param {any} layout
 */
export function assertNoOverlap(name, layout) {
  const { boxes, segments } = layoutBoxes(layout);
  const shrink = (/** @type {any} */ b) => ({ ...b, x: b.x + 0.5, y: b.y + 0.5, w: b.w - 1, h: b.h - 1 });
  const hit = (/** @type {any} */ a, /** @type {any} */ b) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = shrink(boxes[i]);
      const b = shrink(boxes[j]);
      assert.ok(!hit(a, b), `${name}: ${a.kind}(${a.owner}) と ${b.kind}(${b.owner}) が重なる`);
    }
  }
  const stationAt = new Map(layout.stations.map((s) => [`${s.x},${s.y}`, s.info.id]));
  for (const seg of segments) {
    const ends = new Set([stationAt.get(`${seg.x1},${seg.y1}`), stationAt.get(`${seg.x2},${seg.y2}`)]);
    for (const b of boxes) {
      if (b.kind === 'plate' && ends.has(b.owner)) continue;
      if (b.kind === 'plate' && seg.y1 === seg.y2 && seg.y1 === b.y + b.h / 2 && onRow(layout, b.owner, seg)) continue;
      assert.ok(!segmentHitsBox(seg, shrink(b)), `${name}: 線(${seg.lineId}) が ${b.kind}(${b.owner}) に重なる`);
    }
  }
}

/** 水平の線が、同じ段の自分の路線の駅を通るのはよい。 @param {any} layout @param {string} id @param {any} seg */
function onRow(layout, id, seg) {
  const s = layout.stations.find((x) => x.info.id === id);
  return s && s.info.lineId === seg.lineId;
}

/** @param {{ x1: number, y1: number, x2: number, y2: number }} s @param {{ x: number, y: number, w: number, h: number }} b */
function segmentHitsBox(s, b) {
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const x = s.x1 + ((s.x2 - s.x1) * i) / steps;
    const y = s.y1 + ((s.y2 - s.y1) * i) / steps;
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
  }
  return false;
}
