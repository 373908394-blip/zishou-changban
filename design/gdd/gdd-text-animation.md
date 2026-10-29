# GDD · 文字动效（gdd-text-animation）

> 模块：汉字作为作战单位的字形形变与攻击/受击动画（CSS/Canvas 规格）
> 状态：垂直切片 MUST 范围（4 基础兵种攻击 + 通用受击；武将技能动效见 skill-vfx）

---

## 1. 渲染方案（技术锚定）

- 单位以 **Canvas `ctx.fillText`** 绘制为字符；动画通过每帧 `ctx.save(); ctx.translate(cx,cy); ctx.rotate/scale(...); ctx.fillText(char,0,0); ctx.restore();` 实现字形形变。
- 形变参数由 `unit.anim` 状态驱动（攻击进度 `0→1`、受击闪烁 `hitFlash`）。
- 弹道（弓/黄忠箭）用独立 `projectiles[]` 层绘制（小墨点/短线）。
- 备选（DOM 方案）：若用 DOM `<span>` 绝对定位 + CSS `@keyframes` transform，需每单位一个元素；Canvas 方案性能更稳，本切片**采用 Canvas 方案**。

## 2. 字形形变语言（按兵种）

统一约定：攻击动画时长 `ATK_ANIM = 0.25s`（与 `atkInterval` 解耦，仅表现）；受击闪烁 `HIT_FLASH = 0.15s`。

### 2.1 刀（Dao，近战挥砍）
- 触发：攻击命中瞬间。
- 形变：`rotate(-35°→0°)` 回砍弧 + 附加一道 `slashArc`（白色月牙描边弧线，半径=range*TILE*0.6，角度 45°→ -10°）。
- 表现：字形先蓄力后甩出，伴随墨色弧光。

### 2.2 枪（Qiang，长矛突刺）
- 形变：`scaleX(1→1.4→1)` 沿朝向（指向最近怪物方向）拉伸，位移 `+0.2*TILE` 前冲再回弹。
- 表现：字如枪出，瞬间前刺。

### 2.3 弓（Gong，拉弓射箭）
- 形变：`scaleX(0.8→1.1)`（拉满弓）保持 0.1s，释放时回 `scaleX(1)` 并 `translate` 朝目标 +8px。
- 同步：释放帧在 `(cx,cy)` 生成 `projectile`（墨点，速度 `600px/s` 飞向目标）。
- 表现：字形"张弓"，随后箭出。

### 2.4 骑（Qi，骑兵冲锋）
- 形变：`translate` 朝路径方向冲 `+0.5*TILE` 再弹回（弹簧缓动），叠加地面 `dust`（2–3 个小灰点扩散）。
- 表现：字如马踏，短促冲撞。

### 2.5 通用受击（所有单位/怪物）
- 触发：受到 `damage > 0`。
- 形变：`translate` 抖动 `±4px`（2 次来回，`HIT_FLASH` 内）+ 叠加 `rgba(192,57,43,0.5)` 朱红描边闪（red flash）。
- 怪物受击同理（怪物为墨色块+小字或符号）。

## 3. 动画状态机（单位）

```
IDLE ──(atkTimer≥atkInterval 且 target in range)──> ATTACK
ATTACK: anim.t = 0→1 over ATK_ANIM; 应用形变; t≥1 ──> IDLE (重置 atkTimer, 结算伤害/生成弹道)
受击: 任意态收到伤害 → 设 hitFlash=HIT_FLASH (独立计时, 叠加表现)
```

## 4. 通用参数表（可直接写死）

```js
const ANIM = {
  ATK_ANIM: 0.25, HIT_FLASH: 0.15,
  dao:  { rotate:[-35,0], slashArc:true },
  qiang:{ scaleX:[1,1.4], lunge:0.2 },
  gong: { scaleX:[0.8,1.1], hold:0.10, nock:8 },
  qi:   { lunge:0.5, dust:true },
  hit:  { jitter:4, red:'rgba(192,57,43,0.5)' }
};
const PROJECTILE_SPEED = 600; // px/s
```

## 5. 可访问性

- 提供"减弱动效"开关：开启后关闭 `rotate/scale/lunge`，仅保留 `hitFlash` 红色描边与弹道（尊重前庭敏感玩家，呼应 concept 可访问性约束）。
- 字形最小渲染尺寸 48px，触控热区 44px。

## 6. 验收点

- [ ] 4 兵种攻击各有可辨识字形形变（刀弧/枪刺/弓拉/骑冲）。
- [ ] 受击抖动+朱红闪在玩家与怪物上均生效。
- [ ] 弓/远程单位攻击生成可见弹道并命中。
- [ ] "减弱动效"开关可用。
