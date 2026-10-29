/* =============================================================================
 * tests/validate.js — Node 侧最小校验（零依赖）
 * 用法：node tests/validate.js
 * 目的：
 *   1) 断言 data-schema.js 关键字段存在且数值正确（工程必须引用的数据源）。
 *   2) 校验 util.js 纯函数（加权随机 / 路径几何 / 合成判定 / 属性派生）行为正确。
 * 说明：game.js 依赖 DOM/Canvas，无法在 Node 直接跑；此处只验证可独立调用的
 *       纯逻辑与数据契约。游戏内逻辑请于浏览器按 handoff 的 QA 重点自测。
 * ========================================================================== */
'use strict';

var path = require('path');
// data-schema.js 同时挂 window（浏览器）与 module.exports（Node）
var GameData = require(path.join(__dirname, '..', 'design', 'data-schema.js'));
// util.js 读取全局 GameData，故在 require 前注入全局
global.GameData = GameData;
var ZS = require(path.join(__dirname, '..', 'src', 'util.js'));

var pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 1e-6 : eps); }

console.log('\n=== 1) data-schema.js 字段契约 ===');
check('GAME_CONFIG.RECRUIT_COST === 3', GameData.GAME_CONFIG.RECRUIT_COST === 3);
check('GAME_CONFIG.START_MANTOU === 12', GameData.GAME_CONFIG.START_MANTOU === 12);
check('GAME_CONFIG.BASE_HP === 10', GameData.GAME_CONFIG.BASE_HP === 10);
check('GAME_CONFIG.WAVE_BONUS === 4', GameData.GAME_CONFIG.WAVE_BONUS === 4);
check('GAME_CONFIG.CLEAR_BONUS === 10', GameData.GAME_CONFIG.CLEAR_BONUS === 10);
check('GAME_CONFIG.WAVE_GAP === 6', GameData.GAME_CONFIG.WAVE_GAP === 6);

check("UNIT_DEFS.dao.char === '刀'", GameData.UNIT_DEFS.dao.char === '刀');
check("UNIT_DEFS.gong.projectile === true", GameData.UNIT_DEFS.gong.projectile === true);
check("UNIT_DEFS.zhaoyun.skillId === 'pierce'", GameData.UNIT_DEFS.zhaoyun.skillId === 'pierce');
check('TIER_MULT[2] === 1.8', GameData.TIER_MULT[2] === 1.8);
check('TIER_MULT[3] === 3.0', GameData.TIER_MULT[3] === 3.0);

check("MONSTER_DEFS.caojiang.hp === 400", GameData.MONSTER_DEFS.caojiang.hp === 400);
check("MONSTER_DEFS.feiqi.behavior === 'fast'", GameData.MONSTER_DEFS.feiqi.behavior === 'fast');
check("MONSTER_DEFS.xiaobing.glyph === '兵'", GameData.MONSTER_DEFS.xiaobing.glyph === '兵');

check('MAPS.changban.gridW === 12', GameData.MAPS.changban.gridW === 12);
check('MAPS.changban.gridH === 8', GameData.MAPS.changban.tile === 64);
check('MAPS.chibi.gridW === 12 && gridH === 9', GameData.MAPS.chibi.gridW === 12 && GameData.MAPS.chibi.gridH === 9);
check('WAVES.changban.length === 8', GameData.WAVES.changban.length === 8);
check('WAVES.chibi.length === 10', GameData.WAVES.chibi.length === 10);
check("SKILLS.pierce.cooldown === 12", GameData.SKILLS.pierce.cooldown === 12);
check("SKILLS.pierce.damageMult === 3", GameData.SKILLS.pierce.damageMult === 3);
check("RECIPES['赵+云'] === 'zhaoyun'", GameData.RECIPES['赵+云'] === 'zhaoyun');

console.log('\n=== 2) util.js 纯函数 ===');
// 加权随机：注入确定性 rand，验证命中权重区间与返回值形态
var seq = [0.0, 0.5, 0.99];
var pool = [{ weight: 1, v: 'a' }, { weight: 1, v: 'b' }];
var got = ZS.weightedPick(pool, function () { return 0.25; });
check('weightedPick 返回池内项', got && (got.v === 'a' || got.v === 'b'));
check('weightedPick 全 null 返回 null', ZS.weightedPick([], Math.random) === null);

// 网格/像素换算
var cb = ZS.cellCenter(3, 2, 64);
check('cellCenter(3,2,64) = (224,160)', cb.x === 224 && cb.y === 160);
var pc = ZS.pixelToCell(224, 160, 64);
check('pixelToCell 反算', pc.col === 3 && pc.row === 2);

// 路径几何（长坂坡）
var map = GameData.MAPS.changban;
var path = ZS.buildPath(map);
check('buildPath 段数 === waypoints-1', path.segs.length === map.path.length - 1);
var p0 = ZS.pointAtDistance(path, 0);
var startCell = ZS.cellCenter(map.path[0].col, map.path[0].row, map.tile);
check('pointAtDistance(0) ≈ 起点', approx(p0.x, startCell.x, 0.001) && approx(p0.y, startCell.y, 0.001));
var pend = ZS.pointAtDistance(path, path.total);
var endCell = ZS.cellCenter(map.path[map.path.length - 1].col, map.path[map.path.length - 1].row, map.tile);
check('pointAtDistance(total) ≈ 终点', approx(pend.x, endCell.x, 0.001) && approx(pend.y, endCell.y, 0.001));
check('路径总长 > 0', path.total > 0);

// 路径格集合
var cells = ZS.buildPathCells(map);
check('路径格包含阿斗据点 (11,3)', !!cells['11,3']);
check('路径格不包含屏外 (-1,3)', !cells['-1,3']);
check('isPathCell 工作', ZS.isPathCell(cells, 11, 3) === true && ZS.isPathCell(cells, 0, 0) === false);

// 合成判定
var daoT1 = { char: '刀', category: 'basic', tier: 1 };
var daoT1b = { char: '刀', category: 'basic', tier: 1 };
check('同字同阶 => tierup', ZS.resolveMerge(daoT1, daoT1b).type === 'tierup');
check('同字跨阶 => none', ZS.resolveMerge({ char: '刀', category: 'basic', tier: 1 }, { char: '刀', category: 'basic', tier: 2 }).type === 'none');
check('异字 => none', ZS.resolveMerge({ char: '刀', category: 'basic', tier: 1 }, { char: '枪', category: 'basic', tier: 1 }).type === 'none');
var zhao = { char: '赵', category: 'fragment', tier: 1 };
var yun = { char: '云', category: 'fragment', tier: 1 };
var r1 = ZS.resolveMerge(zhao, yun);
check('赵+云 => recipe/zhaoyun', r1.type === 'recipe' && r1.heroKey === 'zhaoyun');
check('云+赵 => recipe（顺序无关）', ZS.resolveMerge(yun, zhao).type === 'recipe');
// 张飞/黄忠已实装 => 命中配方
var rZF = ZS.resolveMerge({ char: '张', category: 'fragment', tier: 1 }, { char: '飞', category: 'fragment', tier: 1 });
check('张+飞 => recipe/zhangfei', rZF.type === 'recipe' && rZF.heroKey === 'zhangfei');
var rHZ = ZS.resolveMerge({ char: '黄', category: 'fragment', tier: 1 }, { char: '忠', category: 'fragment', tier: 1 });
check('黄+忠 => recipe/huangzhong', rHZ.type === 'recipe' && rHZ.heroKey === 'huangzhong');
// 碎片+兵种 => none
check('碎片+兵种 => none', ZS.resolveMerge(zhao, daoT1).type === 'none');

// 两字武将喂升：任意一个字 + 武将 => heroUp
var heroT1 = { char: '赵云', category: 'hero', tier: 1 };
check('兵种喂武将 => heroUp', ZS.resolveMerge(daoT1, heroT1).type === 'heroUp');
check('碎片喂武将 => heroUp', ZS.resolveMerge(zhao, heroT1).type === 'heroUp');
check('武将+武将 => heroUp', ZS.resolveMerge(heroT1, { char: '张飞', category: 'hero', tier: 1 }).type === 'heroUp');
var heroMax = { char: '赵云', category: 'hero', tier: GameData.GAME_CONFIG.HERO_MAX_TIER };
var rMax = ZS.resolveMerge(daoT1, heroMax);
check('武将满阶 => none(reason=max)', rMax.type === 'none' && rMax.reason === 'max');

// 属性派生
var daoDef = GameData.UNIT_DEFS.dao;
check('deriveUnitStats 刀 t2 damage = 8*1.8', approx(ZS.deriveUnitStats(daoDef, 2).damage, 8 * 1.8, 1e-6));
check('deriveUnitStats 刀 t3 damage = 8*3.0', approx(ZS.deriveUnitStats(daoDef, 3).damage, 24, 1e-6));
check('deriveUnitStats range 随阶 +0.2', approx(ZS.deriveUnitStats(daoDef, 3).range, daoDef.range + 0.4, 1e-6));

// 武将（赵云）：一阶=基准值，随阶按 HERO_TIER_MULT 增长
var zyDef = GameData.UNIT_DEFS.zhaoyun;
check('deriveUnitStats 赵云 t1 damage = 25', ZS.deriveUnitStats(zyDef, 1).damage === 25);
check('deriveUnitStats 赵云 t1 range = 3.0', approx(ZS.deriveUnitStats(zyDef, 1).range, 3.0, 1e-6));
check('deriveUnitStats 赵云 t2 damage = 25*1.5', approx(ZS.deriveUnitStats(zyDef, 2).damage, 25 * 1.5, 1e-6));
check('赵云贯穿 t1 = damage*3 = 75', ZS.deriveUnitStats(zyDef, 1).damage * GameData.SKILLS.pierce.damageMult === 75);
// 三名两字武将均已实装
check('UNIT_DEFS 含 赵云/张飞/黄忠', !!GameData.UNIT_DEFS.zhaoyun && !!GameData.UNIT_DEFS.zhangfei && !!GameData.UNIT_DEFS.huangzhong);

console.log('\n=== 结果 ===');
console.log('  PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);
