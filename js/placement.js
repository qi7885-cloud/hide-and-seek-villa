// placement.js — 藏家放置 UI：
// 流程：瞄准家具按 E → 打开家具+选位置(槽位序号) → 按物品序号藏入（物品落入动画）
// 书架书页间：瞄准哪本书就藏进哪本（面板实时显示 Vol.N，书本抽出→藏入→放回）
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

    this.trayEl = document.getElementById('item-tray');
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
    this._renderTray();
    this.trayEl.classList.remove('hidden');
    this._toast(`你是藏家！选中您要藏的家具按 <b>E</b> 选择位置，再按物品序号进行藏匿（本回合可藏 ${this.maxItems} 件）`);
  }

  hide() {
    this.active = false;
    this._closePiece();
    this.stage = 'idle';
    this.trayEl.classList.add('hidden');
    this.panelEl.classList.add('hidden');
  }

  _toast(msg) { if (this.onToast) this.onToast(msg); }

  _renderTray() {
    this.trayEl.innerHTML = '';
    ITEM_DEFS.forEach((item, i) => {
      const btn = document.createElement('button');
      btn.className = 'tray-btn';
      const cm = (v) => Math.round(v * 100);
      btn.innerHTML = `<b>${i + 1}</b>·${item.name}<span class="size-tag">${cm(item.size[0])}×${cm(item.size[2])}×${cm(item.size[1])}cm</span>`;
      btn.onclick = () => this._pickItem(item);
      this.trayEl.appendChild(btn);
    });
    const done = document.createElement('button');
    done.className = 'tray-btn';
    done.style.borderColor = '#58d68d';
    done.innerHTML = `<b>G</b>·完成藏匿`;
    done.onclick = () => this._tryFinish();
    this.trayEl.appendChild(done);
  }

  // E 瞄准家具后由 interact 调用：书本瞄准模式下=确认藏入；否则打开槽位面板
  onAimE(piece) {
    if (this.stage === 'book') { this._confirmBook(); return; }
    this.openSlotPanelFor(piece);
  }

  // 打开某家具的槽位面板（联动把家具打开）
  openSlotPanelFor(piece) {
    if (!this.active) return;
    if (this.placedCount >= this.maxItems) { this._toast(`本回合最多藏 ${this.maxItems} 件，按 <b>G</b> 完成`); return; }
    if (this.openedPieceId && this.openedPieceId !== piece.def.id) this._closePiece();
    this.piece = piece;
    this.openedPieceId = piece.def.id;
    this.interact.togglePiece(piece.def.id, true);   // 联动开：柜门/抽屉/盖子
    this.stage = 'slot';
    this.slot = null;
    this.fpSlots = [];
    const cm = (v) => Math.round(v * 100);
    let html = `<h3>藏到：${piece.def.name} —— 选位置</h3>`;
    const valid = [];
    piece.slots.forEach((slot) => {
      const occupied = !!slot.filledWith;
      const tag = occupied ? '（已有东西）' : '';
      if (!occupied) {
        valid.push(slot);
        const cap = slot.cap ? `<span class="size-tag">容 ${cm(slot.cap[0])}×${cm(slot.cap[2])}×${cm(slot.cap[1])}cm</span>` : '';
        html += `<button class="slot-btn ok" data-idx="${valid.length}"><b>${valid.length}</b>·${slot.name} · ${SLOT_LABELS[slot.type] || '藏点'}${cap}</button>`;
      } else {
        html += `<button class="slot-btn no" disabled>${slot.name}${tag}</button>`;
      }
    });
    if (!valid.length) html += `<p class="slot-note">这里已经藏满了</p>`;
    else html += `<p class="slot-note">按 <b>1-${valid.length}</b> 选位置；按 <b>Q</b> 关闭面板</p>`;
    this.fpSlots = valid;
    this.panelEl.innerHTML = html;
    this.panelEl.classList.remove('hidden');
    this.panelEl.querySelectorAll('button[data-idx]').forEach(btn => {
      btn.onclick = () => this._chooseSlot(valid[+btn.dataset.idx - 1]);
    });
  }

  // 选好位置 → 展示可藏的物品（含尺寸，放不下的标灰）
  _chooseSlot(slot) {
    this.stage = 'item';
    this.slot = slot;
    const cm = (v) => Math.round(v * 100);
    const capTxt = slot.cap ? `${cm(slot.cap[0])}×${cm(slot.cap[2])}×${cm(slot.cap[1])}cm` : '—';
    let html = `<h3>位置：${this.piece.def.name} · ${slot.name}（容 ${capTxt}）—— 选物品</h3>`;
    ITEM_DEFS.forEach((item, i) => {
      const check = canHide(item, slot);
      const cls = check.ok ? 'ok' : 'no';
      const sz = `${cm(item.size[0])}×${cm(item.size[2])}×${cm(item.size[1])}cm`;
      if (check.ok) {
        html += `<button class="slot-btn ok" data-item="${item.id}"><b>${i + 1}</b>·${item.name}<span class="size-tag">${sz}</span></button>`;
      } else {
        html += `<button class="slot-btn no" disabled><b>${i + 1}</b>·${item.name}<span class="size-tag">${sz}（${check.why}）</span></button>`;
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
        // 藏书动画：把书抽得更开 → 物品落入 → 书放回原位夹住物品
        const book = this.aimedBook.proxy;
        this.interact.animateBook(book, 0.16, 0.4, -0.4);
        this.interact.remapBookEntry(this.piece.def.id, this.slot.key, this.aimedBook.index);
        setTimeout(() => this.interact.animateBook(book, 0, 0.45, 0), 500);
        this._toast(`「${item.name}」已夹进${this.aimedBook.name}！`);
      } else {
        this._toast(`「${item.name}」已藏进${this.piece.def.name}的${this.slot.name}！`);
      }
      this.slot = null;
      this.stage = 'slot';
      this.aimedBook = null;
      this.openSlotPanelFor(this.piece);   // 回到选位置，可继续藏
      if (this.placedCount >= this.maxItems) {
        this._toast(`已藏满 ${this.maxItems} 件，按 <b>G</b> 完成藏匿`);
        this._closePanel();
      }
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
    this._renderTray();
    // 直接进入物品选择（书页间只容纸类，面板上会标出来）
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
      this.interact.togglePiece(this.openedPieceId, false);   // 联动合上
      this.openedPieceId = null;
    }
    this.piece = null;
  }

  _tryFinish() {
    if (!this.placedCount) { this._toast('你还没藏任何东西！'); return; }
    this.hide();
    if (this.onDone) this.onDone();
  }

  // 每帧：书本瞄准模式下实时拾取准星书本并微抽出预览
  update() {
    if (!this.active || this.stage !== 'book') return;
    const aim = this.interact.aimedBook();
    if (aim !== this.aimedBook) {
      if (this.aimedBook) this.interact.animateBook(this.aimedBook.proxy, 0, 0.2, 0);
      this.aimedBook = aim;
      if (aim) this.interact.animateBook(aim.proxy, 0.06, 0.2, -0.12);
      const name = aim ? `${aim.name}（第 ${aim.index + 1} 本）` : '——';
      const h3 = this.panelEl.querySelector('h3');
      if (h3) h3.innerHTML = `藏进书页间 —— 将藏入：<b>${name}</b>`;
    }
  }

  _pickItem(item) {
    if (this.stage === 'item' && this.slot) { this._placeItem(item); return; }
    this._toast('先瞄准家具按 <b>E</b> 选位置');
  }

  _onKey(e) {
    if (!this.active) return;
    if (e.code === 'KeyG') { this._tryFinish(); return; }
    if (e.code === 'KeyQ') {
      if (this.stage === 'item' && this.piece) { this.openSlotPanelFor(this.piece); return; }
      if (this.stage === 'book' && this.piece) { this.openSlotPanelFor(this.piece); return; }
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
