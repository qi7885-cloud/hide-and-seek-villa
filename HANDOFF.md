# 交接文档（HANDOFF）— 你藏我找

> 给下一个 AI 会话/开发者：读完本文即可在现有基础上继续优化，无需重新探索。
> 最后更新：2026-09-17（M29 后 · 电视 + 一楼沙发换精模，已发布线上）

## 1. 项目位置与链接

| 项 | 值 |
|---|---|
| 本地仓库 | `D:\桌面\ZCode\hide-and-seek`（git，master 分支） |
| GitHub | https://github.com/qi7885-cloud/hide-and-seek-villa （公开） |
| 线上游玩 | https://hide-and-seek-villa.netlify.app （Netlify，已实测可玩） |
| Netlify 站点 | 名 `hide-and-seek-villa`，ID `baff3f0c-98db-4363-8393-ce9d7a63104c` |
| 本地运行 | `node server.js`（默认 8080，`启动游戏.bat` 与近期会话用 **3000**）→ http://127.0.0.1:3000 ｜ 注意端口常有上次会话遗留进程，先 `curl / -w '%{http_code}'` 探测再启动 |

**CLI 凭据状态**：Netlify 已登录（`npx netlify-cli`）；GitHub CLI 便携版在 `C:\Users\Qi\tools\bin\gh.exe`，账号 `qi7885-cloud`（系统无 `gh`/`winget`，直接用这个 exe）。

## 2. 更新发布的标准流程

```
改代码/模型 → 本地 node server.js 测试 → git commit
→ git push origin master（已配 origin，master 分支）
→ npx netlify-cli deploy --prod --dir . --site baff3f0c-98db-4363-8393-ce9d7a63104c
```

**发布前必查（`.blend` 源文件泄露）**：`netlify deploy --dir .` 会把**整个工作目录**上传，
不看 `.gitignore`。所以任何 `.blend` 精模源文件都必须两头堵：

1. `.gitignore` 里有 `*.blend` / `*.blend1`（阻止进公开仓库）；
2. `_redirects` 里有对应 404 屏蔽行（阻止公网下载）。

新引入外部精模（如 `models/pieces/tv.blend`）时**两条都要补**，只做一条仍会泄露。
自查：`git status --porcelain | grep blend` 应为空，且 `curl -o /dev/null -w '%{http_code}' <线上地址>/models/pieces/xxx.blend` 返回 404。

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
| `interact.js` | E 交互/开合动画/放入/拿取 | `OPENABLE_DEFS` 定义每件家具的动画部件（hinge/slide/book/prop/lift）；**抽屉与书本按部件精确瞄准**（射线命中哪个抽屉/书就操作哪个，`_entryByNode` 节点反查），**抽屉+书本全局同时只开一个**（`openSolo`），Q 关上；书架每本书是独立 book 条目（`books:*` 展开 33×2）；`aimedBook(piece)` 准星选书；`dropAnims` 动画队列 |
| `placement.js` | 藏家放置 UI | 流程：E→选位置(stage=slot)→序号选物品(stage=item)→藏入；**瞄准书本按 E 直接抽出该书进入选物品**（`onAimBook`，按书所在层自动匹配 pages 槽位）；书页间也可走面板 stage=book 由 `update()` 每帧准星拾取；底部 `#help-bar` 提示条 |
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

- **Blender 可执行文件**：`D:\blender\blender.exe`（5.2.2 LTS，无头模式）。
  ⚠️ 此处以前记的是 `D:\WindowsApps\BlenderFoundation.Blender_5.2.2.0_x64__...\Blender\blender.exe`，**该路径已失效**（商店版被卸载/迁移）。找不到就用 `Get-ChildItem -Path C:\,D:\ -Filter blender.exe -Recurse -Depth 6` 定位。
- **重建全部模型**（改了 `tools/blender_build.py` 后必跑）：
  ```
  blender.exe -b --python tools/blender_build.py -- --out "D:\桌面\ZCode\hide-and-seek"
  ```
  ⚠️ `--out` 指向的目录必须**存在 `textures/wood_diff.jpg`**（脚本第 193 行按 `ROOT/textures/` 读一楼木地板贴图）。指到别的目录会让 villa.glb 静默丢掉这张 734KB 的贴图，体积从 3.24MB 掉到 2.51MB —— 看起来像"脚本漂移"，其实是贴图没找到。
- **单独替换某件家具**：不想全量重建时，用 `--out <临时目录>` 建到临时目录（记得先 `cp -r textures <临时目录>/`），再把需要的那一个 `.glb` 拷回 `models/pieces/`。全量重建会把 50 个 glb 全部重写字节（带贴图的那批每次字节都不同，体积一致），只为了改一件会污染 diff。
- **提取外部 .blend 里的模型**（如 `models/pieces/tv.blend` → `models/pieces/tv.glb`）：
  ```
  blender.exe -b --python tools/convert_tv.py -- <src.blend> <dst.glb>
  ```
  `tools/inspect_blend.py` / `tools/dump_blend.py` 可打印 .blend 的物体层级与世界包围盒，排查坐标系问题很省事。
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
- M26（本地）：楼梯支撑判定修复（M25 的"圆心入投影"卡死楼梯，改重叠≥0.1m）+ 楼梯井南墙降为1.35m半墙（blender wall_v 加 height 参数，villa2 wall 加 h 参数）+ **抽屉/书本按部件精确瞄准交互**（E 开哪个抽屉取决于准星所在的把手面；抽屉+书本全局单开、开新自动关旧；Q 关上；书本 = 每本独立 book 条目，藏家瞄准书按 E 直接抽出藏入，remapBookEntry/animateBook/bookList 移除）+ **床头柜/文件柜改双层抽屉**（blender: nightstand/file_cabinet 各加 part_drawer2+把手，原 fileCabinet 的静态 front_lower 删除；槽位 drawer→drawer1/drawer2，下抽屉 offset 床头柜0.195/文件柜0.145；focusPiece 修正：瞄准抽屉开面板不再连开柜门）
- **M26 补充**：厨房橱柜前板缝隙修复——DRAWER_BOX 加 front_w/front_h/front_dx/front_dy 可选参数（前板铺满柜体开口，默认行为不变），橱柜两抽屉前板加高加宽（上塞台面底、下接柜门顶、中缝对齐隔板），柜门加宽至 0.97（铰链同步移到 [-1.16,0.25,0.315]），openbox 加宽消门板间黑洞，右端加 front_right 封板。**微波炉改可开门家具**：blender b_microwave 改 HOLLOW 空心炉腔+part_door（左铰链/玻璃窗/右缘把手），CATALOG 加 inner 炉腔藏点（cap [0.3,0.16,0.26] offset [0,0.1,0]），OPENABLE_DEFS 加 door 铰链（slots:['inner'] 映射暴露拿取——门类 def 的 slots 字段决定 openBySlotKey 键名，key 本身不再是键）。**水壶/砧板升级为独立家具件**：原直接建在 villa.glb 里（villa 不在射线目标中，瞄准水壶穿透显示橱柜），现拆出 kettle.glb/board.glb + CATALOG 无槽位件（pos [6.85,0.91,-2.7] / [6.85,0.902,-4.75]，collide false），瞄准正确显示名字。教训：装饰小物要进玩家瞄准命名体系就必须是独立 piece，不能混进 villa.glb。**客厅茶几南移 0.3m**（z -1.7→-2.0，仍在地毯上）：沙发前沿与茶几间缝隙 0.475<玩家直径 0.64 不能通行，加宽至 0.775，双向走廊实测通过
- 后续微调：下蹲移除；退出改回 **Esc + 指针锁定**；取消找家画中画；菜单"自定义"下拉；**发布上线（GitHub + Netlify）**
- **M27（已发布）：客厅电视换成 `tv.blend` 的精模 + 电视柜补柜腿**
  - 来源：`models/pieces/tv.blend`（外部精模，含品牌丝印/背面铭牌/HDMI·USB 口/散热格栅/拉铝支架，10 个材质）。用 `tools/convert_tv.py` 抽出 `TV*` 前缀物体、丢掉电源线（在建 60m 外的插座上）与 aim 空物体，join 成单节点 `body`，原点归零到包围盒底面中心 → `models/pieces/tv.glb`（32KB → 368KB，1.449×1.087×0.261m）。
  - **位置**：`furniture.js` CATALOG 的 `tv` 件 `pos [-5.75, 0.52, -5.23]`（y=0.52 = 电视柜顶面高度，正好落座；屏幕朝 +z 正对沙发）。回退 builder `tv()` 同步改成同尺寸。
  - **电视柜补腿**：`blender_build.py` 的 `b_tv_cabinet()` 原来漏建柜腿，柜体底面停在 y=0.06，视觉上悬空 6cm（M13 迁 GLB 时漏的）。已补 4 条 `tvleg{sx}{sz}`（0.06 立方，±0.74 / ±0.15），与 `furniture.js` 回退 builder 的 `legs4(1.6, 0.42, 0.06)` 完全对齐。
  - **材质修正**：`TV-03 · Screen glass · dark mirror` 源文件用 Fresnel+Glossy+Transparent 的 Mix Shader，glTF 只认 Principled BSDF → 导出退化成 baseColor 纯白，游戏里屏幕糊成一片白。convert_tv.py 里加了"材质兜底"：凡是没有 Principled 也没有 Emission 的材质，重建成深色镜面 Principled（base 0.015/0.016/0.020，metal 0，rough 0.04）→ 还原"息屏深色镜面"。
  - 实测：`window.__errors` 为空，客厅四个机位截图确认无飘浮物、无穿模、落座正确。
- **M28（本地，未提交）：一楼沙发换法式圆扶手款 v2（Blender 侧已完成，尚未进游戏）**
  - 来源：按 `写实建模提示词指南_v2_深析修订版.md` 的规则重做，写回 `blender_build.py` 的 `b_sofa()`。
    款型 = 法式圆扶手三人沙发：车木腿（铜脚套→球足→束腰→柱身→顶盘）、围裙+暗缝、坐箱、
    三块独立坐垫、三块后倾 5.7° 的靠背面板+腰枕圆枕、卷臂（侧板+前后向圆枕+前卷盘）、靠枕与盖毯。
  - **硬约束（别改）**：占地 1.90 × 0.85、净空 ≥0.13（现在 0.205）、原点=占地中心+地面、正面朝 three +z。
    实测整体 1.9 × 0.855 × 0.85，底面 y=0，结构件左右完全镜像。
  - **节点数纪律**：一个 mesh = 一次 draw call，旧版 15 个。碎件必须**先烘修改器再 join**
    （`join()` 不继承非活动对象的修改器，粗倒角套到细滚边上会烂面），现在 14 个节点 / 5040 tri / 320 KB。
  - **2026-09-17 二次修改**：按反馈删掉每个坐垫的「中缝」与「前滚边」（原来是垫面正中一条
    从后贯到前的凸起白细条 + 前沿一条横贯垫宽的白圆管），坐垫正面留光面，只剩后/左/右三条滚边。
    脚本：`tools/sofa_trim_seam.py`（对**已 join** 的网格做连通块级删除，含会话副本备份与回滚 JSON）。
  - 场景组织：新沙发建在独立场景「SOFA · 客厅沙发 v2」（`tools/sofa_v2.py` 用"新建场景 + 复用
    blender_build.py 前缀"的方式建模，不动 `飞机.blend` 里的飞机场景）。
- **M29（已发布）：一楼客厅沙发正式换成 v2（M28 的模型进游戏）**
  - 导出：`tools/sofa_export.py` —— **从 Blender 当前会话的活动场景直接导出**（而不是全量重建），
    只选 `SOFA · 客厅沙发 v2` 里的沙发网格，排除 `preview_floor` 与三盏预览灯；
    导出前后各做一次包围盒/原点/净空自检，结束后还原选择集与活动场景（不写主文件）。
  - **共用文件拆开**：`sofa.glb` 原来被 `sofa`（一楼客厅）和 `sofa2`（二楼休息区）共用，
    只换一楼就必须拆：旧款存为 `models/pieces/sofa_lounge2.glb`，`models.js` 改
    `sofa: 'sofa'` / `sofa2: 'sofa_lounge2'`。新款覆盖 `sofa.glb`（320 KB，14 节点，5040 tri）。
  - `furniture.js` 的 `sofa()` 回退 builder 同步成新轮廓（车木腿+铜脚套、围裙+暗缝、坐箱、三坐垫
    各三条滚边+垫间暗缝、后倾靠背+腰枕圆枕、卷臂三件套），去掉靠枕与盖毯 —— 与用户手工删掉的件一致。
    实测兜底尺寸 1.900 × 0.881 × 0.850、底面 y=0、36 网格、parts 为空。
  - 实测（Chrome CDP 进游戏）：`window.__errors` 为空、`sofa`/`sofa2` 各 1 件、
    一楼 `getObjectByName('sofa_lumbar_roll')` 命中（确认走 GLB 而非兜底）、二楼仍是旧款（靠枕盖毯还在）。
  - **验收锚点**：宽 1.90 / 高 0.855 / 深 0.85，底面 y=0，X·Z 均居中，靠背在 -z（正面朝 +z），
    底部净空 0.145 ≥ 槽位要求的 0.13；四条腿在 x±0.845、z±0.345，与 `under` 槽位
    （cap[1.5,0.11,0.5] @ y0.07 → 占 x±0.75 / z[-0.2,0.3]）不干涉。
- **M30（2026-09-17）：M27–M29 三个里程碑正式发布（GitHub + Netlify），并堵住 `.blend` 源文件泄露**
  - 本次上线内容 = M27 电视精模 + 电视柜补腿、M28 沙发 v2 建模、M29 一楼换装 + 二楼拆分为
    `sofa_lounge2.glb`；同时提交 5 个新工具脚本（`convert_tv.py` / `inspect_blend.py` /
    `sofa_v2.py` / `sofa_trim_seam.py` / `sofa_export.py`）。
  - **泄露点（本次修复）**：`models/pieces/tv.blend`(466KB) 与 `tv.blend1`(489KB) 从未被忽略，
    `git add -A` 会进公开仓库、`netlify deploy --dir .` 会把它传上公网（Netlify 不看 `.gitignore`）。
    两头堵：`.gitignore` 加 `*.blend` / `*.blend1`；`_redirects` 加两条 404。**本地文件未移动、未删除。**
  - 详情与自查步骤见第 2 节；`.blend` 泄露属于"只做 gitignore 不够"的隐蔽坑。

## 6. 当前玩法操作（写死在 UI 文案里，改功能要同步改文案）

- 藏家：瞄准家具按 **E** 选位置 → 按序号选物品藏入 → **G** 完成；**Q** 关面板；瞄准书本按 **E** 直接抽出该书藏入书页间
- 找家：点击画面锁定鼠标，**WASD** 移动 / **Shift** 跑 / **E** 开门·抽屉·书本·检查·拿取（抽屉/书本对准把手所在面精确操作，同时只开一个）/ **Q** 关上抽屉书本 / **Esc** 退出本局
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
11. **join() 不吃 FONT/CURVE**：用 `bpy.ops.object.join()` 合并网格时，`o.type` 不是 `MESH` 的对象（文字是 `FONT`、线缆是 `CURVE`）不参与合并，**也不会跟着原点归零一起平移** —— 导出后停在原始绝对坐标上飘在模型外面（tv.blend 的品牌丝印就飘到电视左侧 1.06m 空中）。要么先把它们 `object.convert(target='MESH')`，要么在原点归零后给所有非网格对象补同一份 delta（`convert_tv.py` 用的是后者）。
12. **glTF 导出器只认 Principled BSDF**：源材质用了 Mix Shader / Glossy / Glass / Transparent 组合时，导出器映射不了，会**静默退化成 baseColor 纯白 + metallic/roughness 默认 1** —— 不报错，只在游戏里表现为"一片惨白"。外部 .blend 转游戏资产前，先按材质名扫一遍有没有缺 Principled 的。
13. **原点归零后 `matrix_world` 不会立刻更新**：脚本里改完 `o.location` 直接读 `o.matrix_world` 做自检会拿到旧值，误以为没生效。自检前必须 `bpy.context.view_layer.update()`。
