/* =============================================================================
 * game.js — 《字守长坂》垂直切片 · 主逻辑
 * -----------------------------------------------------------------------------
 * 形态：经典 <script>（非 module），file:// 双击可直接运行。
 * 数据：所有数值/坐标/配置只读 window.GameData（data-schema.js）。
 *       几何/网格/合成判定复用 window.ZS（util.js）。
 * 模块划分（见 docs/architecture/architecture.md）：
 *   - 屏幕状态机（menu/levels/prep/battle/result + pause）
 *   - 经济与合成（recruit / deploy / merge）
 *   - 战斗（wave spawner / unit attack / projectile / monster walk / skill）
 *   - 渲染（Canvas：网格/路径/据点/单位/怪物/弹道/特效/拖拽残影）
 *   - 输入（Pointer Events 统一鼠标+触摸）
 *   - 帧循环（rAF + delta-time，暂停冻结逻辑与计时）
 * ========================================================================== */
(function () {
  'use strict';

  var GD = window.GameData;
  var ZS = window.ZS;

  /* --------------------- 音效（WebAudio 合成，零素材，带节流） --------------------- */
  var audio = (function () {
    var ac = null, master = null, on = true, lastAtk = 0, lastHit = 0;
    function ensure() {
      if (ac) return ac;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ac = new AC(); } catch (e) { return null; }
      master = ac.createGain(); master.gain.value = 0.22; master.connect(ac.destination);
      return ac;
    }
    function resume() { var c = ensure(); if (c && c.state === 'suspended') { try { c.resume(); } catch (e) { } } }
    function tone(freq, dur, type, vol, slideTo) {
      if (!on) return; var c = ensure(); if (!c) return;
      var t0 = c.currentTime;
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo != null) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + dur + 0.03);
    }
    function seq(freqs, step, dur, type, vol) {
      freqs.forEach(function (f, i) { setTimeout(function () { tone(f, dur, type, vol); }, i * step); });
    }
    return {
      resume: resume,
      setOn: function (v) { on = !!v; if (v) resume(); },
      isOn: function () { return on; },
      ui: function () { tone(620, 0.04, 'square', 0.07, 520); },
      attack: function (kind) {
        var now = Date.now(); if (now - lastAtk < 70) return; lastAtk = now;
        if (kind === 'gong') tone(560, 0.05, 'triangle', 0.13, 320);
        else if (kind === 'dao') tone(190, 0.08, 'sawtooth', 0.12, 120);
        else if (kind === 'qiang') tone(340, 0.07, 'square', 0.1, 190);
        else tone(150, 0.09, 'sawtooth', 0.12, 90);
      },
      hit: function () { var now = Date.now(); if (now - lastHit < 55) return; lastHit = now; tone(95, 0.06, 'sine', 0.13, 60); },
      merge: function () { seq([440, 660], 70, 0.09, 'triangle', 0.18); },
      hero: function () { seq([523, 659, 784], 85, 0.12, 'triangle', 0.2); },
      skill: function (vfx) {
        if (vfx === 'pierce') tone(220, 0.18, 'sawtooth', 0.2, 950);
        else if (vfx === 'stun') tone(130, 0.26, 'sine', 0.24, 48);
        else {
          for (var i = 0; i < 8; i++) (function (k) {
            setTimeout(function () { tone(680 + Math.random() * 420, 0.05, 'triangle', 0.1, 300); }, k * 45);
          })(i);
        }
      },
      win: function () { seq([523, 659, 784, 1047], 120, 0.15, 'triangle', 0.2); },
      lose: function () { seq([392, 330, 262, 196], 140, 0.2, 'sine', 0.18); },
      error: function () { tone(160, 0.12, 'square', 0.11, 90); }
    };
  })();

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
    chkSoundMenu: $('chk-sound-menu'), chkSoundPause: $('chk-sound-pause'),
    toast: $('toast')
  };

  var ctx = dom.field.getContext('2d');

  /* ----------------------------- 全局状态 ----------------------------- */
  var state = {
    mode: 'menu',          // menu | levels | prep | battle | result
    paused: false,
    hitStop: 0,            // 技能命中顿帧（秒）：>0 时冻结逻辑、仅渲染
    reduceMotion: false,
    mapId: null,
    map: null,             // 解析后的地图（含 waves）
    path: null,            // ZS.buildPath 结果
    pathCells: null,       // 路径格集合
    tile: 64,
    mantou: 0,
    baseHp: 0, baseMaxHp: 0,
    units: [],             // 战场单位（basic/hero/fragment）
    monsters: [],
    projectiles: [],
    effects: [],           // 技能/受击特效
    hand: [],              // 手牌 {uid,char,category,tier,defId}
    spawner: null,
    kills: 0,
    result: null,          // 'win' | 'lose'
    unlocked: { changban: true, chibi: true }, // 评审默认全解锁（gdd-ux-flow）
    cleared: {},           // 已通关记录
    dragging: null,        // 拖拽上下文
    _last: 0,
    _uid: 1
  };

  function nextUid() { return state._uid++; }

  /* --------------------------- 派生/描述符 --------------------------- */
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
      dom.gameStage.classList.add('active');      // 战场作背景
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
    state.units = [];
    state.monsters = [];
    state.projectiles = [];
    state.effects = [];
    state.hand = [];
    state.kills = 0;
    state.result = null;
    state.paused = false;
    state.hitStop = 0;
    state.spawner = null;
    state.dragging = null;

    setupCanvas();
    renderHand();
    setMode('prep');
  }

  function setupCanvas() {
    var dpr = window.devicePixelRatio || 1;
    var W = state.map.gridW * state.tile;
    var H = state.map.gridH * state.tile;
    dom.field.width = Math.round(W * dpr);
    dom.field.height = Math.round(H * dpr);
    dom.field.style.width = W + 'px';
    dom.field.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);  // 之后绘制均用 CSS 像素坐标
  }

  /* ============================ 经济：征兵 ============================ */
  function recruit() {
    var cost = GD.GAME_CONFIG.RECRUIT_COST;
    if (state.mantou < cost) return;
    if (state.mode !== 'prep' && state.mode !== 'battle') return;
    state.mantou -= cost;
    var pick = ZS.weightedPick(GD.DRAW_POOL);
    if (!pick) return;
    var card = {
      uid: nextUid(),
      char: pick.char,
      category: pick.kind === 'fragment' ? 'fragment' : 'basic',
      tier: 1,
      defId: pick.defId
    };
    state.hand.push(card);
    audio.ui();
    renderHand();
    updateHud();
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
        badge.className = 'tier-badge';
        badge.textContent = card.tier;
        el.appendChild(badge);
      }
      el.addEventListener('pointerdown', function (e) { onHandPointerDown(e, card); });
      dom.hand.appendChild(el);
    });
    dom.hint.style.display = (state.hand.length === 0) ? 'none' : '';
  }

  function removeHandCard(uid) {
    state.hand = state.hand.filter(function (c) { return c.uid !== uid; });
  }

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
    if (Math.abs(e.clientX - d.startX) > DRAG_THRESHOLD || Math.abs(e.clientY - d.startY) > DRAG_THRESHOLD) {
      d.moved = true;
    }
  }

  function onPointerUp(e) {
    var d = state.dragging;
    if (!d) return;
    state.dragging = null;
    // 清除手牌拖拽视觉
    var cards = dom.hand.querySelectorAll('.card.dragging');
    cards.forEach(function (c) { c.classList.remove('dragging'); });

    var p = clientToCanvas(e.clientX, e.clientY);
    var cell = ZS.pixelToCell(p.x, p.y, state.tile);

    // 未移动 = 轻点：若为赵云且技能就绪则触发技能
    if (!d.moved) {
      if (d.kind === 'unit') {
        var u = unitByUid(d.uid);
        if (u && u.isHero && u.skillId && u.skillCdTimer <= 0) triggerSkill(u);
      }
      return; // 其余轻点视为取消
    }

    resolveDrop(d, cell);
  }

  /* ======================== 落子 / 合成 解析 ======================== */
  function resolveDrop(d, cell) {
    // 目标在棋盘外 -> 取消（手牌回手；场上单位留在原地）
    if (!ZS.inGrid(cell.col, cell.row, state.map)) return;
    // 路径/据点格禁建 -> 非法回弹
    if (ZS.isPathCell(state.pathCells, cell.col, cell.row)) { flashInvalid(cell); return; }

    var occupant = unitAt(cell.col, cell.row);

    if (d.kind === 'hand') {
      if (!occupant) {
        deployCard(d, cell);
      } else {
        var res = ZS.resolveMerge(descriptor(d), descriptor(occupant));
        if (res.type === 'heroUp') {
          if (occupant.isHero) {
            if (heroUp(occupant)) removeHandCard(d.uid);
          } else { flashInvalid(cell); }
        } else if (res.type === 'tierup') {
          tierUp(occupant); removeHandCard(d.uid);
        } else if (res.type === 'recipe') {
          makeHero(cell, res.heroKey); removeHandCard(d.uid);
        } else {
          flashInvalid(cell);
          if (res.reason === 'max') maxToast(occupant);
        }
      }
    } else { // 拖动场上已有单位
      if (!occupant) {
        moveUnit(d.uid, cell);
      } else if (occupant.uid === d.uid) {
        // 落在自身 -> 无操作
      } else {
        var dragged = unitByUid(d.uid);
        var res2 = ZS.resolveMerge(descriptor(d), descriptor(occupant));
        if (res2.type === 'heroUp') {
          if (occupant.isHero) {
            // 目标是武将 → 目标升阶，拖来的单位被消耗
            if (heroUp(occupant)) removeUnit(d.uid);
          } else if (dragged && dragged.isHero) {
            // 拖来的是武将 → 武将升阶并占目标格，目标单位被消耗
            if (heroUp(dragged)) { removeUnit(occupant.uid); moveUnit(d.uid, cell); }
          } else {
            flashInvalid(cell);
          }
        } else if (res2.type === 'tierup') {
          tierUp(occupant); removeUnit(d.uid);
        } else if (res2.type === 'recipe') {
          makeHero(cell, res2.heroKey); removeUnit(d.uid); removeUnit(occupant.uid);
        } else {
          flashInvalid(cell);
          if (res2.reason === 'max') maxToast(occupant.isHero ? occupant : (dragged || occupant));
        }
      }
    }
    renderHand();
    updateHud();
  }

  function deployCard(d, cell) {
    if (d.category === 'fragment') {
      state.units.push(makeFragmentInstance(d.char, cell.col, cell.row));
    } else {
      state.units.push(makeUnitInstance(d.defId, 1, cell.col, cell.row));
    }
    removeHandCard(d.uid);
  }

  function tierUp(u) {
    u.tier += 1;
    var stats = ZS.deriveUnitStats(GD.UNIT_DEFS[u.defId], u.tier);
    u.damage = stats.damage;
    u.range = stats.range;
    var label = GD.ANIM.tierLabel[u.tier] || (u.tier + '阶');
    pushFloat(u.x, u.y - state.tile * 0.42, u.char + '·' + label, '#1A1A1A');
    state.effects.push({ type: 'ring', x: u.x, y: u.y, timer: 0.5, max: 0.5, color: '#1A1A1A' });
    audio.merge();
  }

  // 两字武将喂升：任意一个字（或另一武将）→ 阶 +1（封顶 HERO_MAX_TIER）
  function heroUp(hero) {
    var max = GD.GAME_CONFIG.HERO_MAX_TIER;
    if (!hero || hero.tier >= max) return false;
    hero.tier += 1;
    var stats = ZS.deriveUnitStats(GD.UNIT_DEFS[hero.defId], hero.tier);
    hero.damage = stats.damage;
    hero.range = stats.range;
    var label = GD.ANIM.tierLabel[hero.tier] || (hero.tier + '阶');
    pushFloat(hero.x, hero.y - state.tile * 0.5, hero.name + '·' + label, '#C0392B');
    state.effects.push({ type: 'heroUpRing', x: hero.x, y: hero.y, timer: 0.7, max: 0.7 });
    audio.merge();
    return true;
  }

  function pushFloat(x, y, text, color) {
    state.effects.push({ type: 'floatText', x: x, y: y, text: text, color: color || '#1A1A1A', timer: 1.1, max: 1.1 });
  }

  function maxToast(u) {
    showToast((u.name || u.char) + ' 已满阶（' + GD.GAME_CONFIG.HERO_MAX_TIER + ' 阶）');
  }

  function makeHero(cell, heroKey) {
    var inst = makeUnitInstance(heroKey, 1, cell.col, cell.row);
    state.units.push(inst);
    pushFloat(inst.x, inst.y - state.tile * 0.5, '合成·' + inst.name, '#C0392B');
    state.effects.push({ type: 'heroUpRing', x: inst.x, y: inst.y, timer: 0.7, max: 0.7 });
    audio.hero();
  }

  function moveUnit(uid, cell) {
    var u = unitByUid(uid);
    if (!u) return;
    u.col = cell.col; u.row = cell.row;
    var c = ZS.cellCenter(cell.col, cell.row, state.tile);
    u.x = c.x; u.y = c.y;
  }

  function removeUnit(uid) {
    state.units = state.units.filter(function (u) { return u.uid !== uid; });
  }

  function flashInvalid(cell) {
    state.effects.push({ type: 'invalid', col: cell.col, row: cell.row, timer: 0.3, max: 0.3 });
    audio.error();
  }

  /* ============================ 战斗：出战 ============================ */
  var _toastTimer = null;
  function showToast(msg) {
    dom.toast.textContent = msg;
    dom.toast.classList.remove('hidden');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { dom.toast.classList.add('hidden'); }, 1600);
  }

  function beginBattle() {
    if (state.mode !== 'prep') return;
    // 前置校验：空备战不允许直接开局（避免必败，符合 QA P2-4）
    if (state.units.length === 0) {
      showToast('至少部署一个单位再出战');
      return;
    }
    setMode('battle');
    audio.ui();
    var waves = state.map.waves;
    state.spawner = {
      waveIndex: 0, phase: 'startDelay', timer: 0,
      groupIndex: 0, spawnedInGroup: 0, spawnTimer: 0, gapTimer: 0,
      waves: waves, lastIndex: waves.length - 1
    };
  }

  /* ====================== 战斗：波次生成控制器 ====================== */
  function updateSpawner(dt) {
    var sp = state.spawner;
    if (!sp) return;
    var cfg = GD.GAME_CONFIG;

    if (sp.phase === 'startDelay') {
      sp.timer += dt;
      if (sp.timer >= sp.waves[sp.waveIndex].startDelay) {
        sp.phase = 'spawning'; sp.groupIndex = 0; sp.spawnedInGroup = 0; sp.spawnTimer = 0;
      }
    } else if (sp.phase === 'spawning') {
      var wave = sp.waves[sp.waveIndex];
      var group = wave.groups[sp.groupIndex];
      var gap = group.gap > 0 ? group.gap : 0.5;
      sp.spawnTimer += dt;
      while (sp.spawnTimer >= gap && sp.spawnedInGroup < group.count) {
        sp.spawnTimer -= gap;
        spawnMonster(group.type);
        sp.spawnedInGroup++;
      }
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
    state.monsters.push({
      uid: nextUid(), defId: type, name: def.name,
      hp: def.hp, maxHp: def.hp, speed: def.speed, leakDamage: def.leakDamage,
      reward: def.reward, behavior: def.behavior, glyph: def.glyph, color: def.color,
      dist: 0, x: p0.x, y: p0.y, hitFlash: 0, stun: 0, dead: false
    });
  }

  function monsterCell(m) {
    return ZS.pixelToCell(m.x, m.y, state.tile);
  }

  /* ====================== 战斗：单位索敌与攻击 ====================== */
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
    m.hp -= dmg;
    m.hitFlash = GD.ANIM.HIT_FLASH;
    if (m.hp <= 0) {
      m.dead = true;
      state.kills++;
      addMantou(m.reward);
    }
  }

  function updateUnits(dt) {
    var fireAt = GD.ANIM.fireAt || 0.58;
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (u.hitFlash > 0) u.hitFlash -= dt;
      if (u.skillCdTimer > 0) u.skillCdTimer = Math.max(0, u.skillCdTimer - dt);
      if (u.skillAnim && u.skillAnim.timer > 0) u.skillAnim.timer -= dt;
      if (u.category === 'fragment') continue; // 碎片不参与攻击

      // 朝向（近战突刺/骑冲/挥砍方向）
      var near = findTarget(u) || findNearestMonster(u);
      if (near) {
        var dx = near.x - u.x, dy = near.y - u.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
        u.facing = { x: dx / len, y: dy / len };
      }

      if (u.animState.state === 'attack') {
        u.animState.t += dt / GD.ANIM.ATK_ANIM;
        if (!u.animState.fired && u.animState.t >= fireAt) {
          u.animState.fired = true;
          applyAttack(u);
        }
        if (u.animState.t >= 1) {
          u.animState.state = 'idle'; u.animState.t = 0; u.animState.fired = false;
        }
      } else {
        u.atkTimer += dt;
        var tgt = findTarget(u);
        if (tgt && u.atkTimer >= u.atkInterval) {
          u.animState = { state: 'attack', t: 0, fired: false };
          u.atkTimer = 0;
          u.currentTarget = tgt;
          var ddx = tgt.x - u.x, ddy = tgt.y - u.y, dl = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
          u.facing = { x: ddx / dl, y: ddy / dl };
        }
      }
    }
  }

  function applyAttack(u) {
    var tgt = (u.currentTarget && !u.currentTarget.dead) ? u.currentTarget : findTarget(u);
    if (!tgt) return;
    audio.attack(u.anim);
    if (u.projectile) {
      // 弓/黄忠：生成箭矢（沿方向飞行，带拖尾）
      var ang = Math.atan2(tgt.y - u.y, tgt.x - u.x);
      state.projectiles.push({
        x: u.x, y: u.y, target: tgt, speed: GD.PROJECTILE_SPEED,
        damage: u.damage, angle: ang, hero: u.isHero,
        trail: []
      });
    } else {
      // 近战：命中瞬间结算 + 命中墨点迸溅
      damageMonster(tgt, u.damage);
      audio.hit();
      state.effects.push({
        type: 'impact', x: tgt.x, y: tgt.y,
        color: u.isHero ? '#C0392B' : '#1A1A1A',
        timer: 0.22, max: 0.22
      });
    }
  }

  /* ====================== 战斗：怪物移动 / 漏怪 ====================== */
  function updateMonsters(dt) {
    var T = state.tile;
    for (var i = 0; i < state.monsters.length; i++) {
      var m = state.monsters[i];
      if (m.dead) continue;
      if (m.hitFlash > 0) m.hitFlash -= dt;
      if (m.stun > 0) { m.stun -= dt; continue; } // 眩晕：原地
      m.dist += m.speed * T * dt;
      var pt = ZS.pointAtDistance(state.path, m.dist);
      m.x = pt.x; m.y = pt.y;
      if (m.dist >= state.path.total) {
        m.dead = true;
        state.baseHp -= m.leakDamage;
        if (state.baseHp <= 0) { state.baseHp = 0; loseGame(); return; }
      }
    }
  }

  /* ====================== 战斗：弹道 ====================== */
  function updateProjectiles(dt) {
    for (var i = 0; i < state.projectiles.length; i++) {
      var p = state.projectiles[i];
      if (p.dead) continue;
      if (!p.target || p.target.dead) { p.dead = true; continue; }
      var dx = p.target.x - p.x, dy = p.target.y - p.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      var step = p.speed * dt;
      // 拖尾记录
      if (p.trail) { p.trail.push({ x: p.x, y: p.y }); if (p.trail.length > 6) p.trail.shift(); }
      if (d <= step + 8) {
        // 命中：箭矢迸溅 + 伤害
        state.effects.push({ type: 'impact', x: p.target.x, y: p.target.y, color: p.hero ? '#C0392B' : '#1A1A1A', timer: 0.2, max: 0.2 });
        damageMonster(p.target, p.damage); p.dead = true;
        audio.hit();
      } else {
        p.x += dx / d * step; p.y += dy / d * step;
        p.angle = Math.atan2(dy, dx);
      }
    }
  }

  /* ====================== 武将技能（三将独立 VFX） ====================== */
  function triggerSkill(u) {
    if (!u || !u.skillId || u.skillCdTimer > 0) return;
    var skill = GD.SKILLS[u.skillId];
    if (!skill) return;
    var nearest = findNearestMonster(u);
    if (!nearest) { showToast('附近没有敌人'); return; } // 无目标不打空 CD

    if (skill.vfx === 'pierce') doPierce(u, skill, nearest);
    else if (skill.vfx === 'stun') doStun(u, skill);
    else if (skill.vfx === 'arrowrain') doArrowRain(u, skill, nearest);

    audio.skill(skill.vfx);
    state.hitStop = (skill.vfx === 'stun') ? 0.13 : 0.10;  // 技能命中顿帧
    u.skillCdTimer = skill.cooldown;
    updateHud();
  }

  // 赵云·贯穿：沿最近怪物所在行/列整条直线穿透，damage×3
  function doPierce(u, skill, nearest) {
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
      if ((axis === 'row' && c.row === idx) || (axis === 'col' && c.col === idx)) {
        damageMonster(m, u.damage * skill.damageMult);
        state.effects.push({ type: 'impact', x: m.x, y: m.y, color: '#C0392B', timer: 0.26, max: 0.26 });
      }
    }
    state.effects.push({ type: 'pierce', axis: axis, idx: idx, x: u.x, y: u.y, timer: 0.34, max: 0.34 });
    u.skillAnim = { timer: 0.34, axis: axis, dir: dir };
  }

  // 张飞·眩喝：以自身为中心 radius 格圆形 AoE，damage×1.5 + 定身
  function doStun(u, skill) {
    var R = skill.radius * state.tile;
    var dmg = u.damage * skill.damageMult;
    var dur = (skill.statusEffect && skill.statusEffect.duration) || 1.6;
    for (var i = 0; i < state.monsters.length; i++) {
      var m = state.monsters[i];
      if (m.dead) continue;
      if (ZS.dist(u.x, u.y, m.x, m.y) <= R) {
        damageMonster(m, dmg);
        m.stun = Math.max(m.stun, dur);
        state.effects.push({ type: 'impact', x: m.x, y: m.y, color: '#C0392B', timer: 0.28, max: 0.28 });
      }
    }
    state.effects.push({ type: 'shockwave', x: u.x, y: u.y, r: R, timer: 0.55, max: 0.55 });
    pushFloat(u.x, u.y - state.tile * 0.55, '吼！', '#C0392B');
  }

  // 黄忠·箭雨：以最近怪物为中心 radius 格圆形 AoE，damage×2 + 多箭下落
  function doArrowRain(u, skill, nearest) {
    var mc = monsterCell(nearest);
    var cx = mc.col * state.tile + state.tile / 2;
    var cy = mc.row * state.tile + state.tile / 2;
    var R = skill.radius * state.tile;
    var dmg = u.damage * skill.damageMult;
    for (var i = 0; i < state.monsters.length; i++) {
      var m = state.monsters[i];
      if (m.dead) continue;
      if (ZS.dist(cx, cy, m.x, m.y) <= R) {
        damageMonster(m, dmg);
        state.effects.push({ type: 'impact', x: m.x, y: m.y, color: '#C0392B', timer: 0.25, max: 0.25 });
      }
    }
    state.effects.push({
      type: 'arrowrain', x: cx, y: cy, r: R,
      timer: skill.duration || 1.0, max: skill.duration || 1.0,
      count: skill.arrows || 12, seed: Math.random() * 999
    });
  }

  function updateEffects(dt) {
    for (var i = 0; i < state.effects.length; i++) {
      state.effects[i].timer -= dt;
    }
    state.effects = state.effects.filter(function (e) { return e.timer > 0; });
  }

  /* ============================ 胜负 ============================ */
  function addMantou(n) { state.mantou += n; updateHud(); }

  function winGame() {
    if (state.mode === 'result') return;
    state.mantou += GD.GAME_CONFIG.CLEAR_BONUS;
    state.cleared[state.mapId] = true;
    if (state.mapId === 'changban') state.unlocked.chibi = true; // 通关解锁赤壁
    state.result = 'win';
    audio.win();
    setMode('result');
    showResult();
  }

  function loseGame() {
    if (state.mode === 'result') return;
    state.result = 'lose';
    audio.lose();
    setMode('result');
    showResult();
  }

  function showResult() {
    var win = state.result === 'win';
    dom.resultSeal.textContent = win ? '过关' : '败';
    dom.resultSeal.classList.toggle('lose', !win);
    dom.resultTitle.textContent = state.map.name + (win ? ' · 过关' : ' · 失守');
    var stats = [
      '是否守住阿斗：<b>' + (win ? '是' : '否') + '</b>',
      '击杀敌军：<b>' + state.kills + '</b>',
      '剩余馒头：<b>' + state.mantou + '</b>'
    ];
    if (win && state.mapId === 'changban' && !state._chibiNoted) {
      stats.push('已解锁新关卡：<b>赤壁</b>');
    }
    dom.resultStats.innerHTML = stats.map(function (s) { return '<li>' + s + '</li>'; }).join('');

    // 下一关按钮
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

  /* ============================ 帧更新 ============================ */
  function update(dt) {
    if (state.monsters) updateSpawner(dt);
    updateUnits(dt);
    updateMonsters(dt);
    updateProjectiles(dt);
    updateEffects(dt);
    // 清理死亡实体
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
      // 非对局态：仅宣纸底
      ctx.fillStyle = '#F4EFE3';
      ctx.fillRect(0, 0, W, H);
      return;
    }

    // 背景宣纸
    ctx.fillStyle = '#F4EFE3';
    ctx.fillRect(0, 0, W, H);

    drawGrid(T);
    drawPath(T);
    drawBase(T);
    // 单位（含碎片）
    for (var i = 0; i < state.units.length; i++) drawUnit(state.units[i], T);
    // 怪物
    for (var j = 0; j < state.monsters.length; j++) drawMonster(state.monsters[j], T);
    // 弹道
    for (var k = 0; k < state.projectiles.length; k++) drawProjectile(state.projectiles[k]);
    // 特效
    for (var e = 0; e < state.effects.length; e++) drawEffect(state.effects[e], T);
    // 拖拽时的可合成高亮
    if (state.dragging && state.dragging.moved) drawMergeHint(T);
    // 拖拽残影
    if (state.dragging && state.dragging.moved) drawDragGhost(state.dragging, T);
  }

  function drawGrid(T) {
    ctx.strokeStyle = 'rgba(26,26,26,0.10)';
    ctx.lineWidth = 1;
    for (var c = 0; c <= state.map.gridW; c++) {
      ctx.beginPath(); ctx.moveTo(c * T, 0); ctx.lineTo(c * T, state.map.gridH * T); ctx.stroke();
    }
    for (var r = 0; r <= state.map.gridH; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * T); ctx.lineTo(state.map.gridW * T, r * T); ctx.stroke();
    }
  }

  function drawPath(T) {
    // 路径格淡墨底
    ctx.fillStyle = 'rgba(26,26,26,0.07)';
    for (var key in state.pathCells) {
      if (!state.pathCells.hasOwnProperty(key)) continue;
      var parts = key.split(',');
      var c = +parts[0], r = +parts[1];
      ctx.fillRect(c * T, r * T, T, T);
    }
    // 路径折线（墨迹）
    var p = state.map.path;
    ctx.strokeStyle = 'rgba(26,26,26,0.45)';
    ctx.lineWidth = Math.max(6, T * 0.18);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < p.length; i++) {
      var cc = ZS.cellCenter(p[i].col, p[i].row, T);
      if (i === 0) ctx.moveTo(cc.x, cc.y); else ctx.lineTo(cc.x, cc.y);
    }
    ctx.stroke();
  }

  function drawBase(T) {
    var b = state.map.base;
    var c = ZS.cellCenter(b.col, b.row, T);
    ctx.save();
    ctx.translate(c.x, c.y);
    // 朱红据点框
    ctx.fillStyle = 'rgba(192,57,43,0.12)';
    ctx.fillRect(-T / 2 + 2, -T / 2 + 2, T - 4, T - 4);
    ctx.strokeStyle = '#C0392B'; ctx.lineWidth = 3;
    ctx.strokeRect(-T / 2 + 3, -T / 2 + 3, T - 6, T - 6);
    ctx.fillStyle = '#C0392B';
    ctx.font = Math.max(28, T * 0.5) + "px 'KaiTi','STKaiti','Songti SC',serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('斗', 0, 0);
    ctx.restore();
  }

  function glyphFontSize(char, T) {
    if (char.length === 1) return Math.max(48, Math.min(T * 0.85, T));
    // 多字（如武将"赵云"）：横向排布适配格宽（已知妥协：略小于 48 像素）
    return Math.max(22, Math.min(T * 0.9 / char.length, T));
  }

  function drawMultiline(char, fs) {
    if (char.length === 1) { ctx.fillText(char, 0, 0); return; }
    var lineH = fs * 1.02;
    var startY = -(char.length - 1) * lineH / 2;
    for (var i = 0; i < char.length; i++) ctx.fillText(char[i], 0, startY + i * lineH);
  }

  function strokeMultiline(char, fs) {
    if (char.length === 1) { ctx.strokeText(char, 0, 0); return; }
    var lineH = fs * 1.02;
    var startY = -(char.length - 1) * lineH / 2;
    for (var i = 0; i < char.length; i++) ctx.strokeText(char[i], 0, startY + i * lineH);
  }

  // 阶数角标（一/二/三…）：让玩家一眼看到每个字的等级
  function drawTierBadge(u, T) {
    if (u.category === 'fragment') return;
    var tier = u.tier || 1;
    var r = Math.max(8, T * 0.14);
    var bx = u.x + T * 0.5 - r - 3;
    var by = u.y + T * 0.5 - r - 3;
    ctx.save();
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fillStyle = u.isHero ? '#C0392B' : 'rgba(26,26,26,0.88)';
    ctx.fill();
    ctx.strokeStyle = '#F4EFE3'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#F4EFE3';
    ctx.font = 'bold ' + Math.round(r * 1.35) + "px 'KaiTi','STKaiti',serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(tier), bx, by + 0.5);
    ctx.restore();
  }

  function drawUnit(u, T) {
    var fs = glyphFontSize(u.char, T);

    // 武将：朱红晕光（静态，不随减弱动效关闭）
    if (u.isHero) {
      var g = ctx.createRadialGradient(u.x, u.y, 4, u.x, u.y, T * 0.62);
      g.addColorStop(0, 'rgba(192,57,43,0.18)');
      g.addColorStop(1, 'rgba(192,57,43,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(u.x, u.y, T * 0.62, 0, Math.PI * 2); ctx.fill();
    }

    ctx.save();
    ctx.translate(u.x, u.y);

    // 受击抖动（减弱动效时关闭位移，仅保留红描边）
    if (u.hitFlash > 0 && !state.reduceMotion) {
      ctx.translate((Math.random() * 2 - 1) * GD.ANIM.hit.jitter,
                    (Math.random() * 2 - 1) * GD.ANIM.hit.jitter);
    }
    // 攻击字形形变
    if (!state.reduceMotion && u.animState.state === 'attack') applyAttackTransform(u, T);
    // 技能突进
    if (!state.reduceMotion && u.skillAnim && u.skillAnim.timer > 0) applySkillLunge(u, T);

    ctx.font = fs + "px 'KaiTi','STKaiti','Songti SC',serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // 高阶级更深更沉（视觉传达强度）
    ctx.fillStyle = u.isHero ? '#C0392B'
      : (u.category === 'fragment' ? '#7a6a4a'
        : (u.tier >= 3 ? '#000000' : (u.tier === 2 ? '#111111' : '#1A1A1A')));
    drawMultiline(u.char, fs);

    // 受击朱红描边
    if (u.hitFlash > 0) {
      ctx.lineWidth = 3; ctx.strokeStyle = GD.ANIM.hit.red;
      strokeMultiline(u.char, fs);
    }
    ctx.restore();

    // 阶数角标
    drawTierBadge(u, T);

    // 刀弧特效（挥砍弧线，独立于字形形变）
    if (!state.reduceMotion && u.animState.state === 'attack' && u.anim === 'dao') {
      drawSlashArc(u, T);
    }
    // 骑：前冲扬尘
    if (!state.reduceMotion && u.animState.state === 'attack' && u.anim === 'qi') {
      drawDust(u, T);
    }
  }

  function applyAttackTransform(u, T) {
    var t = u.animState.t;
    var a = u.anim;
    var A = GD.ANIM[a] || {};
    var f = u.facing || { x: 1, y: 0 };
    var angF = Math.atan2(f.y, f.x);

    if (a === 'dao') {
      // 自后摆（swingFrom）挥至前方（swingTo），后段回位
      var ang;
      if (t < 0.6) ang = (A.swingFrom + (A.swingTo - A.swingFrom) * (t / 0.6));
      else ang = (A.swingTo + (0 - A.swingTo) * ((t - 0.6) / 0.4));
      ctx.rotate(ang * Math.PI / 180);
      var sc = 1 + 0.12 * Math.sin(t * Math.PI);
      ctx.scale(sc, sc);
    } else if (a === 'qiang') {
      // 沿朝向拉伸并前刺
      var k = Math.sin(t * Math.PI);
      ctx.rotate(angF);
      ctx.scale(1 + ((A.stretch || 1.55) - 1) * k, 1);
      ctx.translate((A.lunge || 0.3) * T * k, 0);
      ctx.rotate(-angF);
    } else if (a === 'gong') {
      // 文字拉伸蓄力（0→0.6），随后回弹放箭（0.6→1）
      var sx;
      if (t < 0.6) sx = 1 + ((A.stretch || 1.6) - 1) * (t / 0.6);
      else sx = (A.stretch || 1.6) - ((A.stretch || 1.6) - (A.snap || 0.8)) * ((t - 0.6) / 0.4);
      ctx.rotate(angF);
      ctx.scale(sx, 1 + 0.06 * Math.sin(t * Math.PI));
      ctx.rotate(-angF);
    } else if (a === 'qi') {
      // 大幅前冲
      var k2 = Math.sin(t * Math.PI);
      ctx.translate(f.x * (A.lunge || 0.6) * T * k2, f.y * (A.lunge || 0.6) * T * k2);
    }
  }

  function applySkillLunge(u, T) {
    var p = 1 - u.skillAnim.timer / 0.34;     // 0->1
    var off = T * Math.sin(p * Math.PI);
    if (u.skillAnim.axis === 'col') ctx.translate(u.skillAnim.dir * off, 0);
    else ctx.translate(0, u.skillAnim.dir * off);
  }

  function drawSlashArc(u, T) {
    var A = GD.ANIM.dao;
    var t = u.animState.t;
    var a0 = (A.arcFrom || -64) * Math.PI / 180;
    var a1 = ((A.arcFrom || -64) + ((A.arcTo || 26) - (A.arcFrom || -64)) * Math.min(1, t / 0.6)) * Math.PI / 180;
    var r = u.range * T * (A.arcR || 0.62);
    if (r < T * 0.3) r = T * 0.55;
    ctx.save();
    ctx.translate(u.x, u.y);
    ctx.strokeStyle = 'rgba(26,26,26,0.55)';
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, r, a0, a1); ctx.stroke();
    ctx.restore();
  }

  function drawDust(u, T) {
    var t = u.animState.t;
    ctx.save();
    ctx.translate(u.x, u.y);
    ctx.fillStyle = 'rgba(90,74,58,0.35)';
    for (var i = 0; i < 4; i++) {
      var ang = (i / 4) * Math.PI * 2;
      var rr = T * 0.32 * t + 4;
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * rr, Math.sin(ang) * rr, 2.5 * (1 - t), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMonster(m, T) {
    var fs = Math.max(48, Math.min(T * 0.85, T));
    ctx.save();
    ctx.translate(m.x, m.y);
    if (m.hitFlash > 0 && !state.reduceMotion) {
      ctx.translate((Math.random() * 2 - 1) * GD.ANIM.hit.jitter,
                    (Math.random() * 2 - 1) * GD.ANIM.hit.jitter);
    }
    // 墨色躯体
    var rad = T * 0.40;
    ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2);
    ctx.fillStyle = m.color; ctx.fill();
    // 字形（宣纸色）
    ctx.fillStyle = '#F4EFE3';
    ctx.font = fs + "px 'KaiTi','STKaiti','Songti SC',serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(m.glyph, 0, 0);
    // 受击描边
    if (m.hitFlash > 0) {
      ctx.lineWidth = 3; ctx.strokeStyle = GD.ANIM.hit.red; ctx.stroke();
    }
    ctx.restore();

    // 血条
    var bw = T * 0.8, bh = Math.max(4, T * 0.08);
    var bx = m.x - bw / 2, by = m.y - rad - bh - 3;
    ctx.fillStyle = 'rgba(26,26,26,0.25)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#C0392B';
    ctx.fillRect(bx, by, bw * ZS.clamp(m.hp / m.maxHp, 0, 1), bh);

    // 定身（张飞眩喝）标记
    if (m.stun > 0) {
      ctx.save();
      ctx.fillStyle = '#C0392B';
      ctx.font = 'bold ' + Math.round(T * 0.3) + "px 'KaiTi','STKaiti',serif";
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('眩', m.x + rad + T * 0.18, m.y - rad - T * 0.1);
      ctx.restore();
    }
  }

  function drawProjectile(p) {
    // 箭矢拖尾
    if (p.trail && p.trail.length) {
      ctx.save();
      ctx.strokeStyle = 'rgba(26,26,26,0.16)';
      ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath();
      for (var i = 0; i < p.trail.length; i++) {
        var tp = p.trail[i];
        if (i === 0) ctx.moveTo(tp.x, tp.y); else ctx.lineTo(tp.x, tp.y);
      }
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();
    }
    var col = p.hero ? '#C0392B' : '#1A1A1A';
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle || 0);
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    // 箭杆
    ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(7, 0); ctx.stroke();
    // 箭头
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(1, -4); ctx.lineTo(1, 4); ctx.closePath(); ctx.fill();
    // 箭羽
    ctx.beginPath();
    ctx.moveTo(-13, 0); ctx.lineTo(-17, -3.5);
    ctx.moveTo(-13, 0); ctx.lineTo(-17, 3.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawEffect(e, T) {
    if (e.type === 'pierce') {
      // 减弱动效：不画墨痕横扫（仍保留怪物红闪与弹道）
      if (state.reduceMotion) return;
      var prog = 1 - e.timer / e.max;      // 0->1 横扫推进
      var alpha = ZS.clamp(e.timer / e.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = '#C0392B';
      ctx.lineWidth = 7; ctx.lineCap = 'round';
      if (e.axis === 'col') {
        var x = e.idx * T + T / 2;
        var yEnd = state.map.gridH * T * prog;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, yEnd); ctx.stroke();
      } else {
        var y = e.idx * T + T / 2;
        var xEnd = state.map.gridW * T * prog;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(xEnd, y); ctx.stroke();
      }
      ctx.restore();
    } else if (e.type === 'impact') {
      // 命中墨点迸溅
      var a = e.timer / e.max;
      var rr = (1 - a) * T * 0.28 + 3;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = e.color || '#1A1A1A';
      for (var k = 0; k < 6; k++) {
        var ang = (k / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(ang) * rr, e.y + Math.sin(ang) * rr, 2.2 * a + 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (e.type === 'floatText') {
      // 浮字（升阶 / 合成 / 满级提示）；减弱动效时不位移，仅淡出
      var pf = 1 - e.timer / e.max;
      var rise = state.reduceMotion ? 0 : pf * T * 0.9;
      ctx.save();
      ctx.globalAlpha = 1 - pf * 0.85;
      ctx.fillStyle = e.color || '#1A1A1A';
      ctx.font = 'bold ' + Math.max(15, T * 0.27) + "px 'KaiTi','STKaiti',serif";
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(e.text, e.x, e.y - rise);
      ctx.restore();
    } else if (e.type === 'shockwave' || e.type === 'heroUpRing' || e.type === 'ring') {
      var q = 1 - e.timer / e.max;
      var baseR = e.r || (e.type === 'ring' ? T * 0.45 : T * 0.7);
      var R = state.reduceMotion ? baseR : baseR * (0.25 + q);   // 减弱动效：不扩散
      ctx.save();
      ctx.globalAlpha = (1 - q) * 0.85;
      ctx.strokeStyle = e.color || (e.type === 'heroUpRing' ? '#C0392B' : '#1A1A1A');
      ctx.lineWidth = e.type === 'heroUpRing' ? 4 : 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, R, 0, Math.PI * 2); ctx.stroke();
      if (e.type === 'heroUpRing') {
        ctx.beginPath(); ctx.arc(e.x, e.y, R * 0.68, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    } else if (e.type === 'arrowrain') {
      var q2 = 1 - e.timer / e.max;
      var count = e.count || 12;
      if (state.reduceMotion) {
        // 减弱动效：不下落，改为静态落点圈 + 定点墨点
        ctx.save();
        ctx.globalAlpha = 0.6 * (1 - q2 * 0.5);
        ctx.strokeStyle = 'rgba(192,57,43,0.7)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(26,26,26,0.6)';
        for (var s = 0; s < count; s++) {
          var rr0 = Math.abs(Math.sin(e.seed + s * 12.9898) * 43758.5453) % 1;
          var aa0 = Math.abs(Math.sin(e.seed * 3 + s * 78.233) * 12543.21) % 1;
          ctx.beginPath();
          ctx.arc(e.x + Math.cos(aa0 * Math.PI * 2) * e.r * rr0, e.y + Math.sin(aa0 * Math.PI * 2) * e.r * rr0, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        return;
      }
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = 'rgba(192,57,43,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#1A1A1A'; ctx.lineCap = 'round';
      for (var n = 0; n < count; n++) {
        var rnd = Math.abs(Math.sin(e.seed + n * 12.9898) * 43758.5453) % 1;
        var rnd2 = Math.abs(Math.sin(e.seed * 3 + n * 78.233) * 12543.21) % 1;
        var ox = Math.cos(rnd2 * Math.PI * 2) * e.r * rnd;
        var oy = Math.sin(rnd2 * Math.PI * 2) * e.r * rnd;
        var fall = (q2 * 1.7 + n * 0.03) % 1;   // 各箭错峰下落
        var px = e.x + ox;
        var py = e.y + oy - (1 - fall) * T * 2.4;
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(px, py - 11); ctx.lineTo(px, py); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px, py); ctx.lineTo(px - 3, py - 5);
        ctx.moveTo(px, py); ctx.lineTo(px + 3, py - 5);
        ctx.stroke();
      }
      ctx.restore();
    } else if (e.type === 'invalid') {
      var alpha2 = ZS.clamp(e.timer / e.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha2;
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 2;
      ctx.strokeRect(e.col * T + 3, e.row * T + 3, T - 6, T - 6);
      ctx.restore();
    }
  }

  function drawDragGhost(d, T) {
    var p = clientToCanvas(d.curX, d.curY);
    var fs = glyphFontSize(d.char, T);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.translate(p.x, p.y);
    ctx.font = fs + "px 'KaiTi','STKaiti','Songti SC',serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = d.category === 'fragment' ? '#7a6a4a' : (d.category === 'hero' ? '#C0392B' : '#1A1A1A');
    drawMultiline(d.char, fs);
    ctx.restore();
  }

  // 拖拽悬停提示：可合成则高亮目标格并标注将发生什么
  function drawMergeHint(T) {
    var d = state.dragging;
    var p = clientToCanvas(d.curX, d.curY);
    var cell = ZS.pixelToCell(p.x, p.y, state.tile);
    if (!ZS.inGrid(cell.col, cell.row, state.map)) return;
    var occ = unitAt(cell.col, cell.row);
    if (!occ || occ.uid === d.uid) return;
    var res = ZS.resolveMerge(descriptor(d), descriptor(occ));
    var cx = cell.col * T + T / 2, cy = cell.row * T + T / 2;
    if (res.type === 'none') return;
    var isHeroOp = (res.type === 'heroUp' || res.type === 'recipe');
    var col = isHeroOp ? '#C0392B' : '#2e7d32';
    var label = res.type === 'recipe'
      ? ('合成 ' + (GD.UNIT_DEFS[res.heroKey] ? GD.UNIT_DEFS[res.heroKey].name : ''))
      : (res.type === 'heroUp' ? '武将升阶' : '同字升阶');
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.setLineDash([7, 5]);
    ctx.strokeRect(cell.col * T + 2, cell.row * T + 2, T - 4, T - 4);
    ctx.setLineDash([]);
    ctx.fillStyle = col;
    ctx.font = 'bold ' + Math.max(12, T * 0.19) + "px 'KaiTi','STKaiti',serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(label, cx, cell.row * T - 3);
    ctx.restore();
  }

  /* ============================ HUD 更新 ============================ */
  function updateHud() {
    if (!state.map) return;
    dom.txtMantou.textContent = Math.floor(state.mantou);
    dom.txtHp.textContent = Math.max(0, state.baseHp);
    dom.recruitCost.textContent = GD.GAME_CONFIG.RECRUIT_COST;

    // 阿斗血点
    var dots = '';
    for (var i = 0; i < state.baseMaxHp; i++) {
      dots += '<i class="' + (i < state.baseHp ? '' : 'empty') + '"></i>';
    }
    dom.hpDots.innerHTML = dots;

    if (state.spawner) {
      var w = Math.min(state.spawner.waveIndex + 1, state.spawner.waves.length);
      dom.txtWave.textContent = w + '/' + state.spawner.waves.length;
    } else {
      dom.txtWave.textContent = '0/' + (state.map.waves ? state.map.waves.length : 0);
    }

    // 征兵按钮可用性
    var canRecruit = state.mantou >= GD.GAME_CONFIG.RECRUIT_COST &&
                     (state.mode === 'prep' || state.mode === 'battle');
    dom.btnRecruit.disabled = !canRecruit;

    // 技能按钮：场上有武将则显示，优先就绪者高亮，按钮文案随武将技能变化
    var hero = null;
    for (var k = 0; k < state.units.length; k++) {
      var uu = state.units[k];
      if (uu.isHero && uu.skillId) { hero = uu; if (uu.skillCdTimer <= 0) break; }
    }
    if (hero && state.mode === 'battle') {
      var sk = GD.SKILLS[hero.skillId];
      var sname = sk ? sk.name : '技能';
      dom.btnSkill.classList.remove('hidden');
      if (hero.skillCdTimer <= 0) {
        dom.btnSkill.disabled = false;
        dom.btnSkill.textContent = sname;
      } else {
        dom.btnSkill.disabled = true;
        dom.btnSkill.textContent = sname + ' ' + Math.ceil(hero.skillCdTimer) + 's';
      }
    } else {
      dom.btnSkill.classList.add('hidden');
    }
  }

  /* ============================ 帧循环 ============================ */
  function loop(t) {
    if (!state._last) state._last = t;
    var dt = (t - state._last) / 1000;
    state._last = t;
    if (dt > 0.05) dt = 0.05; // 防止切后台/暂停后跳帧
    // 暂停 / 技能命中顿帧：冻结逻辑推进，仅渲染（顿帧期间保留画面冲击感）
    if (state.mode === 'battle' && !state.paused) {
      if (state.hitStop > 0) state.hitStop = Math.max(0, state.hitStop - dt);
      else update(dt);
    }
    render();
    updateHud();
    requestAnimationFrame(loop);
  }

  /* ============================ 暂停 ============================ */
  function togglePause(force) {
    if (state.mode !== 'battle') return;
    state.paused = (force != null) ? force : !state.paused;
    dom.pauseOverlay.classList.toggle('active', state.paused);
  }

  /* ============================ 事件绑定 ============================ */
  function bindEvents() {
    dom.btnStart.addEventListener('click', function () { audio.ui(); setMode('levels'); });
    dom.btnHowto.addEventListener('click', function () { audio.ui(); dom.howto.classList.add('active'); });
    dom.btnHowtoClose.addEventListener('click', function () { audio.ui(); dom.howto.classList.remove('active'); });
    dom.btnLevelsBack.addEventListener('click', function () { audio.ui(); setMode('menu'); });

    dom.btnRecruit.addEventListener('click', recruit);
    dom.btnDeploy.addEventListener('click', beginBattle);
    dom.btnSkill.addEventListener('click', function () {
      var hero = null;
      for (var k = 0; k < state.units.length; k++) {
        var u = state.units[k];
        if (u.isHero && u.skillId) { if (!hero) hero = u; if (u.skillCdTimer <= 0) { hero = u; break; } }
      }
      triggerSkill(hero);
    });

    dom.btnPause.addEventListener('click', function () { audio.ui(); togglePause(true); });
    dom.btnResume.addEventListener('click', function () { audio.ui(); togglePause(false); });
    dom.btnRetry.addEventListener('click', function () { audio.ui(); startLevel(state.mapId); });
    dom.btnExit.addEventListener('click', function () { audio.ui(); state.paused = false; dom.pauseOverlay.classList.remove('active'); setMode('levels'); });

    dom.btnReplay.addEventListener('click', function () { audio.ui(); startLevel(state.mapId); });
    dom.btnResultBack.addEventListener('click', function () { audio.ui(); setMode('levels'); });

    // 减弱动效（两处开关同步）
    function setReduce(v) {
      state.reduceMotion = v;
      dom.chkReduceMenu.checked = v; dom.chkReducePause.checked = v;
    }
    dom.chkReduceMenu.addEventListener('change', function () { setReduce(dom.chkReduceMenu.checked); });
    dom.chkReducePause.addEventListener('change', function () { setReduce(dom.chkReducePause.checked); });

    // 音效开关（两处同步）
    function setSound(v) {
      dom.chkSoundMenu.checked = v; dom.chkSoundPause.checked = v; audio.setOn(v);
    }
    dom.chkSoundMenu.addEventListener('change', function () { setSound(dom.chkSoundMenu.checked); });
    dom.chkSoundPause.addEventListener('change', function () { setSound(dom.chkSoundPause.checked); });

    // 首次交互恢复音频上下文（浏览器自动播放策略）
    window.addEventListener('pointerdown', function () { audio.resume(); }, { once: true });

    // 画布指针（拖拽场上单位）
    dom.field.addEventListener('pointerdown', onCanvasPointerDown);
    // 全局指针（拖拽过程与落点）
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  /* ============================ 启动 ============================ */
  function init() {
    bindEvents();
    setMode('menu');
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
