// placement.js — 藏家放置 UI：第一视角模式（数字键选物品与槽位）
import { canHide, SLOT_LABELS } from './slots.js';
import { ITEM_DEFS } from './items.js';

export class PlacementUI {
  constructor(interact, pieces, camera) {
    this.interact = interact;
    this.pieces = pieces;
    this.camera = camera;
    this.active = false;          // 仅藏匿阶段启用
    this.selectedItem = null;
    this.onDone = null;           // 完成藏匿回调
    this.onToast = null;
    this.maxItems = 2;            // 本回合可藏件数
    this.fpSlots = [];            // 当前面板里的可用槽位（数字键映射）

    this.trayEl = document.getElementById('item-tray');
    this.panelEl = document.getElementById('slot-panel');

    window.addEventListener('keydown', (e) => this._onKey(e));
  }

  get placedCount() { return this.interact.placedItems.length; }

  show() {
    this.active = true;
    this.selectedItem = null;
    this.fpSlots = [];
    this.panelEl.classList.add('hidden');
    this._renderTray();
    this.trayEl.classList.remove('hidden');
    this._toast(`你是藏家！先按 <b>1-${ITEM_DEFS.length}</b> 选物品，瞄准家具按 E 选位置（可藏 ${this.maxItems} 件）`);
  }

  hide() {
    this.active = false;
    this.trayEl.classList.add('hidden');
    this.panelEl.classList.add('hidden');
  }

  _toast(msg) { if (this.onToast) this.onToast(msg); }

  _renderTray() {
    this.trayEl.innerHTML = '';
    ITEM_DEFS.forEach((item, i) => {
      const btn = document.createElement('button');
      btn.className = 'tray-btn' + (this.selectedItem?.id === item.id ? ' selected' : '');
      const cm = (v) => Math.round(v * 100);
      btn.innerHTML = `<b>${i + 1}</b>·${item.name}<span class="size-tag">${cm(item.size[0])}×${cm(item.size[2])}×${cm(item.size[1])}cm</span>`;
      btn.onclick = () => this._select(item);
      this.trayEl.appendChild(btn);
    });
    const done = document.createElement('button');
    done.className = 'tray-btn';
    done.style.borderColor = '#58d68d';
    done.innerHTML = `<b>G</b>·完成藏匿`;
    done.onclick = () => this._tryFinish();
    this.trayEl.appendChild(done);
  }

  _select(item) {
    this.selectedItem = item;
    this._renderTray();
    this._toast(`已选「${item.name}」，瞄准家具按 E 打开藏匿面板`);
  }

  // E 瞄准家具后由 interact 调用：打开该家具的槽位面板
  openSlotPanelFor(piece) {
    if (!this.active || !this.selectedItem) { this._toast('先按 1-8 选一件要藏的物品'); return; }
    if (this.placedCount >= this.maxItems) { this._toast(`本回合最多藏 ${this.maxItems} 件，按 G 完成`); return; }
    const item = this.selectedItem;
    this.fpSlots = [];
    let html = `<h3>藏「${item.name}」到：${piece.def.name}</h3>`;
    const valid = [];
    piece.slots.forEach((slot) => {
      const check = canHide(item, slot);
      const occupied = !!slot.filledWith;
      const usable = check.ok && !occupied;
      const tag = occupied ? '（已有东西）' : (check.ok ? '' : `（${check.why}）`);
      if (usable) {
        valid.push(slot);
        html += `<button class="slot-btn ok" data-idx="${valid.length}"><b>${valid.length}</b>·${slot.name} · ${SLOT_LABELS[slot.type]}</button>`;
      } else {
        html += `<button class="slot-btn no" disabled>${slot.name}${tag}</button>`;
      }
    });
    if (!valid.length) html += `<p class="slot-note">这里没有能容纳「${item.name}」的位置</p>`;
    else html += `<p class="slot-note">按 <b>1-${valid.length}</b> 放入对应位置${this.placedCount + 1 < this.maxItems ? `，还可再藏 ${this.maxItems - this.placedCount - 1} 件` : ''}；按 <b>Q</b> 关闭面板</p>`;
    this.fpSlots = valid;
    this.panelEl.innerHTML = html;
    this.panelEl.classList.remove('hidden');
    this.panelEl.querySelectorAll('button[data-idx]').forEach(btn => {
      btn.onclick = () => this._placeInto(valid[+btn.dataset.idx - 1], piece);
    });
  }

  _placeInto(slot, piece) {
    const res = this.interact.placeItem(piece.def.id, slot.key, this.selectedItem.id);
    if (res.ok) {
      this._toast(`「${this.selectedItem.name}」已藏进${piece.def.name}的${slot.name}！`);
      this.panelEl.classList.add('hidden');
      this.fpSlots = [];
      this._renderTray();
      if (this.placedCount >= this.maxItems) this._toast(`已藏满 ${this.maxItems} 件，按 <b>G</b> 完成藏匿`);
    } else {
      this._toast(res.why);
    }
  }

  _tryFinish() {
    if (!this.placedCount) { this._toast('你还没藏任何东西！'); return; }
    this.hide();
    if (this.onDone) this.onDone();
  }

  _onKey(e) {
    if (!this.active) return;
    if (!document.pointerLockElement) return;   // 未锁定鼠标时用鼠标点按钮
    if (e.code === 'KeyG') { this._tryFinish(); return; }
    if (e.code === 'KeyQ') {
      this.panelEl.classList.add('hidden');
      this.fpSlots = [];
      return;
    }
    const n = parseInt(e.key, 10);
    if (isNaN(n)) return;
    if (this.fpSlots.length) {
      if (n >= 1 && n <= this.fpSlots.length) {
        // 找回面板对应的家具
        const slot = this.fpSlots[n - 1];
        const piece = this.pieces.find(p => p.def.id === slot.pieceId);
        this._placeInto(slot, piece);
      }
    } else if (n >= 1 && n <= ITEM_DEFS.length) {
      this._select(ITEM_DEFS[n - 1]);
    }
  }
}
