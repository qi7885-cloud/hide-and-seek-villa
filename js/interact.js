// interact.js — 交互系统：开合动画 / 准星射线 / E键开闭与拾取 / 藏家放置
import * as THREE from 'three';
import { canHide } from './slots.js';
import { createItemMesh, itemById } from './items.js';

const _tmpQuat = new THREE.Quaternion();
const _tmpVec = new THREE.Vector3();

// ---------- 开合方式定义（每件家具：槽位 -> 动画部件） ----------
// kind: hinge=铰链门 slide=抽屉 book=书本抽出翻开 prop=直接动某节点 lift=掀地毯
const OPENABLE_DEFS = {
  tvCabinet: [
    // v2 全覆盖门板：门缘从 ±0.76 移到 ±0.798、门板外凸到 z 0.225，铰链随门缘/门板中心同步
    { key: 'cabL', part: 'doorL', kind: 'hinge', hinge: [-0.798, 0.28, 0.225], axis: 'y', open: -1.9 },
    { key: 'cabR', part: 'doorR', kind: 'hinge', hinge: [0.798, 0.28, 0.225], axis: 'y', open: 1.9 },
  ],
  fridge: [
    { key: 'door', slots: ['inner', 'freezer'], part: 'door', kind: 'hinge', hinge: [-0.375, 0.89, 0.35], axis: 'y', open: -1.9 },
  ],
  counter: [
    { key: 'drawer1', part: 'drawer1', kind: 'slide', axis: 'z', open: 0.4 },
    { key: 'drawer2', part: 'drawer2', kind: 'slide', axis: 'z', open: 0.4 },
    { key: 'cab', part: 'cabDoor', kind: 'hinge', hinge: [-1.16, 0.25, 0.315], axis: 'y', open: -1.8 },
  ],
  wardrobe: [
    // v2 全覆盖门板：铰链=左门左缘 x=-0.597，z=门板中心 0.309（19mm 铰链外凸）
    { key: 'doorL', slots: ['hang', 'topShelf'], part: 'doorL', kind: 'hinge', hinge: [-0.597, 1.0, 0.309], axis: 'y', open: -1.8 },
    { key: 'doorR', slots: ['hang', 'topShelf'], part: 'doorR', kind: 'hinge', hinge: [0.597, 1.0, 0.309], axis: 'y', open: 1.8 },
  ],
  wardrobe2: [
    { key: 'doorL', slots: ['hang', 'topShelf'], part: 'doorL', kind: 'hinge', hinge: [-0.597, 1.0, 0.309], axis: 'y', open: -1.8 },
    { key: 'doorR', slots: ['hang', 'topShelf'], part: 'doorR', kind: 'hinge', hinge: [0.597, 1.0, 0.309], axis: 'y', open: 1.8 },
  ],
  nightstand: [
    { key: 'drawer1', part: 'drawer', kind: 'slide', axis: 'z', open: 0.3 },
    { key: 'drawer2', part: 'drawer2', kind: 'slide', axis: 'z', open: 0.3 },
  ],
  nightstand2: [
    { key: 'drawer1', part: 'drawer', kind: 'slide', axis: 'z', open: 0.3 },
    { key: 'drawer2', part: 'drawer2', kind: 'slide', axis: 'z', open: 0.3 },
  ],
  dresser: [
    { key: 'drawer1', part: 'drawer1', kind: 'slide', axis: 'z', open: 0.34 },
    { key: 'drawer2', part: 'drawer2', kind: 'slide', axis: 'z', open: 0.34 },
  ],
  dresser2: [
    { key: 'drawer1', part: 'drawer1', kind: 'slide', axis: 'z', open: 0.34 },
    { key: 'drawer2', part: 'drawer2', kind: 'slide', axis: 'z', open: 0.34 },
  ],
  desk: [
    { key: 'drawer', part: 'drawer', kind: 'slide', axis: 'z', open: 0.4 },
  ],
  desk2: [
    { key: 'drawer', part: 'drawer', kind: 'slide', axis: 'z', open: 0.4 },
  ],
  computerCase: [
    // v2 玻璃侧板在远离书桌一侧（local -x/世界东）：铰链 rear 缘随侧板镜像，前缘把手向外开取负角
    { key: 'inner', part: 'sidePanel', kind: 'hinge', hinge: [-0.1, 0.23, -0.225], axis: 'y', open: -2.1 },
  ],
  toyChest: [
    { key: 'inner', part: 'lid', kind: 'hinge', hinge: [0, 0.36, -0.22], axis: 'x', open: -1.9 },
  ],
  mailbox: [
    { key: 'inner', part: 'door', kind: 'hinge', hinge: [-0.12, 1.12, 0.2], axis: 'y', open: -1.9 },
  ],
  microwave: [
    { key: 'door', slots: ['inner'], part: 'door', kind: 'hinge', hinge: [-0.23, 0.15, 0.20], axis: 'y', open: -1.9 },
  ],
  shoeCabinet: [
    { key: 'inner', part: 'door', kind: 'hinge', hinge: [-0.43, 0.55, 0.175], axis: 'y', open: -1.9 },
  ],
  wallCabinet: [
    { key: 'inner', part: 'door', kind: 'hinge', hinge: [-0.47, 0.35, 0.165], axis: 'y', open: -1.9 },
  ],
  fileCabinet: [
    { key: 'drawer1', part: 'drawer', kind: 'slide', axis: 'z', open: 0.35 },
    { key: 'drawer2', part: 'drawer2', kind: 'slide', axis: 'z', open: 0.35 },
  ],
  carpetL: [
    { key: 'under', part: '__group', kind: 'lift', axis: 'x', open: -0.42, hinge: [0, 0, 0.9] },
  ],
  rugB: [
    { key: 'under', part: '__group', kind: 'lift', axis: 'x', open: -0.5, hinge: [0, 0, 0.5] },
  ],
  bookshelf: [
    { key: 'books', part: 'books:*', kind: 'book' },
  ],
  bookshelf2: [
    { key: 'books', part: 'books:*', kind: 'book' },
  ],
};

export class Interaction {
  constructor(ctx, pieces, onPickup = null, player = null) {
    this.ctx = ctx;
    this.pieces = pieces;
    this.onPickup = onPickup;
    // 联机找家（2026-09-18 方案①）：搜查回调由 main 注入；藏点在服务端，只答中/不中
    this.onOnlineCheck = null;    // async (pieceId, slotKey) → {hit, itemId?, expired?}
    this.onOnlineExpired = null;  // 服务端计时到 → 结算
    this.onOnlineToast = null;    // 搜查提示文案
    this.player = player;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 2.6;
    this.openEntries = [];       // 所有开合动画条目
    this.openBySlotKey = {};     // pieceId:slotKey -> entry
    this._entryByNode = new Map(); // 开合部件节点 -> entry（准星判定用）
    this.onEntryToggle = null;   // (entry, open) 开合意图回调（main.js 接音效）
    this.placedItems = [];       // 已藏物品网格
    this.dropAnims = [];         // 放入动作动画 [{mesh, from, to, t}]
    this.inspecting = null;      // 检查特写状态
    this.promptEl = document.getElementById('interact-prompt');
    this.enabled = false;        // 找家阶段才启用 E 交互
    this.hideMode = false;       // 藏家第一视角藏匿模式
    this.onHideInteract = null;  // 藏匿模式：E 瞄准家具回调(piece)
    this._buildOpenables();
    this._bindKeys();
    ctx.tickHandlers.push((dt) => this.update(dt));
  }

  _buildOpenables() {
    // 先用原始矩阵定格各槽位世界坐标（开合替换结构不影响槽位坐标空间）
    const originalMat = new Map();
    for (const piece of this.pieces) {
      piece.group.updateMatrixWorld(true);
      originalMat.set(piece.def.id, piece.group.matrixWorld.clone());
    }

    for (const piece of this.pieces) {
      const defs = OPENABLE_DEFS[piece.def.id] || [];
      for (const d of defs) {
        // 书架：每本书各自成为可开合条目（精确瞄准某本书抽出）
        if (d.part === 'books:*') {
          const books = (piece.parts.books || []).filter(Boolean);
          for (let bi = 0; bi < books.length; bi++) {
            const node = books[bi];
            const entry = {
              pieceId: piece.def.id, key: `book:${bi}`, slotKeys: [],
              kind: 'book', axis: null, open: null, node,
              t: 0, target: 0, speed: 2.2,
              base: node.position.clone(), pivot: null,
            };
            this.openEntries.push(entry);
            this._entryByNode.set(node, entry);
          }
          continue;
        }
        let node;
        if (d.part === '__group') node = piece.group;
        else node = piece.parts[d.part];
        if (!node) continue;

        const entry = {
          pieceId: piece.def.id, key: d.key, slotKeys: d.slots || [d.key],
          kind: d.kind, axis: d.axis, open: d.open, node,
          t: 0, target: 0, speed: 2.2,
          base: node.position.clone(),
          pivot: null,
        };

        if (d.kind === 'hinge' || d.kind === 'lift') {
          const pivot = new THREE.Object3D();
          if (d.part === '__group') {
            // 整块家具做铰链（地毯）：铰链位置需换算到世界坐标
            const hingeWorld = new THREE.Vector3(...d.hinge).applyMatrix4(piece.group.matrixWorld);
            pivot.position.copy(hingeWorld);
            const parent = piece.group.parent;
            const wr = piece.group.rotation.y;
            // attach 保世界变换：地毯停在原位，之后绕铰链整体掀起
            while (piece.group.children.length) pivot.attach(piece.group.children[0]);
            pivot.rotation.y = wr;
            parent.remove(piece.group);
            parent.add(pivot);
            pivot.userData.pieceId = piece.def.id;   // 射线归属链需要
            piece.group = pivot;
            entry.pivot = pivot; entry.node = pivot;
          } else {
            pivot.position.set(...d.hinge);
            piece.group.add(pivot);
            pivot.attach(node);
            entry.pivot = pivot; entry.node = pivot;
          }
        }
        this.openEntries.push(entry);
        this._entryByNode.set(entry.node, entry);
        for (const sk of entry.slotKeys) this.openBySlotKey[`${piece.def.id}:${sk}`] = entry;
      }
    }

    // 用原始矩阵回填槽位世界坐标
    for (const piece of this.pieces) {
      const m = originalMat.get(piece.def.id);
      for (const s of piece.slots) {
        s.worldPos = new THREE.Vector3(...s.offset).applyMatrix4(m);
      }
    }
  }

  _bindKeys() {
    this._onKey = (e) => {
      if (e.repeat) return;   // 按住不连发（E 开一次，Q 关一次）
      if (e.code === 'KeyR') {
        // 联机找家：R 搜查当前家具的直查槽位（书页间走"抽书自动搜查"路径）
        if (this.hideMode || !this.enabled || this.inspecting || !this.onOnlineCheck) return;
        const hit = this._lastHit;
        if (hit && hit.type === 'piece' && hit.dist < 2.5) this._onlineSearch(hit.piece);
        return;
      }
      if (e.code === 'KeyQ') {
        if (this.hideMode || !this.enabled || this.inspecting) return;
        // Q：关上当前打开的抽屉/书本（全局同时只开一个）
        for (const en of this.openEntries) {
          if ((en.kind === 'slide' || en.kind === 'book') && en.target === 1) this._setTarget(en, false);
        }
        return;
      }
      if (e.code !== 'KeyE') return;
      if (this.hideMode) { this._act(); return; }
      if (!this.enabled) return;
      this._act();
    };
    document.addEventListener('keydown', this._onKey);
  }

  // ---------- 动画 ----------
  update(dt) {
    for (const e of this.openEntries) {
      const dir = Math.sign(e.target - e.t);
      if (dir !== 0) {
        e.t = THREE.MathUtils.clamp(e.t + dir * e.speed * dt, 0, 1);
        this._apply(e);
      }
    }
    // 放入动作：物品从槽位上方落入
    for (let i = this.dropAnims.length - 1; i >= 0; i--) {
      const a = this.dropAnims[i];
      a.t = Math.min(1, a.t + dt / 0.45);
      const k = a.t * a.t * (3 - 2 * a.t);
      a.mesh.position.lerpVectors(a.from, a.to, k);
      if (a.t >= 1) this.dropAnims.splice(i, 1);
    }
    if (this.inspecting) this._updateInspect(dt);
    else this._raycastPrompt();
  }

  _apply(e) {
    const k = e.t * e.t * (3 - 2 * e.t); // smoothstep
    if (e.kind === 'hinge') {
      e.pivot.rotation[e.axis] = e.open * k;
    } else if (e.kind === 'lift') {
      e.pivot.rotation[e.axis] = e.open * k;
    } else if (e.kind === 'slide') {
      e.node.position[e.axis] = e.base[e.axis] + e.open * k;
      // 藏在抽屉里的物品跟随滑出（考虑家具朝向，把局部轴位移换算成世界位移）
      const parent = e.node.parent;
      if (parent) {
        const q = parent.getWorldQuaternion(_tmpQuat.set(0, 0, 0, 1));
        _tmpVec.set(0, 0, 0);
        _tmpVec[e.axis] = e.open * k;
        _tmpVec.applyQuaternion(q);
        for (const m of this.placedItems) {
          if (m.userData.pieceId === e.pieceId && e.slotKeys.includes(m.userData.slotKey)
              && m.userData._restPos) {
            m.position.set(
              m.userData._restPos.x + _tmpVec.x,
              m.userData._restPos.y + _tmpVec.y,
              m.userData._restPos.z + _tmpVec.z);
          }
        }
      }
    } else if (e.kind === 'book') {
      e.node.position.z = e.base.z + 0.16 * k;
      e.node.rotation.x = -0.6 * k;
    }
  }

  // 开合意图统一入口：更新目标并通知（main.js 接音效）
  _setTarget(e, open, notify = true) {
    const v = open ? 1 : 0;
    if (e.target === v) return;
    e.target = v;
    if (notify && this.onEntryToggle) this.onEntryToggle(e, !!open);
    if (open && this.onOnlineCheck) this._autoCheckEntry(e);   // 联机找家：开容器即搜查
  }

  // ---------- 联机找家：搜查 ----------
  _onlineMsg(t) { if (this.onOnlineToast) this.onOnlineToast(t); }

  async _onlineCheck(pieceId, slotKey) {
    try {
      const r = await this.onOnlineCheck(pieceId, slotKey);
      if (r && r.expired && this.onOnlineExpired) this.onOnlineExpired();
      return r || { hit: false };
    } catch {
      return { hit: false, error: true };
    }
  }

  // 开容器（抽屉/柜门/盖子/书本）时自动搜查其暴露的槽位；命中即把物品生成进去
  _autoCheckEntry(e) {
    const keys = (e.slotKeys && e.slotKeys.length) ? e.slotKeys
      : (e.kind === 'book' ? ['pages'] : []);        // 书本条目无 slotKeys：虚拟页间槽
    for (const key of keys) {
      const slotKey = e.kind === 'book' ? 'pages' : key;
      this._onlineCheck(e.pieceId, slotKey).then(r => {
        if (r.hit) {
          this._spawnFind(e.pieceId, slotKey, r.itemId,
            e.kind === 'book' ? Number(e.key.split(':')[1]) : undefined);
        }
      });
    }
  }

  // R 键：搜查当前家具的直查槽位（书页间不在 R 内枚举——抽出哪本查哪本）
  async _onlineSearch(piece) {
    const slots = piece.slots.filter(s => s.type !== 'pages');
    if (!slots.length) {
      this._onlineMsg(`${piece.def.name}：没有可搜的格子，翻翻抽屉和柜门`);
      return;
    }
    this._onlineMsg(`正在搜查${piece.def.name}…`);
    for (const s of slots) {
      const r = await this._onlineCheck(piece.def.id, s.key);
      if (r.hit) { this._spawnFind(piece.def.id, s.key, r.itemId); return; }
      if (r.error) return;
    }
    this._onlineMsg(`${piece.def.name}：这里没有藏东西`);
  }

  // 服务端判定命中：物品落进槽位（有落入动画），随后按 E 走本地拾取流程
  _spawnFind(pieceId, slotKey, itemId, bookIndex) {
    const r = this.placeItem(pieceId, slotKey, itemId,
      bookIndex != null ? { bookIndex } : {});
    if (r.ok) {
      const item = itemById(itemId);
      this._onlineMsg(`💥 有发现！「${item.name}」就在里面 —— 按 <b>E</b> 拿起来`);
    }
  }

  // 抽屉/书本全局单开：开 entry 前先合上其他所有已开的抽屉与书本
  openSolo(entry) {
    for (const e of this.openEntries) {
      if (e === entry) continue;
      if ((e.kind === 'slide' || e.kind === 'book') && e.target === 1) this._setTarget(e, false);
    }
    this._setTarget(entry, true);
  }

  // 合上某件家具的所有开合部件（放置面板关闭时用）
  closePiece(pieceId) {
    for (const e of this.openEntries) {
      if (e.pieceId === pieceId) this._setTarget(e, false);
    }
  }

  // 放置面板打开时的联动：瞄准抽屉/书只开它（柜门不动）；
  // 无瞄准或瞄准柜门时开柜门/盖子（双门联动）；单抽屉家具无瞄准时拉唯一抽屉
  focusPiece(pieceId, aimedEntry = null) {
    const entries = this.openEntries.filter(e => e.pieceId === pieceId);
    if (aimedEntry && (aimedEntry.kind === 'slide' || aimedEntry.kind === 'book')) {
      this.openSolo(aimedEntry);
      return;
    }
    const doors = entries.filter(e => e.kind === 'hinge' || e.kind === 'lift');
    if (doors.length) {
      for (const e of doors) this._setTarget(e, true);
      return;
    }
    const slides = entries.filter(e => e.kind === 'slide');
    if (slides.length === 1) this.openSolo(slides[0]);
  }

  // 准星命中的具体开合部件（抽屉把手所在面/某本书）：沿父链找 entry
  _aimedEntry(hit) {
    if (!hit || hit.type !== 'piece') return null;
    for (let o = hit.object; o; o = o.parent) {
      const e = this._entryByNode.get(o);
      if (e && e.pieceId === hit.piece.def.id) return e;
      if (o === hit.piece.group) break;
    }
    return null;
  }

  // 槽位对应的开合条目
  entryForSlot(pieceId, slotKey) {
    return this.openBySlotKey[`${pieceId}:${slotKey}`] || null;
  }

  // 按书本代理开/合（placement 瞄准预览与藏匿动画用；开遵循全局单开）
  openBook(proxy) {
    const e = this._entryByNode.get(proxy);
    if (e) this.openSolo(e);
  }

  closeBook(proxy) {
    const e = this._entryByNode.get(proxy);
    if (e) this._setTarget(e, false);
  }

  togglePiece(pieceId, open = null) {
    const entries = this.openEntries.filter(e => e.pieceId === pieceId && e.kind !== 'slide' && e.kind !== 'book');
    if (!entries.length) return false;
    const anyClosed = entries.some(e => e.target === 0);
    const to = open === null ? anyClosed : open;
    for (const e of entries) this._setTarget(e, to);
    return true;
  }

  // 该槽位是否有对应的揭示动画（决定能否作为藏点：藏了必须找得到）
  revealable(pieceId, slotKey) {
    return !!this.openBySlotKey[`${pieceId}:${slotKey}`];
  }

  // 回合切换/退出时复位交互状态：退出检查特写、合上所有柜门抽屉
  resetRound() {
    this._exitInspect();
    for (const e of this.openEntries) e.target = 0;
    this._lastHit = null;
  }

  // ---------- 射线与提示 ----------
  _currentHit() {
    const cam = this.ctx.camera;
    this.raycaster.setFromCamera({ x: 0, y: 0 }, cam);
    const targets = this.pieces.map(p => p.group).concat(this.placedItems);
    const hits = this.raycaster.intersectObjects(targets, true);
    if (!hits.length) return null;
    const h = hits[0];
    // 沿父链找归属
    let o = h.object;
    while (o) {
      if (o.userData.isTargetItem) return { type: 'item', mesh: o, dist: h.distance, object: h.object };
      if (o.userData.pieceId) {
        const piece = this.pieces.find(p => p.def.id === o.userData.pieceId);
        if (piece) return { type: 'piece', piece, dist: h.distance, object: h.object };
      }
      o = o.parent;
    }
    return null;
  }

  // 准星正对的书本：返回 {piece, index, proxy, name} 或 null
  // piece 省略时在所有书架上找（placement 书页间瞄准用）
  aimedBook(piece = null) {
    const cam = this.ctx.camera;
    this.raycaster.setFromCamera({ x: 0, y: 0 }, cam);
    const shelves = (piece && piece.parts.books?.length) ? [piece]
      : this.pieces.filter(p => p.parts.books?.length);
    for (const shelf of shelves) {
      const books = shelf.parts.books.filter(Boolean);
      if (!books.length) continue;
      const hits = this.raycaster.intersectObjects(books, true);
      if (!hits.length) continue;
      // 沿父链向上找到 part_book_NN 前缀名，再到 books 数组里按名匹配（跨包装层）
      let o = hits[0].object;
      let base = null;
      while (o) {
        if (o.name && o.name.startsWith('part_book_')) {
          // 取最外层（最短的）part_book_NN 名字
          if (!base || o.name.length < base.length) base = o.name;
        }
        o = o.parent;
      }
      if (!base) continue;
      const key = base.split('__')[0];                      // 'part_book_25'
      const idx = books.findIndex(b => b.name === key || b.name.split('__')[0] === key);
      if (idx < 0) continue;
      return { piece: shelf, index: idx, proxy: books[idx], name: `Vol.${idx + 1}` };
    }
    return null;
  }

  // 容器已打开时，其中的物品视为可直接拿取（抽屉/冰箱/柜门/掀开的地毯/抽出的书）
  _exposedPickable(piece) {
    return piece.slots.find(s => {
      if (!s.filledWith) return false;
      if (s.type === 'pages') {
        // 书页间：藏入的书（slot.bookIndex）被抽出时才可拿取
        if (s.bookIndex == null) return false;
        const book = piece.parts.books?.[s.bookIndex];
        const e = book && this._entryByNode.get(book);
        return !!(e && e.t > 0.7);
      }
      const e = this.openBySlotKey[`${piece.def.id}:${s.key}`];
      return e && e.t > 0.7;
    });
  }

  _raycastPrompt() {
    if (!this.enabled && !this.hideMode) return;
    let text = null;
    if (!document.pointerLockElement) {
      text = '点击画面锁定鼠标才能操作';
      this.promptEl.innerHTML = text;
      this.promptEl.classList.remove('hidden');
      this._lastHit = null;
      return;
    }
    const hit = this._currentHit();
    if (hit && hit.dist < 2.5) {
      if (hit.type === 'item' && !this.hideMode) {
        text = `按 <b>E</b> 拿起「${itemById(hit.mesh.userData.itemId)?.name ?? '?'}」`;
      } else if (this.hideMode) {
        if (hit.type === 'piece') {
          const entry = this._aimedEntry(hit);
          if (entry?.kind === 'book') {
            text = `「Vol.${parseInt(entry.key.slice(5)) + 1}」—— 按 <b>E</b> 打开书本藏物`;
          } else if (entry?.kind === 'slide') {
            const slot = hit.piece.slots.find(s => s.key === entry.slotKeys[0]);
            text = `「${hit.piece.def.name} · ${slot?.name ?? '抽屉'}」—— 按 <b>E</b> 打开藏匿面板`;
          } else if (hit.piece.slots.length) {
            text = `「${hit.piece.def.name}」—— 按 <b>E</b> 打开藏匿面板`;
          } else {
            text = `「${hit.piece.def.name}」没有可藏位置`;
          }
        }
      } else {
        const slot = this._exposedPickable(hit.piece);
        if (slot) {
          text = `按 <b>E</b> 拿起「${itemById(slot.filledWith).name}」`;
        } else {
          const entry = this._aimedEntry(hit);
          if (entry && (entry.kind === 'slide' || entry.kind === 'book')) {
            // 抽屉/书本：精确到准星所在的那个
            const label = entry.kind === 'book'
              ? `Vol.${parseInt(entry.key.slice(5)) + 1}`
              : `${hit.piece.def.name} · ${hit.piece.slots.find(s => s.key === entry.slotKeys[0])?.name ?? '抽屉'}`;
            text = entry.target === 1
              ? `${label} —— 按 <b>E/Q</b> 关上`
              : `${label} —— 按 <b>E</b> 打开`;
          } else if (this.openEntries.some(e => e.pieceId === hit.piece.def.id && e.kind !== 'slide' && e.kind !== 'book')) {
            const anyClosed = this.openEntries.some(e => e.pieceId === hit.piece.def.id && e.kind !== 'slide' && e.kind !== 'book' && e.target === 0);
            text = `${hit.piece.def.name} —— 按 <b>E</b> ${anyClosed ? '打开' : '关上'}`;
          } else if (hit.piece.slots.some(s => s.type === 'interior' || s.type === 'soil')) {
            text = `按 <b>E</b> 检查${hit.piece.def.name}`;
          } else {
            text = this.onOnlineCheck
              ? `${hit.piece.def.name} —— 按 <b>R</b> 搜查`
              : hit.piece.def.name;
          }
        }
      }
    }
    if (text) { this.promptEl.innerHTML = text; this.promptEl.classList.remove('hidden'); }
    else this.promptEl.classList.add('hidden');
    this._lastHit = hit;
  }

  // ---------- 检查特写（水杯/果盘/垃圾桶/花盆等直视容器） ----------
  _enterInspect(piece, slot) {
    if (this.onOnlineCheck) {
      // 联机找家：检查特写即搜查该格，命中则物品直接出现在格内（特写提示会随之变为"藏着…"）
      this._onlineCheck(piece.def.id, slot.key).then(r => {
        if (r.hit) this._spawnFind(piece.def.id, slot.key, r.itemId);
      });
    }
    const cam = this.ctx.camera;
    if (this.player) this.player.frozen = true;
    const target = new THREE.Vector3(slot.worldPos.x, slot.worldPos.y + 0.34, slot.worldPos.z + 0.22);
    const lookAt = slot.worldPos.clone();
    const m = new THREE.Matrix4().lookAt(target, lookAt, new THREE.Vector3(0, 1, 0));
    this.inspecting = {
      pieceId: piece.def.id, slot,
      fromPos: cam.position.clone(), fromQuat: cam.quaternion.clone(),
      toPos: target, toQuat: new THREE.Quaternion().setFromRotationMatrix(m),
      t: 0,
    };
  }

  _updateInspect(dt) {
    const ins = this.inspecting;
    const cam = this.ctx.camera;
    ins.t = Math.min(1, ins.t + dt * 2.6);
    const k = ins.t * ins.t * (3 - 2 * ins.t);
    cam.position.lerpVectors(ins.fromPos, ins.toPos, k);
    cam.quaternion.slerpQuaternions(ins.fromQuat, ins.toQuat, k);
    const mesh = this.placedItems.find(m =>
      m.userData.pieceId === ins.pieceId && m.userData.slotKey === ins.slot.key);
    this.promptEl.innerHTML = mesh
      ? `里面藏着「${itemById(mesh.userData.itemId).name}」！按 <b>E</b> 拿起`
      : `${ins.slot.name}是空的 —— 按 <b>E</b> 退出`;
    this.promptEl.classList.remove('hidden');
  }

  _exitInspect() {
    this.inspecting = null;
    if (this.player) this.player.frozen = false;
  }

  _act() {
    // 藏家藏匿模式：E 在家具上打开槽位面板；正对书本则直接打开那本书进入藏物
    if (this.hideMode) {
      const hit = this._lastHit;
      if (hit && hit.type === 'piece' && hit.dist < 2.5) {
        if (hit.piece.parts.books?.length) {
          const book = this.aimedBook(hit.piece);
          if (book && this.onHideBook) { this.onHideBook(hit.piece, book); return; }
        }
        if (hit.piece.slots.length && this.onHideInteract) {
          this.onHideInteract(hit.piece, this._aimedEntry(hit));
        }
      }
      return;
    }
    // 检查特写模式下：E = 拿取槽内物品（没有则退出）
    if (this.inspecting) {
      const ins = this.inspecting;
      const mesh = this.placedItems.find(m =>
        m.userData.pieceId === ins.pieceId && m.userData.slotKey === ins.slot.key);
      if (mesh && this.onPickup) this.onPickup(mesh.userData, mesh);
      this._exitInspect();
      return;
    }
    const hit = this._lastHit;
    if (!hit || hit.dist > 2.5) return;
    if (hit.type === 'item') {
      if (this.onPickup) this.onPickup(hit.mesh.userData, hit.mesh);
      return;
    }
    // 打开的容器：直接拿取其中的物品
    const slot = this._exposedPickable(hit.piece);
    if (slot) {
      const mesh = this.placedItems.find(m =>
        m.userData.pieceId === hit.piece.def.id && m.userData.slotKey === slot.key);
      if (mesh && this.onPickup) this.onPickup(mesh.userData, mesh);
      return;
    }
    // 抽屉/书本：准星落在哪个部件上就只开合那一个（全局同时只开一个）
    const entry = this._aimedEntry(hit);
    if (entry && (entry.kind === 'slide' || entry.kind === 'book')) {
      if (entry.target === 1) this._setTarget(entry, false);
      else this.openSolo(entry);
      return;
    }
    // 再尝试开合柜门/盖子（双门联动）
    if (this.togglePiece(hit.piece.def.id)) return;
    // 最后尝试检查直视容器（杯/盘/桶/盆栽/储物架等）
    const interiors = hit.piece.slots.filter(s => s.type === 'interior' || s.type === 'soil');
    if (interiors.length) {
      // 多藏格的家具（如储物架）：优先检查已藏了东西的那格
      const filled = interiors.find(s => s.filledWith);
      this._enterInspect(hit.piece, filled || interiors[0]);
    }
  }

  // ---------- 藏匿放置 ----------
  // 把物品放进槽位：校验+生成网格+定位朝向
  // extra.bookIndex: 书架书页间指定藏入第几本（动态瞄准）
  placeItem(pieceId, slotKey, itemId, extra = {}) {
    const piece = this.pieces.find(p => p.def.id === pieceId);
    const slot = piece?.slots.find(s => s.key === slotKey);
    const item = itemById(itemId);
    if (!piece || !slot || !item) return { ok: false, why: '参数错误' };
    if (slot.filledWith) return { ok: false, why: '这个位置已经有东西了' };
    const check = canHide(item, slot);
    if (!check.ok) return check;

    const mesh = createItemMesh(item);
    const [iw, ih] = item.size;
    // 纸类对折：网格按对折比例缩小（与 canHide 的校验逻辑一致）
    if (slot.allowFold && (item.tags || []).includes('paper')) {
      const dims = item.size;
      const mi = dims.indexOf(Math.max(...dims));
      const s = [1, 1, 1];
      s[mi] = 0.5;
      mesh.scale.set(...s);
    }
    let pos;
    if (slot.type === 'pages' && extra.bookIndex != null) {
      // 动态书本：物品竖着夹进被抽出那本书的原位（书本随后放回夹住它）
      const book = piece.parts.books[extra.bookIndex];
      if (!book) return { ok: false, why: '书本不存在' };
      book.updateMatrixWorld(true);
      const e = this._entryByNode.get(book);
      const baseZ = e ? e.base.z : (book.userData.baseZ ?? book.position.z);
      const rest = new THREE.Vector3(book.position.x, book.position.y, baseZ)
        .applyMatrix4(book.parent.matrixWorld);
      mesh.rotation.z = Math.PI / 2;
      pos = rest;
    } else {
      let y = slot.worldPos.y;
      switch (slot.type) {
        case 'top': case 'under': y += ih / 2; break;
        case 'interior': case 'drawer': y += ih / 2 - slot.cap[1] / 2; break;
        case 'soil': y += ih / 4; break;                                   // 半埋进土里
        case 'pages': mesh.rotation.z = Math.PI / 2; break;                // 竖着夹进书页
      }
      pos = new THREE.Vector3(slot.worldPos.x, y, slot.worldPos.z);
      if (slot.type === 'top') mesh.rotation.y = (Math.random() - 0.5) * 0.6;
    }
    // 放入动作：从槽位上方 0.35m 落入
    mesh.position.copy(pos).add(new THREE.Vector3(0, 0.35, 0));
    mesh.userData = { isTargetItem: true, itemId, pieceId, slotKey, _restPos: pos.clone(),
      ...(extra.bookIndex != null ? { bookIndex: extra.bookIndex } : {}) };
    this.ctx.scene.add(mesh);
    this.dropAnims.push({ mesh, from: mesh.position.clone(), to: pos.clone(), t: 0 });
    this.placedItems.push(mesh);
    slot.filledWith = itemId;
    if (extra.bookIndex != null) slot.bookIndex = extra.bookIndex;
    return { ok: true };
  }

  removeItem(mesh) {
    this.ctx.scene.remove(mesh);
    this.placedItems = this.placedItems.filter(m => m !== mesh);
    const piece = this.pieces.find(p => p.def.id === mesh.userData.pieceId);
    const slot = piece?.slots.find(s => s.key === mesh.userData.slotKey);
    if (slot) slot.filledWith = null;
  }

  clearAllItems() {
    for (const m of [...this.placedItems]) this.removeItem(m);
  }
}
