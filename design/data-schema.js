/* =============================================================================
 * data-schema.js — 《字守长坂》垂直切片 数据驱动配置桥接件
 * -----------------------------------------------------------------------------
 * 用途：把各 GDD 的配置表汇总为一份零依赖、可在浏览器直接引用的 JS 配置。
 *       工程（game.js）只需 import / 读取 window.GameData 即可，新增内容只改本文件。
 * 来源 GDD：
 *   - gdd-overview.md        （GAME_CONFIG 全局常量、帧循环约定）
 *   - gdd-level-path.md      （MAPS 网格/路径/waypoints、WAVES 波次）
 *   - gdd-merge.md           （DRAW_POOL 抽字池权重、RECIPES 名将对子配方）
 *   - gdd-units-monsters.md  （UNIT_DEFS、TIER_MULT、MONSTER_DEFS）
 *   - gdd-skill-vfx.md       （SKILLS 武将技能参数）
 *   - gdd-text-animation.md  （ANIM 字形形变参数、PROJECTILE_SPEED）—— 附带，便于渲染直接引用
 *
 * 导出形态：UMD 风格（全局对象 + CommonJS 守卫），兼容「双击本地 index.html 直接运行」
 *          与 Node 端 require 测试。不使用 ES module `export`，以避免 file:// 下模块 CORS 限制。
 *          如需纯 ESM（import）形态，可另附 data-schema.mjs，请主理人批示。
 * ========================================================================== */

/* -----------------------------------------------------------------------------
 * 1. GAME_CONFIG — 全局玩法常量（来源：gdd-overview.md）
 * -------------------------------------------------------------------------- */
const GAME_CONFIG = {
  RECRUIT_COST: 3,     // 征兵抽 1 字消耗的馒头
  START_MANTOU: 12,    // 每关初始馒头（不跨关卡继承）
  BASE_HP: 10,         // 阿斗据点基础 HP；漏怪扣 leakDamage，≤0 即失败
  WAVE_BONUS: 4,       // 每清一波奖励馒头
  CLEAR_BONUS: 10,     // 过关奖励馒头
  WAVE_GAP: 6,         // 波次之间的缓冲秒数（最后一波清完到结算）
  HERO_MAX_TIER: 5,    // 两字武将最高阶（可用「任意一个字」喂升）
  // —— 帧循环约定（注释，非数据）——
  // 主循环：requestAnimationFrame；逻辑以 dt（秒）驱动，与帧率解耦。
  // 坐标：一切用网格 (col,row)，像素 = col*TILE + TILE/2（格中心）。
};

/* -----------------------------------------------------------------------------
 * 2. ANIM / PROJECTILE — 字形动效与弹道参数（来源：gdd-text-animation.md，附带）
 * -------------------------------------------------------------------------- */
const PROJECTILE_SPEED = 640; // 弹道速度 px/s（弓/黄忠箭）
const ANIM = {
  ATK_ANIM: 0.40,    // 攻击字形动画时长（秒）：加长到 0.4s 让形变清晰可见
  HIT_FLASH: 0.16,   // 受击朱红闪烁时长（秒）
  fireAt: 0.58,      // 攻击动画进度「命中/放箭」发生点（0~1）
  // 各兵种形变参数（渲染器直接读取）：
  dao:   { swingFrom: -46, swingTo: 24, arcFrom: -64, arcTo: 26, arcR: 0.64 }, // 刀：自后向左挥砍
  qiang: { stretch: 1.55, lunge: 0.30 },                                       // 枪：沿朝向拉伸前刺
  gong:  { stretch: 1.60, snap: 0.80, bow: true },                             // 弓：文字拉伸蓄力→回弹放箭
  qi:    { lunge: 0.62, dust: 6 },                                             // 骑：大幅前冲 + 扬尘
  hit:   { jitter: 5, red: 'rgba(192,57,43,0.55)' },                           // 通用受击
  tierLabel: ['', '一阶', '二阶', '三阶', '四阶', '五阶', '六阶'],              // 阶数中文
};

/* -----------------------------------------------------------------------------
 * 3. MAPS — 地图与路径（来源：gdd-level-path.md）
 *    坐标：path/spawn/base 均为网格 (col,row)；渲染时 ×tile 换算像素。
 *    路径格禁止布防；spawn 为怪物出生点（= path[0]）。
 * -------------------------------------------------------------------------- */
const MAPS = {
  // 地图一：长坂坡
  changban: {
    id: 'changban',
    name: '长坂坡',
    gridW: 12, gridH: 8, tile: 64,                 // 画布 768×512
    spawn: { col: -1, row: 3 },                    // 屏外入口（= path[0]）
    base:  { col: 11, row: 3 },                    // 阿斗据点
    path: [                                        // 蛇形 7 折点，顺序即行进方向
      { col: -1, row: 3 },
      { col: 8,  row: 3 },
      { col: 8,  row: 6 },
      { col: 3,  row: 6 },
      { col: 3,  row: 1 },
      { col: 11, row: 1 },
      { col: 11, row: 3 },                          // 终点=阿斗
    ],
  },
  // 地图二：赤壁（路径不同，更蜿蜒）
  chibi: {
    id: 'chibi',
    name: '赤壁',
    gridW: 12, gridH: 9, tile: 56,                 // 画布 672×504
    spawn: { col: -1, row: 4 },
    base:  { col: 11, row: 8 },
    path: [                                        // 双 S 9 折点
      { col: -1, row: 4 },
      { col: 2,  row: 4 },
      { col: 2,  row: 1 },
      { col: 6,  row: 1 },
      { col: 6,  row: 7 },
      { col: 9,  row: 7 },
      { col: 9,  row: 3 },
      { col: 11, row: 3 },
      { col: 11, row: 8 },                          // 终点=阿斗
    ],
  },
};

/* -----------------------------------------------------------------------------
 * 4. WAVES — 多波次 spawn 表（来源：gdd-level-path.md）
 *    结构：每波 { startDelay, groups:[{type,count,gap}] }
 *      startDelay：本波开始前等待秒数
 *      groups：顺序生成的怪物组；每组 spawn count 个 type，间隔 gap 秒
 *    type 取值见 MONSTER_DEFS 的 key（xiaobing/dunbing/feiqi/caojiang）
 * -------------------------------------------------------------------------- */
const WAVES = {
  // —— 长坂坡 8 波（GDD 明确数值）——
  changban: [
    { startDelay: 0, groups: [ { type: 'xiaobing', count: 6, gap: 1.2 } ] },
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 8, gap: 1.0 } ] },
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 5, gap: 1.0 },
                               { type: 'dunbing',  count: 2, gap: 1.5 } ] },
    { startDelay: 6, groups: [ { type: 'feiqi',    count: 6, gap: 0.8 } ] },
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 8, gap: 0.9 },
                               { type: 'dunbing',  count: 3, gap: 0.9 } ] },
    { startDelay: 6, groups: [ { type: 'feiqi',    count: 8, gap: 0.7 } ] },
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 10, gap: 0.8 },
                               { type: 'dunbing',  count: 4,  gap: 0.8 },
                               { type: 'feiqi',    count: 4,  gap: 0.8 } ] },
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 6,  gap: 0.5 },
                               { type: 'caojiang', count: 1,  gap: 2.0 } ] }, // Boss 收尾
  ],
  // —— 赤壁 10 波（GDD 仅给结构，以下为合理默认，标注 TODO 待数值评审）——
  chibi: [
    { startDelay: 0, groups: [ { type: 'xiaobing', count: 8,  gap: 1.1 } ] },                                   // TODO 默认
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 10, gap: 1.0 } ] },                                   // TODO 默认
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 6,  gap: 1.0 },
                               { type: 'dunbing',  count: 3,  gap: 1.4 } ] },                                   // TODO 默认
    { startDelay: 6, groups: [ { type: 'feiqi',    count: 8,  gap: 0.8 } ] },                                   // TODO 默认
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 10, gap: 0.9 },
                               { type: 'dunbing',  count: 4,  gap: 0.9 } ] },                                   // TODO 默认
    { startDelay: 6, groups: [ { type: 'feiqi',    count: 10, gap: 0.7 } ] },                                   // TODO 默认
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 12, gap: 0.8 },
                               { type: 'dunbing',  count: 5,  gap: 0.8 } ] },                                   // TODO 默认
    { startDelay: 6, groups: [ { type: 'feiqi',    count: 10, gap: 0.7 },
                               { type: 'dunbing',  count: 4,  gap: 1.2 } ] },                                   // TODO 默认
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 14, gap: 0.7 },
                               { type: 'dunbing',  count: 6,  gap: 0.7 },
                               { type: 'feiqi',    count: 6,  gap: 0.7 } ] },                                   // TODO 默认
    { startDelay: 6, groups: [ { type: 'xiaobing', count: 12, gap: 0.5 },
                               { type: 'caojiang', count: 1,  gap: 2.0 } ] },                                   // TODO 默认 Boss
  ],
};

/* -----------------------------------------------------------------------------
 * 5. DRAW_POOL — 征兵抽字池（来源：gdd-merge.md）
 *    kind: 'unit'（基础兵种，有 defId）→ 抽到即手牌单位
 *          'fragment'（名碎片，defId=null）→ 仅用于合成，拖合命中 RECIPES 出武将
 *    weight：加权随机权重（数值越大越常见）
 * -------------------------------------------------------------------------- */
const DRAW_POOL = [
  { char: '刀', kind: 'unit',     defId: 'dao',      weight: 22 },
  { char: '枪', kind: 'unit',     defId: 'qiang',    weight: 20 },
  { char: '弓', kind: 'unit',     defId: 'gong',     weight: 18 },
  { char: '骑', kind: 'unit',     defId: 'qi',       weight: 16 },
  { char: '赵', kind: 'fragment', defId: null,       weight: 6  },
  { char: '云', kind: 'fragment', defId: null,       weight: 6  },
  { char: '张', kind: 'fragment', defId: null,       weight: 3  },  // 预留（目标版张飞）
  { char: '飞', kind: 'fragment', defId: null,       weight: 3  },  // 预留
  { char: '黄', kind: 'fragment', defId: null,       weight: 2  },  // 预留（目标版黄忠）
  { char: '忠', kind: 'fragment', defId: null,       weight: 2  },  // 预留
];

/* -----------------------------------------------------------------------------
 * 6. RECIPES — 名将对子组合配方（来源：gdd-merge.md）
 *    key: "A+B"（两碎片字符，顺序无关，故双向都列）
 *    value: 生成的武将 UNIT_DEFS key
 *    赵云为切片 MUST；张飞/黄忠为 SHOULD 预留（对应 UNIT_DEFS 暂未实装，待补）
 * -------------------------------------------------------------------------- */
const RECIPES = {
  '赵+云': 'zhaoyun', '云+赵': 'zhaoyun',          // 赵云（切片实装）
  '张+飞': 'zhangfei', '飞+张': 'zhangfei',        // TODO 张飞 UNIT_DEFS 待补（SHOULD）
  '黄+忠': 'huangzhong', '忠+黄': 'huangzhong',     // TODO 黄忠 UNIT_DEFS 待补（SHOULD）
};

/* -----------------------------------------------------------------------------
 * 7. UNIT_DEFS / TIER_MULT — 玩家单位定义（来源：gdd-units-monsters.md）
 *    字段严格一致：char,name,category,tier,type,range,damage,atkInterval,
 *                  projectile,skillId,anim
 *    升阶实例属性：inst.damage = def.damage * TIER_MULT[inst.tier]
 *                  inst.range  = def.range + (tier-1)*0.2（可选）
 * -------------------------------------------------------------------------- */
const TIER_MULT = { 1: 1.0, 2: 1.8, 3: 3.0 };  // 兵种伤害倍率（升阶 1→2→3）
// 武将阶乘：两字武将可从一阶喂升到 HERO_MAX_TIER，数值随阶增长（每阶 +0.5 起步，高阶层更强）
const HERO_TIER_MULT = { 1: 1.0, 2: 1.5, 3: 2.0, 4: 2.6, 5: 3.2 };

const UNIT_DEFS = {
  // —— 基础兵种（tier 1 起步，同字同阶可升到三阶）——
  dao:   { char: '刀', name: '刀兵', category: 'basic', tier: 1, type: 'melee',  range: 1.0, damage: 8,  atkInterval: 1.0, projectile: false, skillId: null,    anim: 'dao'   },
  qiang: { char: '枪', name: '枪兵', category: 'basic', tier: 1, type: 'melee',  range: 1.5, damage: 6,  atkInterval: 0.8, projectile: false, skillId: null,    anim: 'qiang' },
  gong:  { char: '弓', name: '弓兵', category: 'basic', tier: 1, type: 'ranged', range: 4.0, damage: 5,  atkInterval: 1.2, projectile: true,  skillId: null,    anim: 'gong'  },
  qi:    { char: '骑', name: '骑兵', category: 'basic', tier: 1, type: 'melee',  range: 1.0, damage: 10, atkInterval: 1.4, projectile: false, skillId: null,    anim: 'qi'    },

  // —— 两字武将（merge 配方生成，一阶起步，可喂任意字升阶）——
  zhaoyun:    { char: '赵云', name: '赵云', category: 'hero', tier: 1, type: 'melee',  range: 3.0, damage: 25, atkInterval: 1.0, projectile: false, skillId: 'pierce',    anim: 'dao'  },
  zhangfei:   { char: '张飞', name: '张飞', category: 'hero', tier: 1, type: 'melee',  range: 1.8, damage: 22, atkInterval: 1.1, projectile: false, skillId: 'stun',      anim: 'dao'  },
  huangzhong: { char: '黄忠', name: '黄忠', category: 'hero', tier: 1, type: 'ranged', range: 4.5, damage: 16, atkInterval: 1.1, projectile: true,  skillId: 'arrowrain', anim: 'gong' },
};

/* -----------------------------------------------------------------------------
 * 8. MONSTER_DEFS — 怪物定义（来源：gdd-units-monsters.md）
 *    字段：name,hp,speed,leakDamage,reward,behavior,glyph,color
 *    speed 单位：格/秒；leakDamage：漏怪对阿斗伤害；reward：击杀掉馒头
 *    behavior：walk|fast|tank|boss
 * -------------------------------------------------------------------------- */
const MONSTER_DEFS = {
  xiaobing: { name: '小兵', hp: 20,  speed: 1.2, leakDamage: 1, reward: 1,  behavior: 'walk', glyph: '兵', color: '#3a3a3a' },
  dunbing:  { name: '盾兵', hp: 50,  speed: 0.8, leakDamage: 1, reward: 2,  behavior: 'tank', glyph: '盾', color: '#5a4a3a' },
  feiqi:    { name: '飞骑', hp: 15,  speed: 2.2, leakDamage: 1, reward: 2,  behavior: 'fast', glyph: '骑', color: '#7a3a3a' },
  caojiang: { name: '曹将', hp: 400, speed: 0.6, leakDamage: 5, reward: 15, behavior: 'boss', glyph: '曹', color: '#1a1a1a' },
};

/* -----------------------------------------------------------------------------
 * 9. SKILLS — 武将技能参数（来源：gdd-skill-vfx.md）
 *    字段：id,heroId,name,cooldown,trigger,vfx,damageMult,range,shape,（预留）statusEffect
 *    赵云·贯穿：切片 MUST 完整；张飞·眩晕 / 黄忠·箭雨：同结构占位（SHOULD）
 * -------------------------------------------------------------------------- */
const SKILLS = {
  pierce: {                              // 赵云·贯穿（直线穿透）
    id: 'pierce', heroId: 'zhaoyun', name: '贯穿', short: '贯穿',
    cooldown: 12,
    trigger: 'manual',
    vfx: 'pierce',                       // 墨痕横扫 + 字形突进
    damageMult: 3,                       // 伤害 = 赵云 damage * 3
    range: 'full',
    shape: 'line',
  },
  stun: {                                // 张飞·眩晕（圆形 AoE + 定身）
    id: 'stun', heroId: 'zhangfei', name: '眩喝', short: '眩喝',
    cooldown: 14, trigger: 'manual', vfx: 'stun',
    damageMult: 1.5, radius: 2, shape: 'circle',   // 半径 2 格
    statusEffect: { type: 'stun', duration: 1.6 }, // 怪物 speed 临时置 0
  },
  arrowrain: {                           // 黄忠·箭雨（圆形 AoE + 多箭下落）
    id: 'arrowrain', heroId: 'huangzhong', name: '箭雨', short: '箭雨',
    cooldown: 10, trigger: 'manual', vfx: 'arrowrain',
    damageMult: 2, radius: 2, shape: 'circle',
    duration: 1.0,                        // 箭雨视觉持续
    arrows: 12,                           // 下落箭数（视觉）
  },
};

/* =============================================================================
 * 导出（UMD 风格）：浏览器全局 window.GameData + Node module.exports
 * 不使用 ES module export，确保 file:// 双击本地 index.html 可直接引用。
 * ========================================================================== */
const GameData = {
  GAME_CONFIG,
  ANIM, PROJECTILE_SPEED,
  MAPS,
  WAVES,
  DRAW_POOL,
  RECIPES,
  TIER_MULT, HERO_TIER_MULT, UNIT_DEFS,
  MONSTER_DEFS,
  SKILLS,
  // 便捷别名：地图直接挂上自己的波次，供工程单点引用
  getMap(id) { return MAPS[id] ? { ...MAPS[id], waves: WAVES[id] } : null; },
};

if (typeof window !== 'undefined') window.GameData = GameData;
if (typeof module !== 'undefined' && module.exports) module.exports = GameData;
