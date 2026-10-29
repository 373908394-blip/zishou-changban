/* =============================================================================
 * data-schema.js — 《字守长坂》垂直切片 数据驱动配置桥接件
 * -----------------------------------------------------------------------------
 * 用途：把各 GDD 的配置表汇总为一份零依赖、可在浏览器直接引用的 JS 配置。
 *       工程（game.js）只需 import / 读取 window.GameData 即可，新增内容只改本文件。
 * ========================================================================== */

const GAME_CONFIG = {
  RECRUIT_COST: 3,     // 征兵抽 1 字消耗的馒头
  START_MANTOU: 12,    // 每关初始馒头（不跨关卡继承）
  BASE_HP: 10,         // 阿斗据点基础 HP；漏怪扣 leakDamage，≤0 即失败
  WAVE_BONUS: 4,       // 每清一波奖励馒头
  CLEAR_BONUS: 10,     // 过关奖励馒头
  WAVE_GAP: 6,         // 波次之间的缓冲秒数（最后一波清完到结算）
};

const PROJECTILE_SPEED = 600; // 弹道速度 px/s（弓/黄忠箭）
const ANIM = {
  ATK_ANIM: 0.25,    // 攻击动画时长（秒），与 atkInterval 解耦，仅表现
  HIT_FLASH: 0.15,   // 受击朱红闪烁时长（秒）
  dao:   { rotate: [-35, 0], slashArc: true },
  qiang: { scaleX: [1, 1.4], lunge: 0.2 },
  gong:  { scaleX: [0.8, 1.1], hold: 0.10, nock: 8 },
  qi:    { lunge: 0.5, dust: true },
  hit:   { jitter: 4, red: 'rgba(192,57,43,0.5)' },
};

const MAPS = {
  changban: {
    id: 'changban', name: '长坂坡',
    gridW: 12, gridH: 8, tile: 64,
    spawn: { col: -1, row: 3 }, base: { col: 11, row: 3 },
    path: [
      { col: -1, row: 3 }, { col: 8, row: 3 }, { col: 8, row: 6 },
      { col: 3, row: 6 }, { col: 3, row: 1 }, { col: 11, row: 1 },
      { col: 11, row: 3 },
    ],
  },
  chibi: {
    id: 'chibi', name: '赤壁',
    gridW: 12, gridH: 9, tile: 56,
    spawn: { col: -1, row: 4 }, base: { col: 11, row: 8 },
    path: [
      { col: -1, row: 4 }, { col: 2, row: 4 }, { col: 2, row: 1 },
      { col: 6, row: 1 }, { col: 6, row: 7 }, { col: 9, row: 7 },
      { col: 9, row: 3 }, { col: 11, row: 3 }, { col: 11, row: 8 },
    ],
  },
};

const WAVES = {
  changban: [
    { startDelay: 0, groups: [ { type: 'xiaobing', count: 6, gap: 1.2 } ] },
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 8, gap: 1.0 } ] },
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 5, gap: 1.0 }, { type: 'dunbing', count: 2, gap: 1.5 } ] },
    { startDelay: 6, groups: [ { type: 'feiqi', count: 6, gap: 0.8 } ] },
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 8, gap: 0.9 }, { type: 'dunbing', count: 3, gap: 0.9 } ] },
    { startDelay: 6, groups: [ { type: 'feiqi', count: 8, gap: 0.7 } ] },
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 10, gap: 0.8 }, { type: 'dunbing', count: 4, gap: 0.8 }, { type: 'feiqi', count: 4, gap: 0.8 } ] },
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 6, gap: 0.5 }, { type: 'caojiang', count: 1, gap: 2.0 } ] },
  ],
  chibi: [
    { startDelay: 0, groups: [ { type: 'xiaobing', count: 8, gap: 1.1 } ] },
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 10, gap: 1.0 } ] },
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 6, gap: 1.0 }, { type: 'dunbing', count: 3, gap: 1.4 } ] },
    { startDelay: 6, groups: [ { type: 'feiqi', count: 8, gap: 0.8 } ] },
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 10, gap: 0.9 }, { type: 'dunbing', count: 4, gap: 0.9 } ] },
    { startDelay: 6, groups: [ { type: 'feiqi', count: 10, gap: 0.7 } ] },
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 12, gap: 0.8 }, { type: 'dunbing', count: 5, gap: 0.8 } ] },
    { startDelay: 6, groups: [ { type: 'feiqi', count: 10, gap: 0.7 }, { type: 'dunbing', count: 4, gap: 1.2 } ] },
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 14, gap: 0.7 }, { type: 'dunbing', count: 6, gap: 0.7 }, { type: 'feiqi', count: 6, gap: 0.7 } ] },
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 12, gap: 0.5 }, { type: 'caojiang', count: 1, gap: 2.0 } ] },
  ],
};

const DRAW_POOL = [
  { char: '刀', kind: 'unit', defId: 'dao', weight: 22 },
  { char: '枪', kind: 'unit', defId: 'qiang', weight: 20 },
  { char: '弓', kind: 'unit', defId: 'gong', weight: 18 },
  { char: '骑', kind: 'unit', defId: 'qi', weight: 16 },
  { char: '赵', kind: 'fragment', defId: null, weight: 6 },
  { char: '云', kind: 'fragment', defId: null, weight: 6 },
  { char: '张', kind: 'fragment', defId: null, weight: 3 },
  { char: '飞', kind: 'fragment', defId: null, weight: 3 },
  { char: '黄', kind: 'fragment', defId: null, weight: 2 },
  { char: '忠', kind: 'fragment', defId: null, weight: 2 },
];

const RECIPES = {
  '赵+云': 'zhaoyun', '云+赵': 'zhaoyun',
  '张+飞': 'zhangfei', '飞+张': 'zhangfei',
  '黄+忠': 'huangzhong', '忠+黄': 'huangzhong',
};

const TIER_MULT = { 1: 1.0, 2: 1.8, 3: 3.0 };

const UNIT_DEFS = {
  dao:   { char: '刀', name: '刀兵', category: 'basic', tier: 1, type: 'melee', range: 1.0, damage: 8, atkInterval: 1.0, projectile: false, skillId: null, anim: 'dao' },
  qiang: { char: '枪', name: '枪兵', category: 'basic', tier: 1, type: 'melee', range: 1.5, damage: 6, atkInterval: 0.8, projectile: false, skillId: null, anim: 'qiang' },
  gong:  { char: '弓', name: '弓兵', category: 'basic', tier: 1, type: 'ranged', range: 4.0, damage: 5, atkInterval: 1.2, projectile: true, skillId: null, anim: 'gong' },
  qi:    { char: '骑', name: '骑兵', category: 'basic', tier: 1, type: 'melee', range: 1.0, damage: 10, atkInterval: 1.4, projectile: false, skillId: null, anim: 'qi' },
  zhaoyun: { char: '赵云', name: '赵云', category: 'hero', tier: 3, type: 'melee', range: 3.0, damage: 25, atkInterval: 1.0, projectile: false, skillId: 'pierce', anim: 'dao' },
};

const MONSTER_DEFS = {
  xiaobing: { name: '小兵', hp: 20, speed: 1.2, leakDamage: 1, reward: 1, behavior: 'walk', glyph: '兵', color: '#3a3a3a' },
  dunbing:  { name: '盾兵', hp: 50, speed: 0.8, leakDamage: 1, reward: 2, behavior: 'tank', glyph: '盾', color: '#5a4a3a' },
  feiqi:    { name: '飞骑', hp: 15, speed: 2.2, leakDamage: 1, reward: 2, behavior: 'fast', glyph: '骑', color: '#7a3a3a' },
  caojiang: { name: '曹将', hp: 400, speed: 0.6, leakDamage: 5, reward: 15, behavior: 'boss', glyph: '曹', color: '#1a1a1a' },
};

const SKILLS = {
  pierce: { id: 'pierce', heroId: 'zhaoyun', name: '贯穿', cooldown: 12, trigger: 'manual', vfx: 'pierce', damageMult: 3, range: 'full', shape: 'line' },
  stun: { id: 'stun', heroId: 'zhangfei', name: '眩晕', cooldown: 14, trigger: 'manual', vfx: 'stun', damageMult: 1.5, radius: 2, shape: 'circle', statusEffect: { type: 'stun', duration: 1.5 } },
  arrowrain: { id: 'arrowrain', heroId: 'huangzhong', name: '箭雨', cooldown: 10, trigger: 'manual', vfx: 'arrowrain', damageMult: 2, radius: 2, shape: 'circle', duration: 1.2 },
};

const GameData = {
  GAME_CONFIG, ANIM, PROJECTILE_SPEED, MAPS, WAVES, DRAW_POOL, RECIPES,
  TIER_MULT, UNIT_DEFS, MONSTER_DEFS, SKILLS,
  getMap(id) { return MAPS[id] ? { ...MAPS[id], waves: WAVES[id] } : null; },
};

if (typeof window !== 'undefined') window.GameData = GameData;
if (typeof module !== 'undefined' && module.exports) module.exports = GameData;
