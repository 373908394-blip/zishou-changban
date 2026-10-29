/* =============================================================================
 * util.js — 《字守长坂》纯函数工具集
 * 形态：UMD 风格（window.ZS + module.exports），经典 <script> 引入，无构建。
 * ========================================================================== */
(function (root, factory) {
  var ZS = factory();
  if (typeof window !== 'undefined') window.ZS = ZS;
  if (typeof module !== 'undefined' && module.exports) module.exports = ZS;
})(this, function () {
  'use strict';

  /* ----------------------------- 基础数学 ----------------------------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }

  /* --------------------------- 加权随机抽字 --------------------------- */
  function weightedPick(pool, rand) {
    rand = rand || Math.random;
    var total = 0, i;
    for (i = 0; i < pool.length; i++) total += (pool[i].weight || 0);
    if (total <= 0) return null;
    var r = rand() * total;
    for (i = 0; i < pool.length; i++) {
      r -= (pool[i].weight || 0);
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  /* --------------------------- 网格 <-> 像素 --------------------------- */
  function cellCenter(col, row, tile) {
    return { x: col * tile + tile / 2, y: row * tile + tile / 2 };
  }
  function pixelToCell(x, y, tile) {
    return { col: Math.floor(x / tile), row: Math.floor(y / tile) };
  }
  function inGrid(col, row, map) {
    return col >= 0 && row >= 0 && col < map.gridW && row < map.gridH;
  }

  /* ----------------------- 路径几何（waypoints） ----------------------- */
  function buildPath(map) {
    var tile = map.tile, p = map.path, segs = [], total = 0, i;
    for (i = 0; i < p.length - 1; i++) {
      var a = cellCenter(p[i].col, p[i].row, tile);
      var b = cellCenter(p[i + 1].col, p[i + 1].row, tile);
      var len = dist(a.x, a.y, b.x, b.y);
      segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, len: len });
      total += len;
    }
    return { segs: segs, total: total };
  }

  function pointAtDistance(path, d) {
    var segs = path.segs, acc = 0, i;
    if (d <= 0) {
      var s0 = segs[0];
      return { x: s0.x1, y: s0.y1, dirx: (s0.x2 - s0.x1), diry: (s0.y2 - s0.y1) };
    }
    for (i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (acc + s.len >= d) {
        var t = (d - acc) / s.len;
        return { x: lerp(s.x1, s.x2, t), y: lerp(s.y1, s.y2, t), dirx: (s.x2 - s.x1), diry: (s.y2 - s.y1) };
      }
      acc += s.len;
    }
    var sl = segs[segs.length - 1];
    return { x: sl.x2, y: sl.y2, dirx: 0, diry: 0 };
  }

  function buildPathCells(map) {
    var set = {}, p = map.path, i;
    for (i = 0; i < p.length - 1; i++) {
      var a = p[i], b = p[i + 1];
      if (a.row === b.row) {
        var c1 = Math.min(a.col, b.col), c2 = Math.max(a.col, b.col), c;
        for (c = c1; c <= c2; c++) {
          if (c >= 0 && c < map.gridW && a.row >= 0 && a.row < map.gridH) set[c + ',' + a.row] = true;
        }
      } else if (a.col === b.col) {
        var r1 = Math.min(a.row, b.row), r2 = Math.max(a.row, b.row), r;
        for (r = r1; r <= r2; r++) {
          if (a.col >= 0 && a.col < map.gridW && r >= 0 && r < map.gridH) set[a.col + ',' + r] = true;
        }
      }
    }
    return set;
  }
  function isPathCell(cellSet, col, row) { return !!cellSet[col + ',' + row]; }

  /* ----------------------------- 合成判定 ----------------------------- */
  function resolveMerge(src, dst) {
    var GD = (typeof GameData !== 'undefined') ? GameData : null;
    if (src.category === 'fragment' && dst.category === 'fragment') {
      if (GD) {
        var key = src.char + '+' + dst.char;
        var heroKey = GD.RECIPES[key];
        if (heroKey && GD.UNIT_DEFS[heroKey]) return { type: 'recipe', heroKey: heroKey };
      }
      return { type: 'none' };
    }
    if (src.category === 'basic' && dst.category === 'basic') {
      if (src.char === dst.char && src.tier === dst.tier && dst.tier < 3) return { type: 'tierup' };
      return { type: 'none' };
    }
    return { type: 'none' };
  }

  /* ----------------------- 单位实例属性派生 ----------------------- */
  function deriveUnitStats(def, tier) {
    if (def.category === 'hero') {
      return { damage: def.damage, range: def.range };
    }
    var GD = (typeof GameData !== 'undefined') ? GameData : null;
    var mult = GD ? (GD.TIER_MULT[tier] != null ? GD.TIER_MULT[tier] : 1.0) : 1.0;
    return {
      damage: def.damage * mult,
      range: def.range + (tier - 1) * 0.2
    };
  }

  return {
    clamp: clamp, lerp: lerp, dist: dist, dist2: dist2,
    weightedPick: weightedPick,
    cellCenter: cellCenter, pixelToCell: pixelToCell, inGrid: inGrid,
    buildPath: buildPath, pointAtDistance: pointAtDistance,
    buildPathCells: buildPathCells, isPathCell: isPathCell,
    resolveMerge: resolveMerge, deriveUnitStats: deriveUnitStats
  };
});
