# 你藏我找 · 别墅版

本地双人网页游戏：一人在 3D 别墅里藏东西，另一人限时搜出来。

![技术栈](https://img.shields.io/badge/Three.js-0.186-blue) ![建模](https://img.shields.io/badge/建模-Blender-orange) ![依赖](https://img.shields.io/badge/运行依赖-零-success)

## 🚀 快速开始

**方式一（在线玩）**：打开部署好的 Netlify 链接即可（见下方「在线部署」）。

**方式二（本地玩）**：双击 `启动游戏.bat`，浏览器会自动打开游戏。

**方式三（命令行）**：

```bash
node server.js
# 浏览器打开 http://127.0.0.1:8080
```

> 运行只需 Node.js（任意较新版本），**无需 npm install**，完全离线可玩。也可以用任意静态服务器直接托管本目录（见 `netlify.toml`）。

## 🌐 在线部署（Netlify）

纯静态站点，无需构建：

- **网页方式**：登录 [app.netlify.com](https://app.netlify.com) → "Add new site" → "Import an existing project" → 选本仓库 → 直接 Deploy（发布目录为仓库根目录，`netlify.toml` 已配置好缓存与 MIME）
- **命令行方式**：

```bash
npx netlify-cli deploy --prod --dir .
```

## 🤝 双人规则

两个玩家共用一台电脑：**藏家**先第一视角把物品藏进家具（柜门/抽屉会真实打开），完成后把电脑交给**找家**；找家在限时内翻遍全屋，全部找出则找家获胜，否则藏家获胜。多回合累计比分。

## 🎮 玩法

| 阶段 | 操作 |
|---|---|
| **藏家布置** | 鼠标左键拖动旋转视角 / 右键拖动平移 / 滚轮缩放；底部选物品 → 点击家具 → 选槽位藏好 → 点"✔ 完成藏匿" |
| **传递设备** | 出现遮屏后，把电脑交给找的人 |
| **限时搜索** | WASD 移动 / 鼠标转视角 / Shift 跑 / **E** 开门·开抽屉·掀地毯·翻书·拿取 |
| **提示** | 开启"冷热提示"后，距离藏匿点越近越热（冷→凉→温→热→烫） |

藏匿点遍布全屋：**杯子里、书页间、地毯下、床底下、沙发底下、抽屉里、冰箱冷藏/冷冻室、衣柜挂衣区、花盆土里、垃圾桶里、相框后面、电脑机箱内……**

尺寸校验是真实的：遥控器塞不进水杯，乒乓球压不进地毯缝，纸条对折后能塞进杯子，但只有"纸类"能夹进书页、只有"薄片"能藏进相框后。

## 🏠 场景

一层四室：客厅（沙发/茶几/电视柜/地毯/盆栽/落地灯）、厨房（橱柜/冰箱/餐桌/水杯/果盘/微波炉/垃圾桶）、卧室（双人床/床头柜/衣柜/斗柜/床边毯）、书房（书桌/书架藏书/电脑主机/显示器/转椅/相框）。

搜索时右下角有**画中画**——那是藏家的第三人称观战视角，能看到找家角色在屋内翻箱倒柜。

## ⚙️ 技术要点

- **Three.js 0.186**（本地化，无 CDN 依赖）+ 原生 ES Modules + 零依赖 Node 静态服务器
- **Blender 全量建模**（M13）：别墅结构/庭院/29 类家具/8 种藏匿物品/角色替身全部由
  `tools/blender_build.py` 无头建模（倒角、镂空容器、有机树冠、PBR 材质+程序纹理），
  导出 50 个 GLB（约 6MB），游戏经本地 GLTFLoader 加载；任一模型缺失自动回退程序化几何
- 「容器-槽位」藏匿系统：31 个槽位数据驱动（`furniture.js` 目录 + `slots.js` 校验），
  GLB 部件以 `part_*` 命名对接原开合动画（门/抽屉/掀地毯/抽书），碰撞体与槽位坐标与旧版完全一致
- 轻量物理：静态 AABB 碰撞 + 圆柱滑行 + 重力，家具永不穿地
- 性能保护：像素比 ≤ 2、帧间隔钳制、单方向光阴影、无重型后处理（实测 241fps）

## 📁 结构

```
hide-and-seek/
├── index.html          # 入口与全部 UI 层
├── server.js           # 零依赖静态服务器
├── 启动游戏.bat         # Windows 一键启动
├── vendor/             # three.js 本地副本 + GLTFLoader
├── models/             # Blender 导出的 GLB（villa/yard/avatar + pieces/* + item_*）
├── tools/
│   ├── blender_build.py  # Blender 无头建模与导出脚本（可复现，改完重跑即可）
│   └── verify_glb.py     # GLB 部件名/材质校验
└── js/
    ├── main.js         # 组装入口（异步预加载模型）
    ├── models.js       # GLB 加载器：部件代理/别名/阴影与图层规则
    ├── scene.js        # 渲染器/灯光/主循环
    ├── villa.js        # 别墅碰撞骨架（视觉由 GLB 接管）
    ├── villa2.js       # 二楼+庭院碰撞骨架
    ├── furniture.js    # 家具目录+槽位元数据（GLB 优先，缺失回退程序化）
    ├── items.js        # 可藏物品定义（GLB 优先）
    ├── slots.js        # 槽位校验（尺寸/类型/折叠规则）
    ├── interact.js     # 开合动画/射线交互/检查特写/放置
    ├── placement.js    # 藏家放置 UI
    ├── player.js       # 第一人称控制器
    ├── spectator.js    # 上帝相机/角色替身/画中画观战
    ├── game.js         # 回合状态机/计时/提示/比分
    └── audio.js        # WebAudio 合成音效
```

## 🔧 重新生成模型

改了建模想更新游戏？装好 Blender 后一条命令重建全部 GLB：

```bash
blender -b --python tools/blender_build.py -- --out <项目根目录>
python tools/verify_glb.py   # 校验部件名
```
