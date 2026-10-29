# GDD · 总览（gdd-overview）

> 模块：玩法循环 / 胜负判定 / 资源经济（馒头）/ 单局时长 / 技术形态
> 状态：垂直切片 MUST 范围

---

## 1. 玩法循环（Core Loop）

```
[征兵] --(花馒头,随机抽汉字单位)--> [布防/合成] --(拖字到网格/拖合升阶或组合武将)-->
[迎敌] --(怪物沿 path 行进,单位自动攻击)--> [结算] --(守住阿斗=过关 / 阿斗归零=失败)-->
[下一关 或 重试]
```

- 每关开始前有 **备战阶段**（无限时，可反复征兵/合成/布防），点击"出战"进入战斗。
- 战斗中**仍可征兵与合成**（实时塔防），但怪物持续行进，需权衡操作与防守。

## 2. 胜负判定

| 条件 | 结果 |
|------|------|
| 阿斗 HP > 0 且所有波次（含 Boss）清除 | **胜利** |
| 阿斗 HP ≤ 0（任意时刻） | **失败**（立即结算） |

- 阿斗基础 HP：`BASE_HP = 10`。
- 漏怪伤害：怪物到达路径终点（阿斗格）即对阿斗造成 `leakDamage`（见 units-monsters 表），随后该怪物消失。

## 3. 资源经济：馒头（Mantou）

经济闭环公式（单位：馒头）：

| 事件 | 馒头变化 | 常量 |
|------|----------|------|
| 关卡初始 | `+START_MANTOU` | `START_MANTOU = 12` |
| 征兵（抽 1 字） | `-RECRUIT_COST` | `RECRUIT_COST = 3` |
| 击杀小兵 | `+1` | — |
| 击杀盾兵/飞骑 | `+2` | — |
| 击杀 Boss（曹将） | `+15` | — |
| 每清一波 | `+WAVE_BONUS` | `WAVE_BONUS = 4` |
| 过关 | `+CLEAR_BONUS` | `CLEAR_BONUS = 10` |

- **防滚雪球/枯竭**：`RECRUIT_COST` 固定不随波次上涨；击杀产出随怪物强度递增，保证后期仍"花得起、也值得花"。
- 馒头**跨备战/战斗持续**，但**不跨关卡**（每关重置为 START_MANTOU），避免某关攒爆全图。

## 4. 单局时长

- 目标单局 **3–8 分钟**。
- 长坂坡垂直切片：8 波，约 4–6 分钟；赤壁：10 波，约 5–8 分钟。
- 波次间隔 `WAVE_GAP = 6s`（最后一波清完到结算的缓冲）。

## 5. 技术形态（实现边界）

- **形态**：单页 Web 应用，零构建。建议 `index.html` + `data.js`（配置表）+ `game.js`（逻辑）。
- **渲染**：战场与单位用 **Canvas 2D**（`ctx.fillText` 画汉字 + `ctx.translate/rotate/scale` 做字形形变）；菜单/HUD/结算用 **DOM + CSS**。
- **主循环**：`requestAnimationFrame`，逻辑以 `dt`（秒）驱动。
- **输入**：鼠标/触摸拖拽（pointer events 统一），按钮点击。
- **无外部依赖**：字体回退 `KaiTi, STKaiti, "Songti SC", serif`；不引 CDN。

## 6. 模块依赖（落地顺序建议）

```
data.js (units/monsters/maps/waves)
  → grid + path 渲染 (gdd-level-path)
  → recruit + merge (gdd-merge)
  → unit attack + text-animation (gdd-text-animation)
  → monster spawn + AI walk (gdd-units-monsters)
  → hero skill + vfx (gdd-skill-vfx)
  → UX flow / screens (gdd-ux-flow)
  → scope acceptance (gdd-scope-slice)
```

## 7. 验收摘要（详见 gdd-scope-slice）

切片必须可玩：长坂坡渲染 + 8 波 spawn + 征兵抽字 + 同字升阶 & 赵云合成 + 4 兵种字形动效 + 赵云技能特效 + 阿斗胜负 + 完整流程 + 数据驱动。
