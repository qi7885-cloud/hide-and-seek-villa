// interact.js — 交互系统：开合动画 / 准星射线 / E键开闭与拾取 / 藏家放置
import * as THREE from 'three';
import { canHide } from './slots.js';
import { createItemMesh, itemById } from './items.js';

// ---------- 开合方式定义（每件家具：槽位 -> 动画部件） ----------
// kind: hinge=铰链门 slide=抽屉 book=书本抽出翻开 prop=直接动某节点 lift=掀地毯
const OPENABLE_DEFS = {
  tvCabinet: [
    { key: 'cabL', part: 'doorL', kind: 'hinge', hinge: [-0.76, 0.28, 0.215], axis: 'y', open: 1.9 },
    { key: 'cabR', part: 'doorR', kind: 'hinge', hinge: [0.76, 0.28, 0.215], axis: 'y', open: -1.9 },
  ],
  fridge: [
    { key: 'door', slots: ['inner', 'freezer'], part: 'door', kind: 'hinge', hinge: [-0.375, 0.89, 0.35], axis: 'y', open: 1.9 },
  ],
  counter: [
    { key: 'drawer1', part: 'drawer1', kind: 'slide', axis: 'z', open: 0.4 },
    { key: 'drawer2', part: 'drawer2', kind: 'slide', axis: 'z', open: 0.4 },
    { key: 'cab', part: 'cabDoor', kind: 'hinge', hinge: [-0.96, 0.25, 0.315], axis: 'y', open: -1.8 },
  ],
  wardrobe: [
    { key: 'doorL', slots: ['hang', 'topShelf'], part: 'doorL', kind: 'hinge', hinge: [-0.575, 1.0, 0.315], axis: 'y', open: 1.8 },
    { key: 'doorR', slots: ['hang', 'topShelf'], part: 'doorR', kind: 'hinge', hinge: [0.575, 1.0, 0.315], axis: 'y', open: -1.8 },
  ],
  nightstand: [
    { key: 'drawer', part: 'drawer', kind: 'slide', axis: 'z', open: 0.3 },
  ],
  dresser: [
    { key: 'drawer1', part: 'drawer1', kind: 'slide', axis: 'z', open: 0.34 },
    { key: 'drawer2', part: 'drawer2', kind: 'slide', axis: 'z', open: 0.34 },
  ],
  desk: [
    { key: 'drawer', part: 'drawer', kind: 'slide', axis: 'z', open: 0.4 },
  ],
  computerCase: [
    { key: 'inner', part: 'sidePanel', kind: 'hinge', hinge: [0.1, 0.23, -0.225], axis: 'y', open: 2.1 },
  ],
  toyChest: [
    { key: 'inner', part: 'lid', kind: 'hinge', hinge: [0, 0.385, -0.21], axis: 'x', open: -1.9 },
  ],
  mailbox: [
    { key: 'inner', part: 'door', kind: 'hinge', hinge: [-0.12, 1.12, 0.2], axis: 'y', open: -1.9 },
  ],
  carpetL: [
    { key: 'under', part: '__group', kind: 'lift', axis: 'x', open: -0.42, hinge: [0, 0, 0.9] },
  ],
  rugB: [
    { key: 'under', part: '__group', kind: 'lift', axis: 'x', open: -0.5, hinge: [0, 0, 0.5] },
  ],
  bookshelf: [
    { key: 'pages1', part: 'books:3', kind: 'book' },
    { key: 'pages2', part: 'books:14', kind: 'book' },
  ],
  pictureFrame: [
    { key: 'behind', part: 'tilt', kind: 'prop', axis: 'x', closed: -0.13, open: 0.55 },
  ],
};

export class Interaction {
  constructor(ctx, pieces, onPickup = null, player = null) {
    this.ctx = ctx;
    this.pieces = pieces;
    this.onPickup = onPickup;
    this.player = player;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 2.6;
    this.openEntries = [];       // 所有开合动画条目
    this.openBySlotKey = {};     // pieceId:slotKey -> entry
    this.placedItems = [];       // 已藏物品网格
    this.dropAnims = [];         // 放入动作动画 [{mesh, from, to, t}]
    this.bookTweens = [];        // 书本抽出/放回动画 [{proxy, from, to, t, dur, tilt}]
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
        let node;
        if (d.part === '__group') node = piece.group;
        else if (d.part.startsWith('books:')) node = piece.parts.books[+d.part.split(':')[1]];
        else node = piece.parts[d.part];
        if (!node) continue;

        const entry = {
          pieceId: piece.def.id, key: d.key, slotKeys: d.slots || [d.key],
          kind: d.kind, axis: d.axis, open: d.open, node,
          t: 0, target: 0, speed: 2.2,
          base: node.position.clone(), baseRot: node.rotation[d.axis] ?? 0,
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
            while (piece.group.children.length) pivot.add(piece.group.children[0]);
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
    // 书本抽出/放回动画
    for (let i = this.bookTweens.length - 1; i >= 0; i--) {
      const b = this.bookTweens[i];
      b.t = Math.min(1, b.t + dt / b.dur);
      const k = b.t * b.t * (3 - 2 * b.t);
      b.proxy.position.z = b.from + (b.to - b.from) * k;
      b.proxy.rotation.x = b.tilt * k;
      if (b.t >= 1) this.bookTweens.splice(i, 1);
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
    } else if (e.kind === 'book') {
      e.node.position.z = e.base.z + 0.1 * k;
      e.node.rotation.x = -0.55 * k;
    } else if (e.kind === 'prop') {
      e.node.rotation[e.axis] = e.closed + (e.open - e.closed) * k;
    }
  }

  togglePiece(pieceId, open = null) {
    const entries = this.openEntries.filter(e => e.pieceId === pieceId);
    if (!entries.length) return false;
    const anyClosed = entries.some(e => e.target === 0);
    const to = open === null ? anyClosed : open;
    for (const e of entries) e.target = to ? 1 : 0;
    return true;
  }

  isSlotOpen(pieceId, slotKey) {
    const e = this.openBySlotKey[`${pieceId}:${slotKey}`];
    return !e || e.t > 0.7;
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
      if (o.userData.isTargetItem) return { type: 'item', mesh: o, dist: h.distance };
      if (o.userData.pieceId) {
        const piece = this.pieces.find(p => p.def.id === o.userData.pieceId);
        if (piece) return { type: 'piece', piece, dist: h.distance };
      }
      o = o.parent;
    }
    return null;
  }

  // 准星正对的书本（书架动态藏匿用）：返回 {index, proxy, name} 或 null
  aimedBook() {
    const cam = this.ctx.camera;
    this.raycaster.setFromCamera({ x: 0, y: 0 }, cam);
    const piece = this.pieces.find(p => p.def.id === 'bookshelf');
    if (!piece || !piece.parts.books) return null;
    const books = piece.parts.books.filter(Boolean);
    const hits = this.raycaster.intersectObjects(books, true);
    if (!hits.length) return null;
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
    if (!base) return null;
    const key = base.split('__')[0];                      // 'part_book_25'
    const idx = books.findIndex(b => b.name === key || b.name.split('__')[0] === key);
    if (idx < 0) return null;
    return { index: idx, proxy: books[idx], name: `Vol.${idx + 1}` };
  }

  // 书页间槽位的动态书本列表（供面板提示可藏书册）
  bookList() {
    const piece = this.pieces.find(p => p.def.id === 'bookshelf');
    return piece?.parts.books?.filter(Boolean) ?? [];
  }

  // 书本抽出/放回动画：delta 相对书本原位（原位记录在 userData.baseZ）
  animateBook(proxy, delta, dur = 0.35, tilt = -0.35) {
    if (proxy.userData.baseZ === undefined) proxy.userData.baseZ = proxy.position.z;
    this.bookTweens = this.bookTweens.filter(b => b.proxy !== proxy);
    this.bookTweens.push({ proxy, from: proxy.position.z, to: proxy.userData.baseZ + delta, t: 0, dur, tilt });
  }

  // 容器已打开时，其中的物品视为可直接拿取（抽屉/冰箱/柜门/掀开的地毯/抽出的书）
  _exposedPickable(piece) {
    return piece.slots.find(s => {
      if (!s.filledWith) return false;
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
          text = hit.piece.slots.length
            ? `「${hit.piece.def.name}」—— 按 <b>E</b> 打开藏匿面板`
            : `「${hit.piece.def.name}」没有可藏位置`;
        }
      } else {
        const slot = this._exposedPickable(hit.piece);
        const hasOpenable = this.openEntries.some(e => e.pieceId === hit.piece.def.id);
        if (slot) {
          text = `按 <b>E</b> 拿起「${itemById(slot.filledWith).name}」`;
        } else if (hasOpenable) {
          const anyClosed = this.openEntries.some(e => e.pieceId === hit.piece.def.id && e.target === 0);
          text = `${hit.piece.def.name} —— 按 <b>E</b> ${anyClosed ? '打开' : '关上'}`;
        } else if (hit.piece.slots.some(s => s.type === 'interior' || s.type === 'soil')) {
          text = `按 <b>E</b> 检查${hit.piece.def.name}`;
        } else {
          text = hit.piece.def.name;
        }
      }
    }
    if (text) { this.promptEl.innerHTML = text; this.promptEl.classList.remove('hidden'); }
    else this.promptEl.classList.add('hidden');
    this._lastHit = hit;
  }

  // ---------- 检查特写（水杯/果盘/垃圾桶/花盆等直视容器） ----------
  _enterInspect(piece, slot) {
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
    // 藏家藏匿模式：E 在家具上打开槽位面板
    if (this.hideMode) {
      const hit = this._lastHit;
      if (hit && hit.type === 'piece' && hit.piece.slots.length && this.onHideInteract) {
        this.onHideInteract(hit.piece);
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
    // 先尝试开合（柜门/抽屉/地毯/书本）
    if (this.togglePiece(hit.piece.def.id)) return;
    // 再尝试检查直视容器（杯/盘/桶/盆栽）
    const insSlot = hit.piece.slots.find(s => s.type === 'interior' || s.type === 'soil');
    if (insSlot) this._enterInspect(hit.piece, insSlot);
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
      const baseZ = book.userData.baseZ ?? book.position.z;
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
        case 'behind': mesh.rotation.x = Math.PI / 2; y += ih / 2; break;  // 立在相框后
      }
      pos = new THREE.Vector3(slot.worldPos.x, y, slot.worldPos.z);
      if (slot.type === 'top') mesh.rotation.y = (Math.random() - 0.5) * 0.6;
    }
    // 放入动作：从槽位上方 0.35m 落入
    mesh.position.copy(pos).add(new THREE.Vector3(0, 0.35, 0));
    mesh.userData = { isTargetItem: true, itemId, pieceId, slotKey,
      ...(extra.bookIndex != null ? { bookIndex: extra.bookIndex } : {}) };
    this.ctx.scene.add(mesh);
    this.dropAnims.push({ mesh, from: mesh.position.clone(), to: pos.clone(), t: 0 });
    this.placedItems.push(mesh);
    slot.filledWith = itemId;
    if (extra.bookIndex != null) slot.bookIndex = extra.bookIndex;
    return { ok: true };
  }

  // 藏匿时把物品藏进第 b 本书后，让找家阶段的开合指向那本书
  remapBookEntry(pieceId, slotKey, bookIndex) {
    const entry = this.openBySlotKey[`${pieceId}:${slotKey}`];
    const piece = this.pieces.find(p => p.def.id === pieceId);
    const book = piece?.parts.books?.[bookIndex];
    if (entry && book) {
      entry.node = book;
      const baseZ = book.userData.baseZ ?? book.position.z;
      entry.base = new THREE.Vector3(book.position.x, book.position.y, baseZ);
    }
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
