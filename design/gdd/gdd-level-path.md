# GDD · 关卡与路线（gdd-level-path）

> 模块：网格战场 / 怪物行进路径（waypoints）/ 多波次 spawn / 地图设计 / 过关失败条件
> 状态：垂直切片 MUST 范围（含 长坂坡、赤壁 两张地图）

---

## 1. 坐标系与网格

- 逻辑坐标：`(col, row)`，整数，**列 col 向右、行 row 向下**，`(0,0)` 为左上角格。
- 像素换算：`pixelX = col * TILE + TILE/2`（格中心），`pixelY = row * TILE + TILE/2`。
- 路径 waypoints 一律用**网格坐标**描述，渲染时换算；禁止硬编码像素路径。
- 单位只能放置在**非路径格**（path 格为怪物专用）。

| 地图 | GRID_W | GRID_H | TILE(px) | 画布像素 | 路径格数 |
|------|--------|--------|----------|----------|----------|
| 长坂坡 | 12 | 8 | 64 | 768 × 512 | 26 |
| 赤壁 | 12 | 9 | 56 | 672 × 504 | 30 |

> 注：路径"格"指怪物中心可停留/经过的格子集合；waypoints 为折点，中间直线插值为连续路径。

## 2. 地图一：长坂坡（Changbanpo）

- GRID_W=12, GRID_H=8, TILE=64。
- **入口**：左边缘 `(−1, 3)`（屏外）；**阿斗据点**：`(11, 3)`（右边缘）。
- **Waypoints（网格坐标，顺序即行进方向）**：

```js
const CHANGBAN_PATH = [
  {col:-1, row:3},   // 屏外入口
  {col:8,  row:3},
  {col:8,  row:6},
  {col:3,  row:6},
  {col:3,  row:1},
  {col:11, row:1},
  {col:11, row:3}    // 阿斗据点
];
```

- 路径形状：横向进入 → 下折 → 左折 → 上折 → 右折至据点（蛇形，制造 2 处长直道利于弓兵覆盖、2 处转角利于刀兵集火）。
- **阿斗格** `(11,3)` 禁止布防。

## 3. 地图二：赤壁（Chibi）

- GRID_W=12, GRID_H=9, TILE=56。
- **入口**：`(−1, 4)`；**阿斗据点**：`(11, 8)`。
- **Waypoints**：

```js
const CHIBI_PATH = [
  {col:-1, row:4},
  {col:2,  row:4},
  {col:2,  row:1},
  {col:6,  row:1},
  {col:6,  row:7},
  {col:9,  row:7},
  {col:9,  row:3},
  {col:11, row:3},
  {col:11, row:8}    // 阿斗据点
];
```

- 路径更蜿蜒（双 S），更长 → 赤壁波次更多、时长更接近 8 分钟上限。

## 4. 路径数据模型（工程接口）

```js
// data.js
export const MAPS = {
  changban: {
    name: "长坂坡", gridW: 12, gridH: 8, tile: 64,
    base: {col:11, row:3},
    path: [ {col:-1,row:3},{col:8,row:3},{col:8,row:6},{col:3,row:6},{col:3,row:1},{col:11,row:1},{col:11,row:3} ],
    waves: CHANGBAN_WAVES
  },
  chibi: { /* ... */ }
};
```

- 工具函数：
  - `isPathCell(map, col, row)`：判断某格是否落在路径带内（用于禁止布防 + 高亮路径）。
  - `pointAtDistance(map, d)`：沿路径按已走距离 `d`（像素或格）返回怪物当前 `(x,y)` 与朝向，用于怪物移动插值。

## 5. 怪物行进（移动模型）

- 怪物从 `path[0]` 出发，沿折线以 `speed`（格/秒）匀速前进，逐段插值。
- 到达 `path[last]`（阿斗格）→ 触发漏怪：阿斗扣 `leakDamage`，怪物销毁。
- 移动状态机：`SPAWN → WALKING → (LEAKED | KILLED)`。

```
WALKING: pos = lerp(waypoint[i], waypoint[i+1], t); t += speed*dt/segLen
if t>=1: i++; if i==last: → LEAKED
```

## 6. 多波次 Spawn（Wave 模型）

```js
// wave 结构
{ monsters:[ {type, count, gap} ], startDelay }
// type: 'xiaobing'|'dunbing'|'feiqi'|'caojiang'(boss)
```

### 长坂坡 波次表（8 波）

| 波 | 组成 | 间隔 gap(s) | 起始延迟 startDelay(s) |
|----|------|-------------|------------------------|
| 1 | 小兵 ×6 | 1.2 | 0 |
| 2 | 小兵 ×8 | 1.0 | 6 |
| 3 | 小兵 ×5 + 盾兵 ×2 | 1.0 / 1.5 | 6 |
| 4 | 飞骑 ×6 | 0.8 | 6 |
| 5 | 小兵 ×8 + 盾兵 ×3 | 0.9 | 6 |
| 6 | 飞骑 ×8 | 0.7 | 6 |
| 7 | 小兵 ×10 + 盾兵 ×4 + 飞骑 ×4 | 0.8 | 6 |
| 8 | 曹将(Boss) ×1 + 小兵 ×6 | 0.5 / 2.0 | 6 |

> 难度曲线：前期教学（纯小兵）→ 中期引入盾/飞骑（应对不同兵种）→ 后期混合压力 → Boss 收尾。约 4–6 分钟。

### 赤壁 波次表（10 波，节选结构同式，更密更长，此处略具体数，工程按同结构扩写）

- 第 1–3 波：小兵 / 小兵+盾兵 / 飞骑。
- 第 4–6 波：混合递增。
- 第 7–9 波：三兵种高密度。
- 第 10 波：曹将 ×1 + 精英护卫 ×8。

## 7. 过关 / 失败条件（与 overview 对齐）

- **失败**：任意时刻 `base.hp <= 0`。
- **胜利**：第 8 波（长坂）/ 第 10 波（赤壁）全部怪物 `LEAKED` 或 `KILLED` 且 `base.hp > 0`。
- 战斗结束进入结算屏（见 gdd-ux-flow）。
