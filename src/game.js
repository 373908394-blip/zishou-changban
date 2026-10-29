/* =============================================================================
 * game.js — 《字守长坂》垂直切片 · 主逻辑
 * 形态：经典 <script>（非 module），file:// 双击可直接运行。
 * 数据：所有数值/坐标/配置只读 window.GameData（data-schema.js）。
 *       几何/网格/合成判定复用 window.ZS（util.js）。
 * ========================================================================== */
(function () {
  'use strict';

  var GD = window.GameData;
  var ZS = window.ZS;

  /* ----------------------------- DOM 引用 ----------------------------- */
  var $ = function (id) { return document.getElementById(id); };
  var dom = {
    app: $('app'),
    screenMenu: $('screen-menu'), screenLevels: $('screen-levels'), gameStage: $('game-stage'),
    pauseOverlay: $('pause-overlay'), screenResult: $('screen-result'), howto: $('howto'),
    btnStart: $('btn-start'), btnHowto: $('btn-howto'), btnHowtoClose: $('btn-howto-close'),
    btnLevelsBack: $('btn-levels-back'), levelList: $('level-list'),
    txtMantou: $('txt-mantou'), txtHp: $('txt-hp'), hpDots: $('hp-dots'),
    txtWave: $('txt-wave'), waveStat: $('wave-stat'),
    btnPause: $('btn-pause'), btnRecruit: $('btn-recruit'), btnDeploy: $('btn-deploy'),
    recruitCost: $('recruit-cost'), hand: $('hand'), btnSkill: $('btn-skill'),
    fieldWrap: $('field-wrap'), field: $('field'), hint: $('txt-hint'),
    btnResume: $('btn-resume'), btnRetry: $('btn-retry'), btnExit: $('btn-exit'),
    resultSeal: $('result-seal'), resultTitle: $('result-title'), resultStats: $('result-stats'),
    btnNext: $('btn-next'), btnReplay: $('btn-replay'), btnResultBack: $('btn-result-back'),
    chkReduceMenu: $('chk-reduce-menu'), chkReducePause: $('chk-reduce-pause'),
    toast: $('toast')
  };

  var ctx = dom.field.getContext('2d');

  /* ----------------------------- 全局状态 ----------------------------- */
  var state = {
    mode: 'menu', paused: false, reduceMotion: false,
    mapId: null, map: null, path: null, pathCells: null, tile: 64,
    mantou: 0, baseHp: 0, baseMaxHp: 0,
    units: [], monsters: [], projectiles: [], effects: [], hand: [],
    spawner: null, kills: 0, result: null,
    unlocked: { changban: true, chibi: true }, cleared: {}, dragging: null, _last: 0, _uid: 1
  };

  function nextUid() { return state._uid++; }
  function descriptor(o) { return { char: o.char, category: o.category, tier: o.tier }; }

  function makeUnitInstance(defId, tier, col, row) {
    var def = GD.UNIT_DEFS[defId];
    var stats = ZS.deriveUnitStats(def, tier);
    var c = ZS.cellCenter(col, row, state.tile);
    return {
      uid: nextUid(), defId: defId, char: def.char, name: def.name,
      category: def.category, tier: tier, col: col, row: row, x: c.x, y: c.y,
      damage: stats.damage, range: stats.range, atkInterval: def.atkInterval,
      type: def.type, projectile: def.projectile, skillId: def.skillId, anim: def.anim,
      atkTimer: 0, skillCdTimer: 0, hitFlash: 0,
      animState: { state: 'idle', t: 0 }, facing: { x: 1, y: 0 },
      isHero: def.category === 'hero', skillAnim: null
    };
  }

  function makeFragmentInstance(char, col, row) {
    var c = ZS.cellCenter(col, row, state.tile);
    return {
      uid: nextUid(), defId: null, char: char, name: char,
      category: 'fragment', tier: 1, col: col, row: row, x: c.x, y: c.y,
      damage: 0, range: 0, atkInterval: 0, type: 'none', projectile: false,
      skillId: null, anim: null, atkTimer: 0, skillCdTimer: 0, hitFlash: 0,
      animState: { state: 'idle', t: 0 }, facing: { x: 1, y: 0 }, isHero: false, skillAnim: null
    };
  }

  function unitAt(col, row) {
    for (var i = 0; i < state.units.length; i++) {
      if (state.units[i].col === col && state.units[i].row === row) return state.units[i];
    }
    return null;
  }
  function unitByUid(uid) {
    for (var i = 0; i < state.units.length; i++) if (state.units[i].uid === uid) return state.units[i];
    return null;
  }
  function cellBuildable(col, row) {
    if (!ZS.inGrid(col, row, state.map)) return false;
    if (ZS.isPathCell(state.pathCells, col, row)) return false;
    return true;
  }

  /* ============================ 屏幕/模式 ============================ */
  function hideAllScreens() {
    [dom.screenMenu, dom.screenLevels, dom.gameStage, dom.pauseOverlay, dom.screenResult, dom.howto]
      .forEach(function (s) { s.classList.remove('active'); });
  }

  function setMode(mode) {
    state.mode = mode;
    hideAllScreens();
    if (mode === 'menu') {
      dom.screenMenu.classList.add('active');
    } else if (mode === 'levels') {
      dom.screenLevels.classList.add('active');
      renderLevelList();
    } else if (mode === 'prep' || mode === 'battle') {
      dom.gameStage.classList.add('active');
      dom.btnDeploy.classList.toggle('hidden', mode !== 'prep');
      dom.btnPause.classList.toggle('hidden', mode !== 'battle');
      dom.waveStat.classList.toggle('hidden', mode !== 'battle');
      dom.hint.style.display = (state.hand.length === 0) ? 'none' : '';
    } else if (mode === 'result') {
      dom.gameStage.classList.add('active');
      dom.screenResult.classList.add('active');
    }
    updateHud();
  }

  function renderLevelList() {
    dom.levelList.innerHTML = '';
    Object.keys(GD.MAPS).forEach(function (id) {
      var m = GD.MAPS[id];
      var unlocked = state.unlocked[id];
      var card = document.createElement('div');
      card.className = 'level-card' + (unlocked ? '' : ' locked');
      var star = state.cleared[id] ? '<div class="star">★ 已通关</div>' : '';
      card.innerHTML =
        '<h3>' + m.name + '</h3>' +
        '<p>' + m.gridW + '×' + m.gridH + ' · ' + GD.WAVES[id].length + ' 波</p>' +
        star +
        (unlocked ? '' : '<p>通关长坂坡后解锁</p>');
      if (unlocked) {
        var btn = document.createElement('button');
        btn.className = 'ink-btn primary';
        btn.textContent = '进入';
        btn.addEventListener('click', function () { startLevel(id); });
        card.appendChild(btn);
      }
      dom.levelList.appendChild(card);
    });
  }

  /* ============================ 关卡启动 ============================ */
  function startLevel(mapId) {
    var map = GD.getMap(mapId);
    if (!map) return;
    state.mapId = mapId;
    state.map = map;
    state.tile = map.tile;
    state.path = ZS.buildPath(map);
    state.pathCells = ZS.buildPathCells(map);

    var cfg = GD.GAME_CONFIG;
    state.mantou = cfg.START_MANTOU;
    state.baseMaxHp = cfg.BASE_HP;
    state.baseHp = cfg.BASE_HP;
    state.units = []; state.monsters = []; state.projectiles = []; state.effects = [];
    state.hand = []; state.kills = 0; state.result = null;
    state.paused = false; state.spawner = null; state.dragging = null;

    setupCanvas(); renderHand(); setMode('prep');
  }

  function setupCanvas() {
    var dpr = window.devicePixelRatio || 1;
    var W = state.map.gridW * state.tile;
    var H = state.map.gridH * state.tile;
    dom.field.width = Math.round(W * dpr);
    dom.field.height = Math.round(H * dpr);
    dom.field.style.width = W + 'px';
    dom.field.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ============================ 经济：征兵 ============================ */
  function recruit() {
    var cost = GD.GAME_CONFIG.RECRUIT_COST;
    if (state.mantou < cost) return;
    if (state.mode !== 'prep' && state.mode !== 'battle') return;
    state.mantou -= cost;
    var pick = ZS.weightedPick(GD.DRAW_POOL);
    if (!pick) return;
    var card = { uid: nextUid(), char: pick.char, category: pick.kind === 'fragment' ? 'fragment' : 'basic', tier: 1, defId: pick.defId };
    state.hand.push(card); renderHand(); updateHud();
  }

  function renderHand() {
    dom.hand.innerHTML = '';
    state.hand.forEach(function (card) {
      var el = document.createElement('div');
      el.className = 'card' + (card.category === 'fragment' ? ' fragment' : '');
      el.textContent = card.char;
      el.dataset.uid = card.uid;
      if (card.category === 'basic' && card.tier > 1) {
        var badge = document.createElement('span');
        badge.className = 'tier-badge'; badge.textContent = card.tier; el.appendChild(badge);
      }
      el.addEventListener('pointerdown', function (e) { onHandPointerDown(e, card); });
      dom.hand.appendChild(el);
    });
    dom.hint.style.display = (state.hand.length === 0) ? 'none' : '';
  }

  function removeHandCard(uid) { state.hand = state.hand.filter(function (c) { return c.uid !== uid; }); }

  /* ============================ 输入：拖拽 ============================ */
  var DRAG_THRESHOLD = 6;

  function clientToCanvas(clientX, clientY) {
    var rect = dom.field.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (dom.field.width / rect.width) / (window.devicePixelRatio || 1),
      y: (clientY - rect.top) * (dom.field.height / rect.height) / (window.devicePixelRatio || 1)
    };
  }

  function onHandPointerDown(e, card) {
    if (state.mode !== 'prep' && state.mode !== 'battle') return;
    e.preventDefault();
    state.dragging = {
      kind: 'hand', uid: card.uid, char: card.char, category: card.category,
      tier: card.tier, defId: card.defId,
      startX: e.clientX, startY: e.clientY, curX: e.clientX, curY: e.clientY,
      moved: false, originUid: null, originCol: null, originRow: null
    };
    e.target.classList.add('dragging');
  }

  function onCanvasPointerDown(e) {
    if (state.mode !== 'prep' && state.mode !== 'battle') return;
    if (state.dragging) return;
    var p = clientToCanvas(e.clientX, e.clientY);
    var cell = ZS.pixelToCell(p.x, p.y, state.tile);
    var u = unitAt(cell.col, cell.row);
    if (!u) return;
    e.preventDefault();
    state.dragging = {
      kind: 'unit', uid: u.uid, char: u.char, category: u.category,
      tier: u.tier, defId: u.defId,
      startX: e.clientX, startY: e.clientY, curX: e.clientX, curY: e.clientY,
      moved: false, originUid: u.uid, originCol: u.col, originRow: u.row
    };
  }

  function onPointerMove(e) {
    if (!state.dragging) return;
    var d = state.dragging;
    d.curX = e.clientX; d.curY = e.clientY;
    if (Math.abs(e.clientX - d.startX) > DRAG_THRESHOLD || Math.abs(e.clientY - d.startY) > DRAG_THRESHOLD) d.moved = true;
  }

  function onPointerUp(e) {
    var d = state.dragging;
    if (!d) return;
    state.dragging = null;
    var cards = dom.hand.querySelectorAll('.card.dragging');
    cards.forEach(function (c) { c.classList.remove('dragging'); });
    var p = clientToCanvas(e.clientX, e.clientY);
    var cell = ZS.pixelToCell(p.x, p.y, state.tile);
    if (!d.moved) {
      if (d.kind === 'unit') {
        var u = unitByUid(d.uid);
        if (u && u.isHero && u.skillId && u.skillCdTimer <= 0) triggerSkill(u);
      }
      return;
    }
    resolveDrop(d, cell);
  }

  /* ======================== 落子 / 合成 解析 ======================== */
  function resolveDrop(d, cell) {
    if (!ZS.inGrid(cell.col, cell.row, state.map)) return;
    if (ZS.isPathCell(state.pathCells, cell.col, cell.row)) { flashInvalid(cell); return; }
    var occupant = unitAt(cell.col, cell.row);
    if (d.kind === 'hand') {
      if (!occupant) { deployCard(d, cell); }
      else {
        var res = ZS.resolveMerge(descriptor(d), descriptor(occupant));
        if (res.type === 'tierup') { tierUp(occupant); removeHandCard(d.uid); }
        else if (res.type === 'recipe') { makeHero(cell, res.heroKey); removeHandCard(d.uid); }
        else { flashInvalid(cell); }
      }
    } else {
      if (!occupant) { moveUnit(d.uid, cell); }
      else if (occupant.uid === d.uid) { /* 落到自身，无操作 */ }
      else {
        var res2 = ZS.resolveMerge(descriptor(d), descriptor(occupant));
        if (res2.type === 'tierup') { tierUp(occupant); removeUnit(d.uid); }
        else if (res2.type === 'recipe') { makeHero(cell, res2.heroKey); removeUnit(d.uid); removeUnit(occupant.uid); }
        else { flashInvalid(cell); }
      }
    }
    renderHand(); updateHud();
  }

  function deployCard(d, cell) {
    if (d.category === 'fragment') state.units.push(makeFragmentInstance(d.char, cell.col, cell.row));
    else state.units.push(makeUnitInstance(d.defId, 1, cell.col, cell.row));
    removeHandCard(d.uid);
  }

  function tierUp(u) {
    u.tier += 1;
    var stats = ZS.deriveUnitStats(GD.UNIT_DEFS[u.defId], u.tier);
    u.damage = stats.damage; u.range = stats.range;
  }

  function makeHero(cell, heroKey) {
    var inst = makeUnitInstance(heroKey, GD.UNIT_DEFS[heroKey].tier, cell.col, cell.row);
    state.units.push(inst);
  }

  function moveUnit(uid, cell) {
    var u = unitByUid(uid); if (!u) return;
    u.col = cell.col; u.row = cell.row;
    var c = ZS.cellCenter(cell.col, cell.row, state.tile);
    u.x = c.x; u.y = c.y;
  }

  function removeUnit(uid) { state.units = state.units.filter(function (u) { return u.uid !== uid; }); }
  function flashInvalid(cell) { state.effects.push({ type: 'invalid', col: cell.col, row: cell.row, timer: 0.3, max: 0.3 }); }

  /* ============================ 战斗：出战 ============================ */
  var _toastTimer = null;
  function showToast(msg) {
    dom.toast.textContent = msg; dom.toast.classList.remove('hidden');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { dom.toast.classList.add('hidden'); }, 1600);
  }

  function beginBattle() {
    if (state.mode !== 'prep') return;
    if (state.units.length === 0) { showToast('至少部署一个单位再出战'); return; }
    setMode('battle');
    var waves = state.map.waves;
    state.spawner = { waveIndex: 0, phase: 'startDelay', timer: 0, groupIndex: 0, spawnedInGroup: 0, spawnTimer: 0, gapTimer: 0, waves: waves, lastIndex: waves.length - 1 };
  }

  /* ====================== 战斗：波次生成控制器 ====================== */
  function updateSpawner(dt) {
    var sp = state.spawner; if (!sp) return;
    var cfg = GD.GAME_CONFIG;
    if (sp.phase === 'startDelay') {
      sp.timer += dt;
      if (sp.timer >= sp.waves[sp.waveIndex].startDelay) { sp.phase = 'spawning'; sp.groupIndex = 0; sp.spawnedInGroup = 0; sp.spawnTimer = 0; }
    } else if (sp.phase === 'spawning') {
      var wave = sp.waves[sp.waveIndex];
      var group = wave.groups[sp.groupIndex];
      var gap = group.gap > 0 ? group.gap : 0.5;
      sp.spawnTimer += dt;
      while (sp.spawnTimer >= gap && sp.spawnedInGroup < group.count) { sp.spawnTimer -= gap; spawnMonster(group.type); sp.spawnedInGroup++; }
      if (sp.spawnedInGroup >= group.count) {
        sp.groupIndex++;
        sp.spawnedInGroup = 0; sp.spawnTimer = 0;
        if (sp.groupIndex >= wave.groups.length) sp.phase = 'waitingClear';
      }
    } else if (sp.phase === 'waitingClear') {
      if (state.monsters.length === 0) {
        addMantou(cfg.WAVE_BONUS);
        if (sp.waveIndex >= sp.lastIndex) { sp.phase = 'finalGap'; sp.gapTimer = 0; }
        else { sp.waveIndex++; sp.phase = 'startDelay'; sp.timer = 0; }
      }
    } else if (sp.phase === 'finalGap') {
      sp.gapTimer += dt;
      if (sp.gapTimer >= cfg.WAVE_GAP) winGame();
    }
  }

  function spawnMonster(type) {
    var def = GD.MONSTER_DEFS[type];
    var p0 = ZS.cellCenter(state.map.path[0].col, state.map.path[0].row, state.tile);
    state.monsters.push({ uid: nextUid(), defId: type, name: def.name, hp: def.hp, maxHp: def.hp, speed: def.speed, leakDamage: def.leakDamage, reward: def.reward, behavior: def.behavior, glyph: def.glyph, color: def.color, dist: 0, x: p0.x, y: p0.y, hitFlash: 0, stun: 0, dead: false });
  }

  function monsterCell(m) { return ZS.pixelToCell(m.x, m.y, state.tile); }

  function findTarget(u) {
    var rangePx = u.range * state.tile;
    var best = null, bestDist = -1;
    for (var i = 0; i < state.monsters.length; i++) {
      var m = state.monsters[i];
      if (m.dead) continue;
      var d = ZS.dist(u.x, u.y, m.x, m.y);
      if (d <= rangePx + state.tile * 0.15 && m.dist > bestDist) { bestDist = m.dist; best = m; }
    }
    return best;
  }

  function findNearestMonster(u) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < state.monsters.length; i++) {
      var m = state.monsters[i];
      if (m.dead) continue;
      var d = ZS.dist(u.x, u.y, m.x, m.y);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  }

  function damageMonster(m, dmg) {
    if (m.dead) return;
    m.hp -= dmg; m.hitFlash = GD.ANIM.HIT_FLASH;
    if (m.hp <= 0) { m.dead = true; state.kills++; addMantou(m.reward); }
  }

  function updateUnits(dt) {
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (u.hitFlash > 0) u.hitFlash -= dt;
      if (u.skillCdTimer > 0) u.skillCdTimer = Math.max(0, u.skillCdTimer - dt);
      if (u.skillAnim && u.skillAnim.timer > 0) u.skillAnim.timer -= dt;
      if (u.category === 'fragment') continue;
      var near = findTarget(u) || findNearestMonster(u);
      if (near) { var dx = near.x - u.x, dy = near.y - u.y, len = Math.sqrt(dx * dx + dy * dy) || 1; u.facing = { x: dx / len, y: dy / len }; }
      if (u.animState.state === 'attack') {
        u.animState.t += dt / GD.ANIM.ATK_ANIM;
        if (u.animState.t >= 1) { u.animState.state = 'idle'; u.animState.t = 0; applyAttack(u); }
      } else {
        u.atkTimer += dt;
        var tgt = findTarget(u);
        if (tgt && u.atkTimer >= u.atkInterval) { u.animState.state = 'attack'; u.animState.t = 0; u.atkTimer = 0; u.currentTarget = tgt; }
      }
    }
  }

  function applyAttack(u) {
    if (u.projectile) {
      var tgt = (u.currentTarget && !u.currentTarget.dead) ? u.currentTarget : findTarget(u);
      if (tgt) state.projectiles.push({ x: u.x, y: u.y, target: tgt, speed: GD.PROJECTILE_SPEED, damage: u.damage, color: '#1A1A1A' });
    } else {
      var tgt2 = (u.currentTarget && !u.currentTarget.dead) ? u.currentTarget : findTarget(u);
      if (tgt2) damageMonster(tgt2, u.damage);
    }
  }

  function updateMonsters(dt) {
    var T = state.tile;
    for (var i = 0; i < state.monsters.length; i++) {
      var m = state.monsters[i];
      if (m.dead) continue;
      if (m.hitFlash > 0) m.hitFlash -= dt;
      if (m.stun > 0) { m.stun -= dt; continue; }
      m.dist += m.speed * T * dt;
      var pt = ZS.pointAtDistance(state.path, m.dist);
      m.x = pt.x; m.y = pt.y;
      if (m.dist >= state.path.total) {
        m.dead = true; state.baseHp -= m.leakDamage;
        if (state.baseHp <= 0) { state.baseHp = 0; loseGame(); return; }
      }
    }
  }

  function updateProjectiles(dt) {
    for (var i = 0; i < state.projectiles.length; i++) {
      var p = state.projectiles[i];
      if (p.dead) continue;
      if (!p.target || p.target.dead) { p.dead = true; continue; }
      var dx = p.target.x - p.x, dy = p.target.y - p.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      var step = p.speed * dt;
      if (d <= step + 6) { damageMonster(p.target, p.damage); p.dead = true; }
      else { p.x += dx / d * step; p.y += dy / d * step; }
    }
  }

  function triggerSkill(u) {
    if (!u || !u.skillId || u.skillCdTimer > 0) return;
    var skill = GD.SKILLS[u.skillId];
    if (!skill) return;
    var nearest = findNearestMonster(u);
    if (!nearest) return;
    var mc = monsterCell(nearest);
    var dcol = mc.col - u.col, drow = mc.row - u.row;
    var axis, idx, dir;
    if (dcol === 0) { axis = 'col'; idx = u.col; dir = (mc.row >= u.row) ? 1 : -1; }
    else if (drow === 0) { axis = 'row'; idx = u.row; dir = (mc.col >= u.col) ? 1 : -1; }
    else if (Math.abs(dcol) >= Math.abs(drow)) { axis = 'col'; idx = u.col; dir = (dcol > 0) ? 1 : -1; }
    else { axis = 'row'; idx = u.row; dir = (drow > 0) ? 1 : -1; }
    for (var i = 0; i < state.monsters.length; i++) {
      var m = state.monsters[i];
      if (m.dead) continue;
      var c = monsterCell(m);
      if ((axis === 'row' && c.row === idx) || (axis === 'col' && c.col === idx)) damageMonster(m, u.damage * skill.damageMult);
    }
    state.effects.push({ type: 'pierce', axis: axis, idx: idx, x: u.x, y: u.y, timer: 0.3, max: 0.3 });
    u.skillAnim = { timer: 0.3, axis: axis, dir: dir };
    u.skillCdTimer = skill.cooldown;
    updateHud();
  }

  function updateEffects(dt) {
    for (var i = 0; i < state.effects.length; i++) state.effects[i].timer -= dt;
    state.effects = state.effects.filter(function (e) { return e.timer > 0; });
  }

  function addMantou(n) { state.mantou += n; updateHud(); }

  function winGame() {
    if (state.mode === 'result') return;
    state.mantou += GD.GAME_CONFIG.CLEAR_BONUS;
    state.cleared[state.mapId] = true;
    if (state.mapId === 'changban') state.unlocked.chibi = true;
    state.result = 'win'; setMode('result'); showResult();
  }

  function loseGame() {
    if (state.mode === 'result') return;
    state.result = 'lose'; setMode('result'); showResult();
  }

  function showResult() {
    var win = state.result === 'win';
    dom.resultSeal.textContent = win ? '过关' : '败';
    dom.resultSeal.classList.toggle('lose', !win);
    dom.resultTitle.textContent = state.map.name + (win ? ' · 过关' : ' · 失守');
    var stats = ['是否守住阿斗：<b>' + (win ? '是' : '否') + '</b>', '击杀敌军：<b>' + state.kills + '</b>', '剩余馒头：<b>' + state.mantou + '</b>'];
    if (win && state.mapId === 'changban' && !state._chibiNoted) stats.push('已解锁新关卡：<b>赤壁</b>');
    dom.resultStats.innerHTML = stats.map(function (s) { return '<li>' + s + '</li>'; }).join('');
    var nextId = nextMapId(state.mapId);
    var canNext = win && nextId && state.unlocked[nextId];
    dom.btnNext.classList.toggle('hidden', !canNext);
    if (canNext) dom.btnNext.onclick = function () { startLevel(nextId); };
  }

  function nextMapId(id) {
    var keys = Object.keys(GD.MAPS);
    var i = keys.indexOf(id);
    return (i >= 0 && i + 1 < keys.length) ? keys[i + 1] : null;
  }

  function update(dt) {
    if (state.monsters) updateSpawner(dt);
    updateUnits(dt); updateMonsters(dt); updateProjectiles(dt); updateEffects(dt);
    state.monsters = state.monsters.filter(function (m) { return !m.dead; });
    state.projectiles = state.projectiles.filter(function (p) { return !p.dead; });
  }

  /* ============================ 渲染 ============================ */
  function render() {
    var T = state.tile;
    var W = state.map ? state.map.gridW * T : dom.field.width;
    var H = state.map ? state.map.gridH * T : dom.field.height;
    ctx.clearRect(0, 0, W, H);
    if (!state.map || (state.mode !== 'prep' && state.mode !== 'battle' && state.mode !== 'result')) {
      ctx.fillStyle = '#F4EFE3'; ctx.fillRect(0, 0, W, H); return;
    }
    ctx.fillStyle = '#F4EFE3'; ctx.fillRect(0, 0, W, H);
    drawGrid(T); drawPath(T); drawBase(T);
    for (var i = 0; i < state.units.length; i++) drawUnit(state.units[i], T);
    for (var j = 0; j < state.monsters.length; j++) drawMonster(state.monsters[j], T);
    for (var k = 0; k < state.projectiles.length; k++) drawProjectile(state.projectiles[k]);
    for (var e = 0; e < state.effects.length; e++) drawEffect(state.effects[e], T);
    if (state.dragging && state.dragging.moved) drawDragGhost(state.dragging, T);
  }

  function drawGrid(T) {
    ctx.strokeStyle = 'rgba(26,26,26,0.10)'; ctx.lineWidth = 1;
    for (var c = 0; c <= state.map.gridW; c++) { ctx.beginPath(); ctx.moveTo(c * T, 0); ctx.lineTo(c * T, state.map.gridH * T); ctx.stroke(); }
    for (var r = 0; r <= state.map.gridH; r++) { ctx.beginPath(); ctx.moveTo(0, r * T); ctx.lineTo(state.map.gridW * T, r * T); ctx.stroke(); }
  }

  function drawPath(T) {
    ctx.fillStyle = 'rgba(26,26,26,0.07)';
    for (var key in state.pathCells) {
      if (!state.pathCells.hasOwnProperty(key)) continue;
      var parts = key.split(','); var c = +parts[0], r = +parts[1];
      ctx.fillRect(c * T, r * T, T, T);
    }
    var p = state.map.path;
    ctx.strokeStyle = 'rgba(26,26,26,0.45)'; ctx.lineWidth = Math.max(6, T * 0.18);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < p.length; i++) { var cc = ZS.cellCenter(p[i].col, p[i].row, T); if (i === 0) ctx.moveTo(cc.x, cc.y); else ctx.lineTo(cc.x, cc.y); }
    ctx.stroke();
  }

  function drawBase(T) {
    var b = state.map.base; var c = ZS.cellCenter(b.col, b.row, T);
    ctx.save(); ctx.translate(c.x, c.y);
    ctx.fillStyle = 'rgba(192,57,43,0.12)'; ctx.fillRect(-T / 2 + 2, -T / 2 + 2, T - 4, T - 4);
    ctx.strokeStyle = '#C0392B'; ctx.lineWidth = 3; ctx.strokeRect(-T / 2 + 3, -T / 2 + 3, T - 6, T - 6);
    ctx.fillStyle = '#C0392B'; ctx.font = Math.max(28, T * 0.5) + "px 'KaiTi','STKaiti','Songti SC',serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('斗', 0, 0); ctx.restore();
  }

  function glyphFontSize(char, T) {
    if (char.length === 1) return Math.max(48, Math.min(T * 0.85, T));
    return Math.max(22, Math.min(T * 0.9 / char.length, T));
  }

  function drawMultiline(char, fs) {
    if (char.length === 1) { ctx.fillText(char, 0, 0); return; }
    var lineH = fs * 1.02; var startY = -(char.length - 1) * lineH / 2;
    for (var i = 0; i < char.length; i++) ctx.fillText(char[i], 0, startY + i * lineH);
  }

  function drawUnit(u, T) {
    var fs = glyphFontSize(u.char, T);
    ctx.save(); ctx.translate(u.x, u.y);
    if (u.hitFlash > 0 && !state.reduceMotion) { ctx.translate((Math.random() * 2 - 1) * GD.ANIM.hit.jitter, (Math.random() * 2 - 1) * GD.ANIM.hit.jitter); }
    if (!state.reduceMotion && u.animState.state === 'attack') applyAttackTransform(u, T);
    if (!state.reduceMotion && u.skillAnim && u.skillAnim.timer > 0) applySkillLunge(u, T);
    ctx.font = fs + "px 'KaiTi','STKaiti','Songti SC',serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = u.isHero ? '#C0392B' : (u.category === 'fragment' ? '#7a6a4a' : '#1A1A1A');
    drawMultiline(u.char, fs);
    if (u.hitFlash > 0) { ctx.lineWidth = 3; ctx.strokeStyle = GD.ANIM.hit.red; ctx.strokeText(u.char, 0, 0); }
    ctx.restore();
    if (!state.reduceMotion && u.animState.state === 'attack' && u.anim === 'dao' && GD.ANIM.dao.slashArc) drawSlashArc(u, T);
  }

  function applyAttackTransform(u, T) {
    var t = u.animState.t; var a = u.anim;
    if (a === 'dao') { ctx.rotate((-35 + 35 * t) * Math.PI / 180); }
    else if (a === 'qiang') { var sx = 1 + 0.4 * Math.sin(t * Math.PI); ctx.scale(sx, 1); ctx.translate(u.facing.x * 0.2 * T * Math.sin(t * Math.PI), u.facing.y * 0.2 * T * Math.sin(t * Math.PI)); }
    else if (a === 'gong') { var gsx = 0.8 + 0.3 * Math.sin(t * Math.PI); ctx.scale(gsx, 1); }
    else if (a === 'qi') { ctx.translate(u.facing.x * 0.5 * T * Math.sin(t * Math.PI), u.facing.y * 0.5 * T * Math.sin(t * Math.PI)); }
  }

  function applySkillLunge(u, T) {
    var p = 1 - u.skillAnim.timer / 0.3; var off = T * Math.sin(p * Math.PI);
    if (u.skillAnim.axis === 'col') ctx.translate(u.skillAnim.dir * off, 0); else ctx.translate(0, u.skillAnim.dir * off);
  }

  function drawSlashArc(u, T) {
    var r = u.range * T * 0.6;
    ctx.save(); ctx.translate(u.x, u.y);
    ctx.strokeStyle = 'rgba(26,26,26,0.55)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, r, -45 * Math.PI / 180, 10 * Math.PI / 180); ctx.stroke(); ctx.restore();
  }

  function drawMonster(m, T) {
    var fs = Math.max(48, Math.min(T * 0.85, T));
    ctx.save(); ctx.translate(m.x, m.y);
    if (m.hitFlash > 0 && !state.reduceMotion) { ctx.translate((Math.random() * 2 - 1) * GD.ANIM.hit.jitter, (Math.random() * 2 - 1) * GD.ANIM.hit.jitter); }
    var rad = T * 0.40;
    ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fillStyle = m.color; ctx.fill();
    ctx.fillStyle = '#F4EFE3'; ctx.font = fs + "px 'KaiTi','STKaiti','Songti SC',serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m.glyph, 0, 0);
    if (m.hitFlash > 0) { ctx.lineWidth = 3; ctx.strokeStyle = GD.ANIM.hit.red; ctx.stroke(); }
    ctx.restore();
    var bw = T * 0.8, bh = Math.max(4, T * 0.08); var bx = m.x - bw / 2, by = m.y - rad - bh - 3;
    ctx.fillStyle = 'rgba(26,26,26,0.25)'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#C0392B'; ctx.fillRect(bx, by, bw * ZS.clamp(m.hp / m.maxHp, 0, 1), bh);
  }

  function drawProjectile(p) {
    ctx.save(); ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  function drawEffect(e, T) {
    if (e.type === 'pierce') {
      if (state.reduceMotion) return;
      var alpha = ZS.clamp(e.timer / e.max, 0, 1);
      ctx.save(); ctx.globalAlpha = alpha * 0.8; ctx.strokeStyle = '#C0392B'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      if (e.axis === 'col') { var x = e.idx * T + T / 2; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, state.map.gridH * T); ctx.stroke(); }
      else { var y = e.idx * T + T / 2; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(state.map.gridW * T, y); ctx.stroke(); }
      ctx.restore();
    } else if (e.type === 'invalid') {
      var alpha2 = ZS.clamp(e.timer / e.max, 0, 1);
      ctx.save(); ctx.globalAlpha = alpha2; ctx.strokeStyle = '#888'; ctx.lineWidth = 2;
      ctx.strokeRect(e.col * T + 3, e.row * T + 3, T - 6, T - 6); ctx.restore();
    }
  }

  function drawDragGhost(d, T) {
    var p = clientToCanvas(d.curX, d.curY);
    var fs = glyphFontSize(d.char, T);
    ctx.save(); ctx.globalAlpha = 0.85; ctx.translate(p.x, p.y);
    ctx.font = fs + "px 'KaiTi','STKaiti','Songti SC',serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = d.category === 'fragment' ? '#7a6a4a' : '#1A1A1A';
    drawMultiline(d.char, fs); ctx.restore();
  }

  /* ============================ HUD 更新 ============================ */
  function updateHud() {
    if (!state.map) return;
    dom.txtMantou.textContent = Math.floor(state.mantou);
    dom.txtHp.textContent = Math.max(0, state.baseHp);
    dom.recruitCost.textContent = GD.GAME_CONFIG.RECRUIT_COST;
    var dots = '';
    for (var i = 0; i < state.baseMaxHp; i++) dots += '<i class="' + (i < state.baseHp ? '' : 'empty') + '"></i>';
    dom.hpDots.innerHTML = dots;
    if (state.spawner) { var w = Math.min(state.spawner.waveIndex + 1, state.spawner.waves.length); dom.txtWave.textContent = w + '/' + state.spawner.waves.length; }
    else { dom.txtWave.textContent = '0/' + (state.map.waves ? state.map.waves.length : 0); }
    var canRecruit = state.mantou >= GD.GAME_CONFIG.RECRUIT_COST && (state.mode === 'prep' || state.mode === 'battle');
    dom.btnRecruit.disabled = !canRecruit;
    var hero = null;
    for (var k = 0; k < state.units.length; k++) { var u = state.units[k]; if (u.isHero && u.skillId) { hero = u; break; } }
    if (hero && state.mode === 'battle') {
      dom.btnSkill.classList.remove('hidden');
      if (hero.skillCdTimer <= 0) { dom.btnSkill.disabled = false; dom.btnSkill.textContent = '贯穿'; }
      else { dom.btnSkill.disabled = true; dom.btnSkill.textContent = '贯穿 ' + Math.ceil(hero.skillCdTimer) + 's'; }
    } else { dom.btnSkill.classList.add('hidden'); }
  }

  /* ============================ 帧循环 ============================ */
  function loop(t) {
    if (!state._last) state._last = t;
    var dt = (t - state._last) / 1000; state._last = t;
    if (dt > 0.05) dt = 0.05;
    if (state.mode === 'battle' && !state.paused) update(dt);
    render(); updateHud(); requestAnimationFrame(loop);
  }

  function togglePause(force) {
    if (state.mode !== 'battle') return;
    state.paused = (force != null) ? force : !state.paused;
    dom.pauseOverlay.classList.toggle('active', state.paused);
  }

  /* ============================ 事件绑定 ============================ */
  function bindEvents() {
    dom.btnStart.addEventListener('click', function () { setMode('levels'); });
    dom.btnHowto.addEventListener('click', function () { dom.howto.classList.add('active'); });
    dom.btnHowtoClose.addEventListener('click', function () { dom.howto.classList.remove('active'); });
    dom.btnLevelsBack.addEventListener('click', function () { setMode('menu'); });
    dom.btnRecruit.addEventListener('click', recruit);
    dom.btnDeploy.addEventListener('click', beginBattle);
    dom.btnSkill.addEventListener('click', function () { var hero = null; for (var k = 0; k < state.units.length; k++) if (state.units[k].isHero && state.units[k].skillId) { hero = state.units[k]; break; } triggerSkill(hero); });
    dom.btnPause.addEventListener('click', function () { togglePause(true); });
    dom.btnResume.addEventListener('click', function () { togglePause(false); });
    dom.btnRetry.addEventListener('click', function () { startLevel(state.mapId); });
    dom.btnExit.addEventListener('click', function () { state.paused = false; dom.pauseOverlay.classList.remove('active'); setMode('levels'); });
    dom.btnReplay.addEventListener('click', function () { startLevel(state.mapId); });
    dom.btnResultBack.addEventListener('click', function () { setMode('levels'); });
    function setReduce(v) { state.reduceMotion = v; dom.chkReduceMenu.checked = v; dom.chkReducePause.checked = v; }
    dom.chkReduceMenu.addEventListener('change', function () { setReduce(dom.chkReduceMenu.checked); });
    dom.chkReducePause.addEventListener('change', function () { setReduce(dom.chkReducePause.checked); });
    dom.field.addEventListener('pointerdown', onCanvasPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function init() { bindEvents(); setMode('menu'); requestAnimationFrame(loop); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
