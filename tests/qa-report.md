# QA 报告 · 《字守长坂》垂直切片（独立质量门判定）

> 测试负责人：严守真（Yan Soujin） · 范围：gdd-scope-slice 垂直切片
> 说明：本报告只做验证与判定，**未修改任何游戏代码**；所有 bug 由工程后续修复。
> 测试方式：Node 侧 `validate.js` + 交叉引用完整性自测（数据层）+ `game.js`/`util.js` 静态代码走查。
> 重要限制：**无浏览器运行时实测**（与工程自报已知项 #5 一致），所有"渲染/交互"判定为代码级 ✅，未经真实浏览器验证。

---

## 0. 结论速览

| 项 | 结论 |
|---|---|
| 质量门判定 | **CONCERNS** |
| Node 测试 | PASS **43 / FAIL 0**（与工程声称一致） |
| 数据交叉引用 | **0** 处断裂（波次类型 / 抽字池 defId / 配方 heroKey / 路径格 全部自洽） |
| GDD 验收项（22 条） | **22/22 代码级 ✅**（视觉/交互未经浏览器验证） |
| Bug 分级 | **P0：0 · P1：0 · P2：6**（含工程已知 5 项复核） |
| 阻塞项（P0） | **无** |
| 可交付后迭代 | 全部为 P2（见 §4、§6），不阻塞试玩评审 |

**判定理由**：垂直切片功能闭环完整、数据驱动干净、无崩溃/无 P0/P1 阻塞性缺陷；但存在 1 项已确认 a11y 偏差（双字武将字形 <48px，工程已自报）、若干 P2（数值契约一致性、减弱动效细节、测试覆盖、空备战校验）。受"无浏览器实测"所限，视觉与交互未被运行时验证，故判 **CONCERNS** 而非 PASS。若主理人接受三项已知状态（双字字形妥协 / 赤壁 TODO 数值 / 无浏览器实测），即可进入试玩评审。

---

## 1. 执行结果（Node 测试）

### 1.1 工程自带校验 `tests/validate.js`
```
=== 1) data-schema.js 字段契约 ===  (22 项全过)
=== 2) util.js 纯函数 ===          (21 项全过)
=== 结果 ===  PASS 43 / FAIL 0   (exit code 0)
```

### 1.2 额外交叉引用完整性自测（本次 QA 新增，Node 内联跑，非破坏性）
检查 `validate.js` 未覆盖的数据接线，结果 **0 问题**：
- 每个 `WAVES[map]` 的 `groups[].type` 均存在于 `MONSTER_DEFS`（无悬空引用）。
- `DRAW_POOL` 中 `kind:'unit'` 的 `defId` 全部存在于 `UNIT_DEFS`；`kind:'fragment'` 的 `defId` 均为 `null`。
- 配方：赵+云→zhaoyun **实装**；张+飞→zhangfei、黄+忠→huangzhong **未实装**（配方保留，运行时优雅失败）。
- 路径格：`changban` 31 格 / `chibi` 30 格；**阿斗据点(11,3)/(11,8) 均为路径格 → 禁建正确**；屏外 spawn(-1,*) **正确排除**。
- 字形像素（复刻 `glyphFontSize`）：单字兵种/怪物 ≥48（长坂 54.4 / 赤壁 48）；双字武将"赵云"长坂 **28.8px** / 赤壁 **25.2px**（<48，已知妥协）。
- 赵云实例伤害核算：`def.damage=25` × `TIER_MULT[3]=3.0` = **75**；技能"贯穿" = 75 × `damageMult 3` = **225**（见 P2-1）。

---

## 2. 验收清单逐条核对（gdd-scope-slice §1）

### 关卡与路线（gdd-level-path）
| # | 验收项 | 判定 | 依据 |
|---|---|---|---|
| 1 | 单 `index.html` 双击本地浏览器打开即运行，零依赖零构建 | ✅ | `index.html` 经典 `<script>` 顺序引入（无 ES module/CORS）；`data-schema.js`/`util.js` 均 UMD 双挂 `window`+`module.exports` |
| 2 | 长坂坡网格(12×8,TILE64)与路径 waypoints 渲染正确，路径格高亮、禁止布防 | ✅ | `MAPS.changban` gridW12/gridH8/tile64；`util.buildPathCells`=31格；`game.drawPath` 高亮；`cellBuildable` 禁建 |
| 3 | 赤壁地图渲染（路径不同），可在选关进入 | ✅ | `MAPS.chibi` gridW12/gridH9/tile56 不同路径；`state.unlocked` 默认全解锁；`renderLevelList` 可进入 |
| 4 | 长坂坡 8 波、赤壁 10 波按波次表 spawn，怪物沿 waypoints 行进 | ✅ | `WAVES.changban.length=8` / `WAVES.chibi.length=10`；`updateSpawner` 按表；`pointAtDistance` 行进 |
| 5 | 过关（清完波次且阿斗存活）/ 失败（HP≤0）判定正确 | ✅ | `winGame()`（finalGap + `baseHp>0`）；`loseGame()`（漏怪 `baseHp<=0`） |

### 文字动效（gdd-text-animation）
| # | 验收项 | 判定 | 依据 |
|---|---|---|---|
| 6 | 刀/枪/弓/骑 四兵种攻击各有可辨识字形形变（弧/刺/拉/冲） | ✅ | `applyAttackTransform`：dao 旋转弧 / qiang 缩放+突刺 / gong 拉弓缩放 / qi 冲 |
| 7 | 受击抖动 + 朱红闪在玩家单位与怪物上均生效 | ✅ | `drawUnit` & `drawMonster` 中 `hitFlash` 抖动位移 + 朱红 `strokeText`/`stroke` |
| 8 | 弓（ranged）攻击生成可见弹道并命中结算 | ✅ | `applyAttack` 生成 `projectiles`；`updateProjectiles` 飞行 + `damageMonster` 结算 |
| 9 | "减弱动效"开关可用 | ✅ | `chk-reduce-menu/pause` 同步 `state.reduceMotion`；字形形变/技能突进已门控（细节见 P2-2） |

### 技能特效（gdd-skill-vfx）
| # | 验收项 | 判定 | 依据 |
|---|---|---|---|
| 10 | 赵云可由 赵+云 合成（merge 配方） | ✅ | `RECIPES['赵+云']` + `resolveMerge` recipe 分支 + `makeHero` |
| 11 | 赵云技能键可见、就绪可点、冷却读秒 | ✅ | `updateHud` 中 `btnSkill` 显示/禁用/`贯穿 Ns` 读秒 |
| 12 | 点击后沿直线穿透多怪并结算 `damage*3` 伤害 | ✅（值见 P2-1） | `triggerSkill` 整行/列穿透，`u.damage * skill.damageMult(3)` |
| 13 | 墨痕横扫 + 字形突进 VFX 可见，技能进入冷却并恢复 | ✅ | `drawEffect('pierce')` 直线红痕 + `applySkillLunge` 突进 + `skillCdTimer=12` 倒计时恢复 |

### 文字与怪物模块（gdd-units-monsters）
| # | 验收项 | 判定 | 依据 |
|---|---|---|---|
| 14 | UNIT_DEFS / MONSTER_DEFS 为纯数据表，新增项不改逻辑 | ✅ | 全部数值在 `data-schema.js`；`game.js` 仅读 `window.GameData` |
| 15 | 4 基础兵种 + 3 怪物 + 1 Boss 数值与表一致 | ✅ | 刀枪弓骑 + 小兵/盾兵/飞骑/曹将；`validate.js` 已核对 caojiang.hp=400、feiqi.fast、xiaobing.glyph 等 |
| 16 | 击杀掉馒头、漏怪扣阿斗 HP | ✅ | `damageMonster` 击杀 `addMantou(reward)`；`updateMonsters` 漏怪 `baseHp -= leakDamage` |

### 合成与经济（gdd-merge / overview）
| # | 验收项 | 判定 | 依据 |
|---|---|---|---|
| 17 | 征兵消耗 3 馒头抽随机字（加权池） | ✅ | `recruit` 扣 `GAME_CONFIG.RECRUIT_COST`；`ZS.weightedPick(GD.DRAW_POOL)` |
| 18 | 同字拖合升阶（t1→t2→t3），跨阶不合 | ✅ | `resolveMerge`：`basic+basic` 同字同阶 `tierup`，跨阶/异字 `none` |
| 19 | 馒头经济闭环：初始12 / 击杀掉落 / 波次+4 / 过关+10 | ✅ | `START_MANTOU` / `damageMonster.reward` / `WAVE_BONUS` / `CLEAR_BONUS` 全部取自 `GAME_CONFIG` |

### 流程（gdd-ux-flow）
| # | 验收项 | 判定 | 依据 |
|---|---|---|---|
| 20 | 菜单 → 选关 → 备战 → 对局 → 结算 完整流转 | ✅ | `setMode` 状态机 menu/levels/prep/battle/result |
| 21 | 备战可征兵/拖合/布防；出战后可实时操作 | ✅ | `recruit`/`resolveDrop` 在 prep+battle 均可；`beginBattle` 切 battle |
| 22 | 暂停冻结逻辑；结算有胜负与重试/下一关 | ✅ | `loop` 仅 `battle && !paused` 推进；`result` 含 `btn-replay`/`btn-next`/`btn-result-back` |

> 注：第 6/7/8/13（视觉动效）与所有"点击/拖拽"交互均经**代码走查**判定 ✅，未经浏览器运行时验证（见 §0 限制）。

---

## 3. 代码走查发现（聚焦 8 个易错点）

### 3.1 帧循环（rAF + delta-time）
- ✅ **解耦**：`loop(t)` 以 `dt=(t-_last)/1000` 驱动，与帧率无关。
- ✅ **暂停冻结**：`if (state.mode==='battle' && !state.paused) update(dt)` —— 暂停时不推进逻辑与计时。
- ✅ **切后台封顶**：`if (dt>0.05) dt=0.05` 防止 tab 切回后怪物瞬移。
- ✅ 首帧 `_last=0` 假值处理 → dt=0，无异常。

### 3.2 路径与坐标
- ✅ `cellCenter(col,row,tile)=col*tile+tile/2` 与 GDD 红线 #1 一致。
- ✅ `pixelToCell` 整数 floor；`clientToCanvas` 的 DPR 处理正确。
- ✅ `buildPath` 段数 = waypoints−1；`pointAtDistance(0)≈起点`、`(total)≈终点`（validate 已测）。
- ✅ `buildPathCells` 正确排除屏外(col<0)与非格内越界；阿斗据点(路径终点)被标为路径格 → `cellBuildable` 禁建正确。

### 3.3 合成
- ✅ `resolveMerge` 优先级：碎片配方 > 同字升阶 > 失败，与 gdd-merge 一致。
- ✅ 同字同阶 tierup；同字跨阶 `none`；异字 `none`；赵+云（顺序无关）recipe；碎片+兵种 `none`。
- ✅ 张飞/黄忠：`RECIPES` 有键但 `UNIT_DEFS` 无定义 → `resolveMerge` 因 `GD.UNIT_DEFS[heroKey]` 为假返回 `none`，拖合时 `flashInvalid` 回弹，**无崩溃/无异常**（优雅失败，见 §4 已知#3）。

### 3.4 经济
- ✅ 征兵扣 `RECRUIT_COST`、馒头不足 `return` 且按钮 `disabled`；击杀掉落 `reward`；清波 `WAVE_BONUS`；过关 `CLEAR_BONUS` —— 全部取 `GAME_CONFIG` 常量，无硬编码。

### 3.5 战斗
- ✅ 索敌 `findTarget` 取射程内"最靠前(最大 dist)"怪，防漏；`applyAttack` 区分近战直伤 / 弓兵弹道。
- ✅ 弹道 `updateProjectiles` 处理目标中途死亡（`p.target.dead` → 弹道自毁），命中 `damageMonster`。
- ✅ 漏怪 `m.dist>=total` → `dead` + `baseHp-=leakDamage`；`<=0` 触发 `loseGame`（带 `return` 安全退出本帧）。
- ✅ 攻击节奏：`atkTimer` 在攻击动画期间不累加，结算后归零重启，无重复开火。

### 3.6 技能（赵云·贯穿）
- ✅ 无目标不打空 CD（`nearest` 为空直接 `return`）。
- ✅ 方向判定：优先与赵云共行/列，否则取最近怪横纵较大轴 → 整行/列穿透；`damage*3` 结算；VFX 直线红痕 + 字形突进；`skillCdTimer=12` 读秒恢复。
- ⚠️ 伤害基数见 P2-1（实例 75 → 贯穿 225）。

### 3.7 流程（五屏）
- ✅ menu→levels→prep⇄battle→result 无死路；暂停 overlay 与 `setMode` 显隐协同（重试/退出均先清 overlay 再切屏，无残留遮罩）。
- ⚠️ `beginBattle` 不校验 `units.length>0`（P2-4）。

### 3.8 数据驱动
- ✅ 全部地图/单位/怪物/波次/技能/动效/弹道取自 `window.GameData`，逻辑零硬编码玩法数值（满足 GDD 红线 #2）。

---

## 4. Bug 清单（带分级）

> 分级：P0=阻塞可玩/崩溃；P1=明显错误；P2=体验/平衡/一致性瑕疵。

### P0：无
未发现崩溃、死循环、悬空调用或未捕获异常。空备战/空手牌/不存在配方等边界均安全回弹。

### P1：无
无"明显错误"（验收项在代码层均成立）。唯一数值语义疑点（P2-1）属数据/引擎契约歧义，非明确错误。

### P2（6 项，含工程已知项复核）

**P2-1 · 赵云 tier 倍率双重计入，导致"贯穿"=225 而非可能的 75**
- 现象：赵云实例攻击 = `def.damage 25` × `TIER_MULT[3] 3.0` = **75**；技能"贯穿" = 75 × 3 = **225/名怪**。GDD 技能验收写"结算 `damage*3` 伤害"，若"赵云 damage"按 `def.damage`(25) 理解应为 **75**；实得 225（强 3×）。
- 文件/函数：`design/data-schema.js` `UNIT_DEFS.zhaoyun` / `src/util.js` `deriveUnitStats` / `src/game.js` `makeUnitInstance` + `triggerSkill`。
- 建议：与 design-strategist 确认赵云最终伤害意图。若意图 25/贯穿 75：将 `zhaoyun.tier` 设为 `1`（或 `def.damage≈8.33` 使 ×3=25），并在 `deriveUnitStats` 注释明确"hero 不做 tier 倍率"。若意图 75/225：保持，并在 GDD 注明 hero 已含 tier3 倍率。

**P2-2 · 减弱动效下"墨痕横扫"直线 VFX 仍绘制**
- 现象：开启"减弱动效"后，赵云技能的直线红痕仍显示。
- 文件/函数：`src/game.js` `render()` → `drawEffect(type==='pierce')` 未用 `!state.reduceMotion` 门控（对比 `drawUnit` 各处已门控）。
- 建议：与 architecture ADR-5 对齐——若视为静态可接受则在文档注明保留；否则在 `drawEffect` 的 pierce 分支加 `if (state.reduceMotion) return;`（或降 alpha）。

**P2-3 · 战斗逻辑零自动化测试（覆盖缺口）**
- 现象：`tests/validate.js` 仅覆盖 `data-schema` 字段契约 + `util` 纯函数（43 项）；`src/game.js` 的 spawner/经济/合成/技能/胜负/暂停全部无自动化测试（IIFE 无导出、依赖 DOM/Canvas，无法在 Node 直接跑）。
- 建议：引入 jsdom + canvas stub 烟雾测试，或 Playwright 关键路径冒烟（征兵→布防→赵+云合成→放技能→清 8 波→见"过关"），至少覆盖 `winGame`/`loseGame` 与赵云贯穿。

**P2-4 · 空备战可"出战"（无布防校验）**
- 现象：备战阶段点"出战"不检查已布防单位，零布防开战必败。
- 文件/函数：`src/game.js` `beginBattle()`。
- 建议：若 `state.units.length===0` 弹确认或禁用"出战"按钮。

**P2-5 ·（工程已知#1）双字武将字形 <48px**
- 现象："赵云"字形长坂 28.8px / 赤壁 25.2px，低于 GDD 红线"字形 ≥48px"；单字兵种/怪物均 ≥48（长坂 54.4 / 赤壁 48）。
- 结论：**属实**，属 architecture §5 已记载的刻意妥协（双字武将名）。非阻塞；建议后续用竖排/缩略或加大格解决。

**P2-6 ·（工程已知#2）赤壁波次为 TODO 默认数值**
- 现象：`WAVES.chibi` 全部标注 `// TODO 默认`，非数值评审结果（10 波结构正确，平衡未验证）。
- 结论：**属实**。切片允许"评审默认解锁"，赤壁数值可后续由数值评审补正。

### 工程自报 5 项已知项复核
| 已知项 | 复核结论 |
|---|---|
| #1 双字武将字形略小 | **属实** → P2-5（已记） |
| #2 赤壁波次为 TODO 默认 | **属实** → P2-6（已记） |
| #3 张飞/黄忠不实装 | **属实且优雅失败**：`RECIPES` 有键、`UNIT_DEFS` 无定义，`resolveMerge` 返回 `none` 回弹，**无崩溃**，符合"优雅失败"。非 bug |
| #4 波次严格串行不重叠 | **属实且为设计**：ADR-3（清空→WAVE_GAP→下一波），GDD ux-flow 明确此模型。非缺陷 |
| #5 无浏览器实测 | **属实** → 见 §0 限制（本报告视觉/交互判定均为代码级） |

---

## 5. 减弱动效 & 可访问性评估

### 减弱动效开关
- ✅ **落地**：菜单与暂停两处 `checkbox` 经 `setReduce` 同步 `state.reduceMotion`；`drawUnit` 内 `rotate/scale/lunge`、`drawSlashArc`、`applySkillLunge` 均 `!state.reduceMotion` 门控；受击朱红描边（`strokeText`）与弓兵弹道保留（呼应 concept 前庭敏感约束）。
- ⚠️ 唯一缺口：技能直线红痕（墨痕横扫）未受门控 → P2-2。

### 触控 ≥44px
- ✅ `.ink-btn` `min 48×48`；`.card` `min 44×44`；主操作热区达标。`reduce-toggle` 原生 checkbox 20px（开关件，非主操作区）。

### 字形 ≥48px
- ❌ 双字武将"赵云"长坂 28.8px / 赤壁 25.2px < 48（P2-5，已知妥协）。
- ✅ 单字兵种/怪物：长坂 54.4px / 赤壁 48px，均达标。

---

## 6. 质量门判定与阻塞项

**判定：CONCERNS**（非 PASS，原因：存在已确认 a11y 偏差 + 数值契约待确认 + 无浏览器实测；非 FAIL，原因：无 P0/P1 阻塞性缺陷，22/22 验收项代码级成立）。

**阻塞项（P0）：无。** 不存在必须修复后才能 close 的崩溃/可玩性阻断。

**可交付后迭代项（P2，不阻塞试玩评审）：**
- P2-1 赵云 tier 倍率/贯穿数值（需 design-strategist 确认意图）
- P2-2 减弱动效下墨痕横扫 VFX 门控
- P2-3 补战斗逻辑自动化/Playwright 冒烟测试
- P2-4 空备战出战校验
- P2-5 双字武将字形（已知妥协）
- P2-6 赤壁波次数值评审

**放行建议**：若主理人接受"双字字形妥协 / 赤壁 TODO 数值 / 无浏览器实测"三项已知状态，本切片**可进入试玩评审**；试玩后建议优先补齐 P2-1（数值确认）与 P2-3（补测试），再考虑 P2-2/P2-4。

---

## 7. 给工程的修复建议（按优先级）

1. **P2-1（数值确认）**：与 design-strategist 对齐 `zhaoyun` 最终伤害，必要时调整 `tier` 或在 `deriveUnitStats` 显式排除 hero 的 tier 倍率；同步更新 GDD 技能"damage*3"的基数说明。
2. **P2-3（测试）**：在 `tests/` 增加 jsdom/canvas-stub 烟雾测试或 Playwright 关键路径脚本，覆盖 `updateSpawner`→`winGame`、`loseGame`、赵云贯穿与合成回弹。
3. **P2-2（减弱动效）**：`drawEffect` pierce 分支补 `if (state.reduceMotion) return;`（或降 alpha），与 ADR-5 对齐。
4. **P2-4（UX 兜底）**：`beginBattle` 前置 `if (!state.units.length) { 确认/禁用 }`。
5. **P2-5 / P2-6**：双字武将字形（竖排或加大格）、赤壁波次数值评审（交给数值设计）。

---

## 8. 给用户的试玩指引（重点路径）

> 因无浏览器实测，以下为**建议优先手测路径**，用于验证本报告代码级 ✅ 项：

1. **启动**：双击 `index.html`（零依赖）；点"开始游戏"→ 选"长坂坡"。
2. **经济/布防**：连续"征兵"观察馒头 −3；把同字（如两个"刀"）拖合验证升阶；异字/跨阶拖合应回弹（红框）。
3. **合成武将**：抽到"赵""云"两碎片 → 先各拖到空格 → 再互拖 → 应生成红色"赵云"。
4. **出战/战斗**：点"出战"；观察刀弧/枪刺/弓弹道/骑冲字形形变；击杀掉馒头、漏怪扣阿斗血点。
5. **技能**：赵云就绪时点武将或"贯穿"键 → 整行/列红痕穿透 + 读秒冷却（12s）；可多次释放验证 CD 恢复。
6. **减弱动效**：菜单或暂停开"减弱动效" → 字形形变/突进应消失，受击红边与弓箭保留（注意直线红痕仍显示属 P2-2）。
7. **胜负**：清完 8 波且阿斗存活 → "过关"印章 + 解锁赤壁；阿斗血归零 → "败"。暂停应冻结全场。
8. **赤壁**：选关进赤壁，路径明显不同；波次数值为 TODO 默认（平衡未评审，留意是否过易/过难）。
9. **边界**：零布防直接出战应必败（P2-4，无校验）；尝试 张+飞 / 黄+忠 拖合应安全回弹（非崩溃）。

---
*报告生成：quality-lead（严守真） · 依据 `validate.js` 43/0、交叉引用自检 0 问题、game.js/util.js 静态走查。未修改任何源码。*
