// placement.js — 藏家放置 UI：
// 流程：瞄准家具按 E → 打开家具+选位置(槽位序号) → 按物品序号藏入（物品落入动画）
// 书架书页间：瞄准哪本书就藏进哪本（面板实时显示 Vol.N，书本抽出→藏入→放回）
// 底部物品栏已取消（选位置后面板内直接选物品），底部改为操作提示条
import * as THREE from 'three';
import { canHide, SLOT_LABELS } from './slots.js';
import { ITEM_DEFS } from './items.js';

export class PlacementUI {
  constructor(interact, pieces, camera) {
    this.interact = interact;
    this.pieces = pieces;
    this.camera = camera;
    this.active = false;          // 仅藏匿阶段启用
    this.onDone = null;           // 完成藏匿回调
    this.onToast = null;
    this.maxItems = 2;            // 本回合可藏件数
    this.fpSlots = [];            // 槽位阶段：当前面板里的可用槽位（数字键映射）
    this.stage = 'idle';          // idle | slot(选位置) | item(选物品) | book(瞄准书本)
    this.piece = null;            // 当前面板家具
    this.slot = null;             // 已选槽位（item 阶段）
    this.openedPieceId = null;    // 被面板联动打开的家具（关闭时合上）
    this.aimedBook = null;        // 书本瞄准模式下的准星书本

    this.helpEl = document.getElementById('help-bar');
    this.panelEl = document.getElementById('slot-panel');

    window.addEventListener('keydown', (e) => this._onKey(e));
  }

  get placedCount() { return this.interact.placedItems.length; }

  show() {
    this.active = true;
    this.stage = 'idle';
    this.piece = null;
    this.slot = null;
    this.openedPieceId = null;
    this.aimedBook = null;
    this.fpSlots = [];
    this.panelEl.classList.add('hidden');
    this.helpEl.classList.remove('hidden');
    this._updateHelp();
    this._toast(`你是藏家！选中您要藏的家具按 <b>E</b> 选择位置，再按物品序号进行藏匿（本回合可藏 ${this.maxItems} 件）`);
  }

  hide() {
    this.active = false;
    clearTimeout(this._bookTimer);
    this._closePiece();
    this.stage = 'idle';
    this.helpEl.classList.add('hidden');
    this.panelEl.classList.add('hidden');
  }

  _toast(msg) { if (this.onToast) this.onToast(msg); }

  // 底部提示条：按键 + 规则 + 进度
  _updateHelp() {
    if (!this.active) return;
    this.helpEl.innerHTML =
      `【藏家】瞄准家具按 <b>E</b> 选位置 → 数字键藏物品 <span class="hb-sep">|</span>` +
      `<b>Q</b> 关闭面板 <span class="hb-sep">|</span> <b>G</b> 完成藏匿 <span class="hb-sep">|</span> ` +
      `<b>Esc</b> 退出本局 <span class="hb-sep">|</span> ` +
      `规则：把 ${this.maxItems} 件物品藏好交给对方找 · <span class="hb-count">已藏 ${this.placedCount}/${this.maxItems} 件</span>`;
  }

  // E 瞄准家具后由 interact 调用：书本瞄准模式下=确认藏入；否则打开槽位面板
  // （entry：准星命中的具体开合部件，抽屉面板只拉开那一个）
  onAimE(piece, entry = null) {
    if (this.stage === 'book') { this._confirmBook(); return; }
    this.openSlotPanelFor(piece, entry);
  }

  // 准星正对书本时按 E：直接抽出那本书进入"选物品藏入"
  onAimBook(piece, book) {
    if (!this.active) return;
    // 书页间瞄准模式下=确认这本书
    if (this.stage === 'book' && this.piece === piece) { this.aimedBook = book; this._confirmBook(); return; }
    if (this.placedCount >= this.maxItems) { this._toast(`本回合最多藏 ${this.maxItems} 件，按 <b>G</b> 完成`); return; }
    const slot = this._pagesSlotFor(piece, book);
    if (!slot) return;
    if (slot.filledWith) { this._toast(`${slot.name}已经藏了东西，换另一层书架的书试试`); return; }
    if (this.openedPieceId && this.openedPieceId !== piece.def.id) this._closePiece();
    this.piece = piece;
    this.openedPieceId = piece.def.id;
    this.slot = slot;
    this.aimedBook = book;
    this.interact.openBook(book.proxy);   // 抽出这本书（同抽屉：全局单开）
    this._chooseSlot(slot);               // 直接进入选物品
  }

  // 按书本所在层高匹配书页间槽位
  _pagesSlotFor(piece, book) {
    const slots = piece.slots.filter(s => s.type === 'pages');
    if (!slots.length) return null;
    book.proxy.updateMatrixWorld(true);
    const wy = book.proxy.getWorldPosition(new THREE.Vector3()).y;
    let best = null, bd = Infinity;
    for (const s of slots) {
      const d = Math.abs(s.worldPos.y - wy);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // 打开某家具的槽位面板（柜门/盖子全开；抽屉只拉开准星瞄准的那个）
  openSlotPanelFor(piece, aimedEntry = null) {
    if (!this.active) return;
    if (this.placedCount >= this.maxItems) { this._toast(`本回合最多藏 ${this.maxItems} 件，按 <b>G</b> 完成`); return; }
    if (this.openedPieceId && this.openedPieceId !== piece.def.id) this._closePiece();
    this.piece = piece;
    this.openedPieceId = piece.def.id;
    this.interact.focusPiece(piece.def.id, aimedEntry);   // 联动开：柜门/盖子 + 瞄准的抽屉

    // 精确瞄准且该条目只对应一个可用槽位（独立抽屉/单格门）：
    // 跳过"选位置"直接进"选物品"——瞄准上抽屉就不该再看到下抽屉（2026-09-18 用户反馈）
    if (aimedEntry && aimedEntry.slotKeys && aimedEntry.slotKeys.length === 1) {
      const aimed = piece.slots.find(x => x.key === aimedEntry.slotKeys[0]);
      if (aimed && !aimed.filledWith
          && !(aimed.type === 'under' && !this.interact.revealable(piece.def.id, aimed.key))) {
        this._chooseSlot(aimed);
        return;
      }
    }

    this.stage = 'slot';
    this.slot = null;
    this.fpSlots = [];
    let html = `<h3>藏到：${piece.def.name} —— 选位置</h3>`;
    const valid = [];
    piece.slots.forEach((slot) => {
      const occupied = !!slot.filledWith;
      // 床底/沙发底等没有揭示动画的位置禁止藏入：藏了找家阶段永远拿不到
      const unviewable = slot.type === 'under' && !this.interact.revealable(piece.def.id, slot.key);
      const tag = occupied ? '（已有东西）' : unviewable ? '（无法查看）' : '';
      if (!occupied && !unviewable) {
        valid.push(slot);
        html += `<button class="slot-btn ok" data-idx="${valid.length}"><b>${valid.length}</b>·${slot.name} · ${SLOT_LABELS[slot.type] || '藏点'}</button>`;
      } else {
        html += `<button class="slot-btn no" disabled>${slot.name}${tag}</button>`;
      }
    });
    if (!valid.length) html += `<p class="slot-note">这里已经藏满了</p>`;
    else html += `<p class="slot-note">按序号选位置，按 <b>Q</b> 关闭面板</p>`;
    this.fpSlots = valid;
    this.panelEl.innerHTML = html;
    this.panelEl.classList.remove('hidden');
    this.panelEl.querySelectorAll('button[data-idx]').forEach(btn => {
      btn.onclick = () => this._chooseSlot(valid[+btn.dataset.idx - 1]);
    });
  }

  // 选好位置 → 展示可藏的物品（放不下的灰显不可选）
  _chooseSlot(slot) {
    this.stage = 'item';
    this.slot = slot;
    // 位置是另一个抽屉时，合上先前拉开的、拉开这一个（全局单开）
    const entry = this.interact.entryForSlot(this.piece.def.id, slot.key);
    if (entry && entry.kind === 'slide' && entry.target !== 1) this.interact.openSolo(entry);
    let html = `<h3>位置：${this.piece.def.name} · ${slot.name} —— 选物品</h3>`;
    ITEM_DEFS.forEach((item, i) => {
      const check = canHide(item, slot);
      if (check.ok) {
        html += `<button class="slot-btn ok" data-item="${item.id}"><b>${i + 1}</b>·${item.name}</button>`;
      } else {
        html += `<button class="slot-btn no" disabled><b>${i + 1}</b>·${item.name}</button>`;
      }
    });
    html += `<p class="slot-note">按 <b>1-8</b> 藏入对应物品；按 <b>Q</b> 返回选位置</p>`;
    this.panelEl.innerHTML = html;
    this.panelEl.classList.remove('hidden');
    this.panelEl.querySelectorAll('button[data-item]').forEach(btn => {
      btn.onclick = () => this._placeItem(ITEM_DEFS.find(d => d.id === btn.dataset.item));
    });
  }

  _placeItem(item) {
    if (!this.slot) return;
    const isPages = this.slot.type === 'pages';
    const extra = {};
    if (isPages) {
      if (!this.aimedBook) { this._toast('先瞄准书架上的一本书'); return; }
      extra.bookIndex = this.aimedBook.index;
    }
    const res = this.interact.placeItem(this.piece.def.id, this.slot.key, item.id, extra);
    if (res.ok) {
      if (isPages && this.aimedBook) {
        // 藏书动画：书保持抽出 → 物品落入原位 → 稍后放回夹住物品
        const proxy = this.aimedBook.proxy;
        clearTimeout(this._bookTimer);
        this._bookTimer = setTimeout(() => this.interact.closeBook(proxy), 500);
        this._toast(`「${item.name}」已夹进${this.aimedBook.name}！`);
      } else {
        this._toast(`「${item.name}」已藏进${this.piece.def.name}的${this.slot.name}！`);
      }
      this.slot = null;
      this.stage = 'slot';
      this.aimedBook = null;
      this._updateHelp();
      if (this.placedCount >= this.maxItems) {
        // 已藏满：直接收面板，只提示一次
        this._closePanel();
        this._toast(`已藏满 ${this.maxItems} 件，按 <b>G</b> 完成藏匿`);
        return;
      }
      this.openSlotPanelFor(this.piece);   // 回到选位置，可继续藏
    } else {
      this._toast(res.why);
    }
  }

  // 书页间槽位进入"瞄准书本"模式：面板提示 + 准星书本实时预览
  _enterBookAim(slot) {
    this.stage = 'book';
    this.slot = slot;
    this.aimedBook = null;
    this.panelEl.innerHTML = `<h3>藏进书页间 —— 移动准星选书</h3>
      <p class="slot-note">面板会随准星实时显示将藏入的书本；按 <b>E</b> 确认，<b>Q</b> 返回</p>`;
    this.panelEl.classList.remove('hidden');
  }

  _confirmBook() {
    if (!this.aimedBook) { this._toast('准星没有对准任何一本书'); return; }
    this.stage = 'item';
    // 直接进入物品选择（书页间只容纸类，放不下的会灰显）
    this._chooseSlot(this.slot);
  }

  // 关面板并合上家具
  _closePanel() {
    this.panelEl.classList.add('hidden');
    this.fpSlots = [];
    this.stage = 'idle';
    this.slot = null;
    this.aimedBook = null;
    this._closePiece();
  }

  _closePiece() {
    if (this.openedPieceId) {
      this.interact.closePiece(this.openedPieceId);   // 合上柜门/抽屉/书本
      this.openedPieceId = null;
    }
    this.piece = null;
  }

  _tryFinish() {
    if (!this.placedCount) { this._toast('你还没藏任何东西！'); return; }
    this.hide();
    if (this.onDone) this.onDone();
  }

  // 每帧：书本瞄准模式下实时拾取准星书本并抽出预览（开新书自动合上上一本）
  update() {
    if (!this.active || this.stage !== 'book') return;
    const aim = this.interact.aimedBook(this.piece);
    // aimedBook() 每次返回新对象，按其中的书本代理比较，避免每帧重复触发动画
    if (aim?.proxy !== this.aimedBook?.proxy) {
      if (this.aimedBook) this.interact.closeBook(this.aimedBook.proxy);
      this.aimedBook = aim;
      if (aim) this.interact.openBook(aim.proxy);
      const name = aim ? `${aim.name}（第 ${aim.index + 1} 本）` : '——';
      const h3 = this.panelEl.querySelector('h3');
      if (h3) h3.innerHTML = `藏进书页间 —— 将藏入：<b>${name}</b>`;
    }
  }

  _onKey(e) {
    if (!this.active) return;
    if (e.code === 'KeyG') { this._tryFinish(); return; }
    if (e.code === 'KeyQ') {
      if (this.stage === 'item' && this.piece) { this.openSlotPanelFor(this.piece); return; }
      if (this.stage === 'book' && this.piece) {
        if (this.aimedBook) this.interact.closeBook(this.aimedBook.proxy);   // 合上预览的书
        this.openSlotPanelFor(this.piece);
        return;
      }
      this._closePanel();
      return;
    }
    const n = parseInt(e.key, 10);
    if (isNaN(n)) return;
    if (this.stage === 'slot' && this.fpSlots.length) {
      if (n >= 1 && n <= this.fpSlots.length) {
        const slot = this.fpSlots[n - 1];
        if (slot.type === 'pages') this._enterBookAim(slot);
        else this._chooseSlot(slot);
      }
    } else if (this.stage === 'item' && this.slot) {
      if (n >= 1 && n <= ITEM_DEFS.length) this._placeItem(ITEM_DEFS[n - 1]);
    }
  }
}
