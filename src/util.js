/* =============================================================================
 * util.js — 《字守长坂》纯函数工具集
 * -----------------------------------------------------------------------------
 * 作用：几何/网格/随机/合成判定等无副作用工具，浏览器与 Node 端均可复用。
 * 形态：UMD 风格（window.ZS + module.exports），经典 <script> 引入，无构建。
 * 约定：不在此硬编码任何玩法数值；仅在使用时读取全局 GameData。
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

  // 稳定读取数据源：浏览器内置全局 const、UMD window、Node global 三路兜底
  function _GD() {
    if (typeof GameData !== 'undefined' && GameData) return GameData;
    if (typeof window !== 'undefined' && window.GameData) return window.GameData;
    if (typeof global !== 'undefined' && global.GameData) return global.GameData;
    return null;
  }

  /* --------------------------- 加权随机抽字 --------------------------- */
  // pool: [{weight, ...}]；返回选中的那一项（或 null）。rand 可注入便于测试。
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
  // 格中心像素：pixel = col*TILE + TILE/2
  function cellCenter(col, row, tile) {
    return { x: col * tile + tile / 2, y: row * tile + tile / 2 };
  }
  // 像素 -> 格（整数 floor）
  function pixelToCell(x, y, tile) {
    return { col: Math.floor(x / tile), row: Math.floor(y / tile) };
  }
  function inGrid(col, row, map) {
    return col >= 0 && row >= 0 && col < map.gridW && row < map.gridH;
  }

  /* ----------------------- 路径几何（waypoints） ----------------------- */
  // 预计算路径段（像素）。spawn 可能 col=-1（屏外），cellCenter 自然处理。
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

  // 沿路径行进 d(像素)：返回 {x,y,dirx,diry}（dir 为当前段方向向量，未归一）
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

  // 路径覆盖的网格格集合（用于高亮 + 禁建）。屏外(col<0)与越界格排除。
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
  // 纯函数：传入 src/dst 描述符 {char,category,tier}。
  // 优先级（与 gdd-merge 一致，并新增两字武将喂升）：
  //   1) 武将喂升：任一方为「武将」，另一方为任意一个字（basic/fragment/hero）→ 武将升阶
  //   2) 碎片+碎片 → 命中配方则出武将（recipe）
  //   3) 同字同阶基础兵 → 升阶（tierup，封顶 3）
  //   4) 其余 → none
  // 返回 {type:'tierup'|'recipe'|'heroUp'|'none', heroKey?, reason?}
  function resolveMerge(src, dst) {
    var GD = _GD();
    var maxHero = (GD && GD.GAME_CONFIG && GD.GAME_CONFIG.HERO_MAX_TIER) ? GD.GAME_CONFIG.HERO_MAX_TIER : 5;

    // 1) 武将喂升（任一方为武将，另一方为任意一个字 / 另一武将）
    var srcHero = src.category === 'hero';
    var dstHero = dst.category === 'hero';
    if (srcHero || dstHero) {
      var hero = srcHero ? src : dst;
      var other = srcHero ? dst : src;
      if (other.category === 'hero' || other.category === 'basic' || other.category === 'fragment') {
        if (hero.tier >= maxHero) return { type: 'none', reason: 'max' };
        return { type: 'heroUp' };
      }
      return { type: 'none' };
    }

    // 2) 碎片 + 碎片 → 配方出武将
    if (src.category === 'fragment' && dst.category === 'fragment') {
      if (GD) {
        var key = src.char + '+' + dst.char;
        var heroKey = GD.RECIPES[key];
        if (heroKey && GD.UNIT_DEFS[heroKey]) return { type: 'recipe', heroKey: heroKey };
      }
      return { type: 'none' };
    }

    // 3) 同字同阶基础兵 → 升阶
    if (src.category === 'basic' && dst.category === 'basic') {
      if (src.char === dst.char && src.tier === dst.tier && dst.tier < 3) return { type: 'tierup' };
      return { type: 'none' };
    }
    return { type: 'none' };
  }

  /* ----------------------- 单位实例属性派生 ----------------------- */
  // 基础兵：damage = def.damage * TIER_MULT[tier]；range = def.range + (tier-1)*0.2
  // 武将：damage = def.damage * HERO_TIER_MULT[tier]（一阶=基准值，喂升越高越强）；range 固定为 def.range
  function deriveUnitStats(def, tier) {
    var GD = _GD();
    if (def.category === 'hero') {
      var hm = (GD && GD.HERO_TIER_MULT && GD.HERO_TIER_MULT[tier] != null) ? GD.HERO_TIER_MULT[tier] : 1.0;
      return { damage: def.damage * hm, range: def.range };
    }
    var mult = (GD && GD.TIER_MULT && GD.TIER_MULT[tier] != null) ? GD.TIER_MULT[tier] : 1.0;
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
