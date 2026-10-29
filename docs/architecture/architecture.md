# 《字守长坂》垂直切片 · 架构说明（1 页）

> 工程实现仅落地设计，未改设计。零依赖、零构建、双击 `index.html` 即运行。

## 1. 目录结构
```
game_sanguo/
├── index.html              # 五屏 DOM 骨架 + Canvas + 按序引入脚本
├── style.css               # 水墨国风样式 / 可访问性（触控≥44px、减弱动效开关）
├── design/
│   ├── data-schema.js       # 唯一数据源（UMD：window.GameData + module.exports）
│   └── gdd/*.md             # 八节 GDD（设计，工程只读）
├── src/
│   ├── util.js              # 纯函数工具（window.ZS）：几何/网格/随机/合成判定/属性派生
│   └── game.js              # 主逻辑：状态机 / 经济合成 / 战斗 / 渲染 / 输入 / 帧循环
└── tests/
    └── validate.js          # Node 侧零依赖校验（数据契约 + 纯函数，43 项全过）
```

## 2. 模块划分（game.js 内分区，单文件 IIFE）
- **屏幕状态机**：`menu → levels → prep ⇄ battle → result`，`battle ─pause→ PAUSED`。`setMode()` 统一切换 DOM 显隐。
- **经济与合成**：`recruit()`（加权抽字，扣 3 馒头）→ 手牌；`resolveDrop()` 统一落子/合成，调用 `util.resolveMerge` 决定 升阶 / 配方 / 非法回弹。
- **战斗**：`updateSpawner`（波次：清波→`WAVE_GAP`→下一波，对照 ux-flow）、`updateUnits`（索敌+字形动画+攻击结算）、`updateMonsters`（沿 waypoints 行进、漏怪扣阿斗）、`updateProjectiles`（弓兵墨箭）、`triggerSkill`（赵云·贯穿）、`winGame/loseGame`。
- **渲染（Canvas 2D）**：`drawGrid/drawPath/drawBase/drawUnit/drawMonster/drawProjectile/drawEffect/drawDragGhost`，字形用 `fillText` + `translate/rotate/scale` 形变。
- **输入**：Pointer Events 统一鼠标+触摸；`onHandPointerDown / onCanvasPointerDown / onPointerMove / onPointerUp`，阈值 6px 区分 点击(放技能) vs 拖拽(布防/合成)。
- **帧循环**：`requestAnimationFrame` + delta-time（秒，封顶 0.05s）；仅 `battle && !paused` 推进逻辑 → 暂停即冻结逻辑与计时。

## 3. 数据流向（红线：逻辑零硬编码数值）
```
data-schema.js ──window.GameData──▶ game.js（只读）
                                     │ 几何/网格/合成判定
                                     └──▶ util.js（window.ZS，无副作用）
```
所有地图/单位/怪物/波次/技能/动效参数均取自 `window.GameData`；加内容只改 `data-schema.js`，逻辑不动。`util.js` 仅在函数体内读取 `GameData`，可在 Node 端被 `tests/validate.js` 复用。

## 4. ADR 简述
- **ADR-1 零构建经典脚本**：拒用 ES module（file:// 下 `type=module` 触发 CORS），改用经典 `<script>` 顺序引入；`data-schema.js`/`util.js` 同时挂 `window` 与 `module.exports`，兼顾浏览器与 Node 测试。
- **ADR-2 单 Canvas + DOM HUD**：战场/单位/字形/弹道用 Canvas 画（性能稳、形变自由）；菜单/HUD/结算用 DOM（可访问、易布局）。
- **ADR-3 波次推进模型**：采用 gdd-ux-flow 明确的「清空当前波 → `WAVE_GAP`(6s) → 下一波」，按 `WAVES[map][i].startDelay` 作为波间缓冲；保证「清完所有波且阿斗存活=胜」语义清晰、无不可控波次重叠。
- **ADR-4 赵云贯穿方向简化**：取「与赵云共线且更近 / 否则按最近怪物横纵较大轴」确定整行或整列，对该直线全体怪物结算 `damage×3`（穿透到底），符合 gdd-skill-vfx 简化说明。
- **ADR-5 减弱动效范围**：关闭字形 `rotate/scale/lunge` 与技能字形突进，但保留受击朱红描边与弓兵弹道（尊重前庭敏感，呼应 concept 可访问性约束）。

## 5. 已知取舍（详见 handoff）
- 武将「赵云」为双字，在 56px 格（赤壁）下字形约 25px，略低于 48px 下限——单字兵种/怪物均满足 ≥48px；此为双字武将名的刻意妥协。
- 赤壁波次数值为 GDD 标注的 TODO 默认，非数值评审结果。
- 张飞/黄忠仅预留配方与技能数据，切片不实装（gdd-scope-slice 显式不做）。
