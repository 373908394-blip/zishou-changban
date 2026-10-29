# GDD · 文字与怪物模块（gdd-units-monsters）

> 模块：兵种 / 武将 / 怪物 三类数据驱动模块（属性、行为、渲染）
> 状态：垂直切片 MUST 范围，强调"数据驱动、易扩展"

---

## 1. 数据驱动原则

- 所有实体来自 `data.js` 的 **基础定义表（def）** + 运行期 **实例（instance）**。
- 新增单位/怪物 = 在表中加一行，**不改逻辑**。
- 字段命名全局统一，跨 GDD 一致（merge / skill-vfx / text-animation 均引用本表字段）。

## 2. 玩家单位基础定义表（UNIT_DEFS）

字段说明：
- `char` 渲染字形；`category` basic|hero；`tier` 1..3（hero 固定 3）。
- `type` melee|ranged；`range` 格；`damage` 基础伤害；`atkInterval` 秒；`projectile` 是否发射弹道。
- `skillId` 武将技能（basic 为 null）；`anim` 字形形变 key（见 text-animation）。
- `TIER_MULT` 升阶倍率（伤害/射程缩放）。

```js
const TIER_MULT = { 1:1.0, 2:1.8, 3:3.0 };  // 伤害倍率（射程按需 +0.2/阶，可选）

const UNIT_DEFS = {
  // —— 基础兵种 ——
  dao:  { char:'刀', name:'刀兵', category:'basic', tier:1, type:'melee',  range:1.0, damage:8,  atkInterval:1.0, projectile:false, skillId:null, anim:'dao'  },
  qiang:{ char:'枪', name:'枪兵', category:'basic', tier:1, type:'melee',  range:1.5, damage:6,  atkInterval:0.8, projectile:false, skillId:null, anim:'qiang'},
  gong: { char:'弓', name:'弓兵', category:'basic', tier:1, type:'ranged', range:4.0, damage:5,  atkInterval:1.2, projectile:true,  skillId:null, anim:'gong' },
  qi:   { char:'骑', name:'骑兵', category:'basic', tier:1, type:'melee',  range:1.0, damage:10, atkInterval:1.4, projectile:false, skillId:null, anim:'qi'   },

  // —— 武将（由 merge 配方生成，tier 固定 3）——
  zhaoyun:    { char:'赵云', name:'赵云', category:'hero', tier:3, type:'melee',  range:3.0, damage:25, atkInterval:1.0, projectile:false, skillId:'pierce',    anim:'dao'  },
  // 目标版：zhangfei / huangzhong
};
```

- 升阶实例属性：`inst.damage = def.damage * TIER_MULT[inst.tier]`；`inst.range = def.range + (tier-1)*0.2`（可选）。
- 同字三阶示例：刀(t1)=8 → 刀(t2)=14.4≈14 → 刀(t3)=24。

## 3. 怪物基础定义表（MONSTER_DEFS）

字段：`hp`；`speed` 格/秒；`leakDamage` 漏怪对阿斗伤害；`reward` 馒头；`behavior` walk|fast|tank|boss；`glyph` 渲染符号；`color` 墨色。

```js
const MONSTER_DEFS = {
  xiaobing: { name:'小兵', hp:20,  speed:1.2, leakDamage:1, reward:1,  behavior:'walk', glyph:'兵', color:'#3a3a3a' },
  dunbing:  { name:'盾兵', hp:50,  speed:0.8, leakDamage:1, reward:2,  behavior:'tank', glyph:'盾', color:'#5a4a3a' },
  feiqi:    { name:'飞骑', hp:15,  speed:2.2, leakDamage:1, reward:2,  behavior:'fast', glyph:'骑', color:'#7a3a3a' },
  caojiang: { name:'曹将', hp:400, speed:0.6, leakDamage:5, reward:15, behavior:'boss', glyph:'曹', color:'#1a1a1a' },
};
```

- 怪物**无护甲机制**（切片简化）；盾兵仅以高 HP 体现"肉"，飞骑以高 speed 体现"快"，形成应对差异（弓克飞骑、刀枪集火盾兵）。
- 伤害结算：单位命中怪物 `monster.hp -= dmg`；`hp<=0 → KILLED`（播放消散墨晕 + 掉馒头）。

## 4. 实体实例模型（运行期）

```js
// 单位实例
{ uid, defId, char, name, category, tier, col, row,
  damage, range, atkInterval, type, projectile, skillId, anim,
  atkTimer:0, skillCdTimer:0, anim:{t:0,state:'idle'}, hitFlash:0 }

// 怪物实例
{ uid, defId, name, hp, maxHp, speed, leakDamage, reward, behavior, glyph, color,
  segIndex:0, segT:0, x, y, hitFlash:0, stun:0 }
```

## 5. 行为类型（Behavior）

| behavior | 行为 | 切片表现 |
|----------|------|----------|
| walk | 匀速沿 path | 小兵 |
| fast | 高速沿 path | 飞骑（需远程拦截）|
| tank | 低速高血沿 path | 盾兵（需集火）|
| boss | 极低速超高血，末波出现 | 曹将 |

- 受击表现统一：`hitFlash` 朱红抖动（见 text-animation §2.5）。
- `stun>0` 时 `speed` 临时置 0（张飞技能预留）。

## 6. 平衡自检（防经济失衡 / 主导策略）

- DPS 参考（t1）：刀 8/1.0s=8；枪 6/0.8=7.5；弓 5/1.2≈4.2（但远程覆盖）；骑 10/1.4≈7.1。近战偏高、弓偏低 → 弓靠射程与弹道补强，避免"只造刀"主导：可上调弓 `damage` 至 6 或 `atkInterval` 至 1.0（工程可微调，结构不变）。
- 怪物 HP 与单位 DPS 关系：小兵 20hp ≈ 刀 3 击 / 弓 5 击；Boss 400hp 需多单位持续输出 + 赵云技能收尾，设计上 **Boss 单靠布防可过、靠技能更稳**，双轨并存。

## 7. 验收点

- [ ] UNIT_DEFS / MONSTER_DEFS 为纯数据表，新增项不改逻辑。
- [ ] 单位/怪物实例字段与上方模型一致，属性按公式派生。
- [ ] 击杀掉馒头、漏怪扣阿斗 HP，数值与表一致。
