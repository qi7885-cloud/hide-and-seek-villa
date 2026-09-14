# 交接文档（HANDOFF）— 你藏我找

> 给下一个 AI 会话/开发者：读完本文即可在现有基础上继续优化，无需重新探索。
> 最后更新：2026-09-14（M19 后）

## 1. 项目位置与链接

| 项 | 值 |
|---|---|
| 本地仓库 | `D:\桌面\ZCode\hide-and-seek`（git，master 分支） |
| GitHub | https://github.com/qi7885-cloud/hide-and-seek-villa （公开） |
| 线上游玩 | https://hide-and-seek-villa.netlify.app （Netlify，已实测可玩） |
| Netlify 站点 | 名 `hide-and-seek-villa`，ID `baff3f0c-98db-4363-8393-ce9d7a63104c` |
| 本地运行 | `node server.js` → http://127.0.0.1:8080 （或双击 `启动游戏.bat`；注意 8080 可能已有旧实例在跑） |

**CLI 凭据状态**：Netlify 已登录（`npx netlify-cli`）；GitHub CLI 便携版在 `C:\Users\Qi\tools\bin\gh.exe`，账号 `qi7885-cloud`（系统无 `gh`/`winget`，直接用这个 exe）。

## 2. 更新发布的标准流程

```
改代码/模型 → 本地 node server.js 测试 → git commit
→ git push（已配 origin）
→ npx netlify-cli deploy --prod --dir . --site baff3f0c-98db-4363-8393-ce9d7a63104c
```

## 3. 技术栈与架构

- **Three.js 0.186**（本地化 `vendor/`，零 CDN/npm 依赖），原生 ES Modules，`server.js` 是零依赖静态服务器（仅本地用；线上由 Netlify 托管，见 `netlify.toml`）。
- **所有视觉模型均为 Blender 建模导出的 GLB**（50+ 文件，约 8MB），程序化几何只作回退和碰撞体。

### js/ 模块速查
| 文件 | 职责 | 改动须知 |
|---|---|---|
| `main.js` | 入口：预加载模型→骨架→家具→玩家→回合 | 异步 init；Esc 退出监听在此 |
| `models.js` | GLB 加载器 | **核心**：`instantiatePiece` 把 GLB 内 `part_*` 节点包一层代理组供动画使用；`__桶名` 后缀会被剥掉；`NO_CAST`（不投影）与 `ROOF_LAYER`（屋顶挂 layer 2）两个正则在此 |
| `scene.js` | 渲染器/灯光/主循环 | ACES 调色、RoomEnvironment 环境光 0.45 |
| `villa.js` / `villa2.js` | **碰撞骨架**（视觉已被 GLB 接管） | `setVillaVisuals(false)` 时只生成 AABB 碰撞体；改墙体碰撞要同步改 Blender 脚本！ |
| `furniture.js` | 60 件家具 CATALOG + 槽位元数据 + 程序化回退 builder | **回退 builder 的尺寸/位置必须与 GLB 一致**（槽位 offset、门铰链 hinge 依赖它） |
| `items.js` | 8 种藏匿物品定义 | size 单位米 [宽,高,厚]；tags: paper/thin/metal/small |
| `slots.js` | `canHide` 尺寸类型校验 | 纸可折叠、书页需 paper、相框需 thin |
| `interact.js` | E 交互/开合动画/放入/拿取 | `OPENABLE_DEFS` 定义每件家具的动画部件（hinge/slide/book/prop/lift）；`aimedBook` 准星选书；`dropAnims`/`bookTweens` 动画队列 |
| `placement.js` | 藏家放置 UI | 流程：E→选位置(stage=slot)→序号选物品(stage=item)→藏入；书页间 stage=book 由 `update()` 每帧准星拾取；底部 `#help-bar` 提示条 |
| `player.js` | 第一人称控制器 | **指针锁定模式**（点击画面锁定）；无下蹲； eyeHeight 恒 1.62 |
| `game.js` | 回合状态机 MENU→HIDE→COVER→SEEK→RESULT | 画中画已取消（beginSeek 不再开 pip） |
| `spectator.js` | 上帝相机/替身/画中画 | 替身仅在 layer 1（画中画层），PiP 关闭时不可见 |
| `audio.js` | WebAudio 合成音效 | 无音频文件 |

### 家具建模三助手（tools/blender_build.py，M16~M19 沉淀）
- `HOLLOW(w,h,d,x,y,z,mat,name,t)`：五面板空心盒，**前口(+z)开放**——衣柜/冰箱/吊柜/鞋柜/橱柜/机箱等有 interior 藏点的家具必须用它，否则藏的物品被实心体包住看不见。
- `HOLLOW_TOP(w,h,d,x,y,z,mat,name,t)`：顶口开放（背/左/右/前/底）——玩具箱等顶开盖家具，四面齐全。
- `DRAWER_BOX(w,h,d,x,y,z,front_z,mat_front,mat_body,name,t,handle_mat)`：空心抽屉（前板+底+左右+后，顶口开放），**把手参数内建并 join 进同一部件**——抽屉滑出时把手才跟随；所有抽屉（床头柜/斗柜/书桌/文件柜/橱柜）都用它。
- **interior 槽位校准法**：物品落于 cap 底（`offset - cap/2`），所以 `offset = 腔体内底高度 + cap/2`；cap 的 x/z 不要大于腔体内空（否则大物品穿板）。改完抽屉/柜体尺寸必须重算 offset。
- **门方向规则**（three 绕 Y 正旋转：+x→-z）：门板在 +z 面、铰链在左缘(-x) → `open` 取**负**（向外开）；铰链在右缘(+x) → 取正。把手一律装在自由缘（铰链对侧）。counter/mailbox 原本就对，tvCabinet/fridge/wardrobe/shoeCabinet/wallCabinet 曾写反。
- **slide 动画物品跟随**：抽屉滑出时藏在里面的物品按"局部轴位移→世界位移"（父节点四元数换算）同步平移，基准存在 `mesh.userData._restPos`（placeItem 时记录）。改抽屉滑动量不用改物品逻辑。

### 藏匿/开合系统关键约定
- CATALOG 条目：`pos/rotY`（组原点=家具底部中心，正面朝局部 +z）、`slots[]`（`offset` 是组局部坐标）、`build`（回退用）。
- 新增可开合家具五步：① Blender `b_xxx()` 建模（可动部件 `join([...], 'part_名字')`，把手等小件**必须并进部件**）→ ② `PIECE_BUILDERS` 加映射 → ③ `furniture.js` CATALOG 加条目+回退 builder → ④ `models.js` `PIECE_MODEL` 加映射 → ⑤ `interact.js` `OPENABLE_DEFS` 加开合定义。
- ⚠️ **同一 builder 多实例（如 desk/desk2）各有独立 id，OPENABLE_DEFS 按 pieceId 查表——每个 id 都要有条目**。desk2/wardrobe2/nightstand2/dresser2/bookshelf2 曾因缺条目而从第一版起就打不开（M17 修复）。

## 4. Blender 建模管线（tools/）

- **Blender 可执行文件**：`D:\WindowsApps\BlenderFoundation.Blender_5.2.1.0_x64__ppwjx1n5r4v9t\Blender\blender.exe`（5.2.1 LTS，无头模式）
- **重建全部模型**（改了 `tools/blender_build.py` 后必跑）：
  ```
  blender.exe -b --python tools/blender_build.py -- --out "D:\桌面\ZCode\hide-and-seek"
  ```
- **校验**：`python tools/verify_glb.py`（检查 part_* 部件名/材质/包围盒）
- **坐标约定**：Three.js 是 Y-up，Blender 是 Z-up。脚本内 `T(x,y,z)=(x,-z,y)`；尺寸 (w,h,d)three→(w,d,h)blender；three 绕 Y 转 θ → blender 绕 Z 转 θ。
- **命名铁律**：可动部件必须 `join([...], 'part_名字')` 注册（join 会自动加 `__桶名` 后缀避免 Blender 全局重名去重；glTF 导出会吃掉点号，所以不能依赖 Blender 的 .001）。书是 `part_book_NN`（33 本，`parts.books` 数组）。
- **材质**：全部在脚本 `_build_materials()` 的 `MATS` 字典（程序纹理 numpy 生成）；新颜色加在那里。
- **楼层耦合**：吊顶楼梯井洞口（x 2.9..6.5）、`stairwell_band` 层间封带、`f2_stair_wall` 二楼楼梯井南墙，三者与 `villa2.js` 的碰撞体一一对应，改一个要同步其余。

## 5. 已完成里程碑（勿重做）

- M1-M9：工程骨架/别墅/家具库/藏匿系统/回合/音效/真实化材质
- M10-M12：二楼+楼梯+屋顶+庭院；楼梯口头部空间修复
- M13：**全量 Blender 建模升级**（GLTFLoader 本地化、碰撞零改动）
- M14：十项体验修复（拖动视角、新藏匿流程、自定义件数、联动开合、书脊书名/动态选书、吊顶楼梯井、挡水板避窗、沙发防共面闪烁）
- M15：楼梯区完善 + 家具扩到 60 件（鞋柜/边几/吊柜/文件柜/懒人沙发/书包/水桶/大花盆）+ 装饰小物
- M16：**家具内部掏空**（HOLLOW 空心盒×10 件）+ 衣柜挂衣服/吊柜两层调料 + interior 槽位全面校准
- M17：门开合方向全面修正（从把手侧向外开）+ 楼梯扶手立柱精确接触 + 补齐二楼家具缺失开合定义
- M18：抽屉空心化（DRAWER_BOX）+ 物品跟随抽屉滑出 + 电视柜两层 + 玩具箱四面补板 + 吊柜门方向补修
- M19：抽屉把手并入抽屉对象（随滑出移动）
- 后续微调：下蹲移除；退出改回 **Esc + 指针锁定**；取消找家画中画；菜单"自定义"下拉；**发布上线（GitHub + Netlify）**

## 6. 当前玩法操作（写死在 UI 文案里，改功能要同步改文案）

- 藏家：瞄准家具按 **E** 选位置 → 按序号选物品藏入 → **G** 完成；**Q** 关面板；书页间瞄准书本后 E 确认
- 找家：点击画面锁定鼠标，**WASD** 移动 / **Shift** 跑 / **E** 开门·检查·拿取 / **Esc** 退出本局
- 菜单：回合数（1/3/5/自定义 1-20）、藏匿件数（1/2/3/自定义 1-8）、搜索时间、冷热提示

## 7. 调试与测试方法

- 浏览器控制台 `window.__game` 暴露全部模块：`pieces/interact/game/player/godCam/colliders` 等。
- 模拟藏匿：`__game.interact.placeItem('cup','inner','note')`；开合：`__game.interact.togglePiece('wardrobe',true)`；快进回合：`game.confirmHide(); game.beginSeek()`。
- 上帝相机截视角：临时定义 `__view(cam,tgt)` 反推球坐标设 `godCam.azimuth/polar/dist`（polar=acos(dy/dist)，azimuth=atan2(dx,dz)）。
- 环境有浏览器自动化（ZCode 的 IAB + node_repl），直接开 http://127.0.0.1:8080 或线上地址实测截图。
- `window.__errors` 收集运行时错误，测完必查为零。

## 8. 已知问题与待办建议

- **性能**：60 件家具+GLB 实测 240fps（桌面），无压力；若再加模型注意 draw call（当前每家具一 GLB、未合批）。
- **手机端不支持**：纯键鼠操作；做触屏是最大可选方向（虚拟摇杆+点按交互）。
- **真联机**：当前是本地双人传设备；做线上联机需引入 WebSocket 服务器（Netlify Functions 不支持长连接，可考虑 Cloudflare Workers Durable Objects 或小型 VPS）。
- **藏点拓展**：新书架层/沙发扶手上/窗帘盒等加槽位成本低（CATALOG + offset 即可）。
- **物品更多样**：items.js 加定义 + Blender `item_*` 模型即可，尺寸校验自动生效。
- **图片/logo**：README 无截图；可加游戏截图与 Netlify 徽章。
- 服务器 `server.js` 有 `Cache-Control: no-cache`（本地开发用）；线上缓存策略在 `netlify.toml`。

## 9. 千万别踩的坑（血泪史）

1. Blender 对象名全局去重 → 部件必须走 `join()` 的 `__桶名` 机制，裸 `part_door` 第二次出现会被静默改名导致游戏端动画失联。
2. glTF 导出器会把名字里的点号去掉（`doorL.001`→`doorL001`），校验脚本和 models.js 都做了 `.split('__')[0]` + `re.sub(r'\.\d+$','')` 归一。
3. **抽屉/门的小件（把手）必须 join 进部件对象**——独立节点不会跟随开合动画（M19）。
4. **有 interior 藏点的家具必须空心**（HOLLOW/HOLLOW_TOP/DRAWER_BOX），实心体会把藏的物品包住；槽位 offset 按"物品落 cap 底"校准，否则物品悬空或穿板（M16/M18）。
5. **开合方向符号**：铰链左缘→open 负、右缘→open 正（见第 3 节规则）；写反了门就往里翻（M17）。
6. 改 villa 视觉（Blender 脚本）必须同步 `villa.js/villa2.js` 的碰撞体，反之亦然——两边是刻意分离的（视觉/碰撞）。
7. `models.js` 的 `NO_CAST`/`ROOF_LAYER` 正则按对象名前缀匹配，新增大件（楼板/屋顶类）要记得加进去，否则菜单俯瞰会露馅/阴影发脏。
8. 浏览器对 JS/GLB 缓存很顽固：本地调试直接 `tab.reload()`；线上靠 netlify.toml 的 no-cache(index)+hash 化部署。
9. 8080 端口常有上次会话遗留的 server 进程，`curl http://127.0.0.1:8080/` 先探测再决定是否启动。
10. **调试相机**：HIDE 阶段用 godCam 截视角前必须 `g.player.frozen = true`，否则玩家控制器每帧把相机拉回第一人称。
