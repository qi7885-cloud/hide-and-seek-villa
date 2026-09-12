// placement.js — 藏家放置 UI：底部物品栏选择物品 + 右侧槽位面板选择藏匿点
import { canHide, SLOT_LABELS } from './slots.js';
import { ITEM_DEFS } from './items.js';

export class PlacementUI {
  constructor(interact, pieces, camera) {
    this.interact = interact;
    this.pieces = pieces;
    this.camera = camera;
    this.active = false;          // 仅藏匿阶段启用
    this.selectedItem = null;
    this.targetPiece = null;
    this.onDone = null;           // 完成藏匿回调
    this.onToast = null;

    this.trayEl = document.getElementById('item-tray');
    this.panelEl = document.getElementById('slot-panel');
  }

  show() {
    this.active = true;
    this.selectedItem = null;
    this._renderTray();
    this.trayEl.classList.remove('hidden');
    this._toast('先在下方选择要藏的物品，再点击家具选位置');
  }

  hide() {
    this.active = false;
    this.trayEl.classList.add('hidden');
    this.panelEl.classList.add('hidden');
  }

  _toast(msg) { if (this.onToast) this.onToast(msg); }

  _renderTray() {
    this.trayEl.innerHTML = '';
    for (const item of ITEM_DEFS) {
      const btn = document.createElement('button');
      btn.className = 'tray-btn' + (this.selectedItem?.id === item.id ? ' selected' : '');
      const cm = (v) => Math.round(v * 100);
      btn.innerHTML = `${item.name}<span class="size-tag">${cm(item.size[0])}×${cm(item.size[2])}×${cm(item.size[1])}cm</span>`;
      btn.onclick = () => {
        this.selectedItem = item;
        this._renderTray();
        this._toast(`已选「${item.name}」，点击家具查看可藏位置`);
      };
      this.trayEl.appendChild(btn);
    }
    const done = document.createElement('button');
    done.className = 'tray-btn';
    done.style.borderColor = '#58d68d';
    done.textContent = '✔ 完成藏匿';
    done.onclick = () => {
      if (!this.interact.placedItems.length) { this._toast('你还没藏任何东西！'); return; }
      this.hide();
      if (this.onDone) this.onDone();
    };
    this.trayEl.appendChild(done);
  }

  // 由 main 注入 THREE 与画布后调用，负责点击拾取家具
  initPick(THREE, dom) {
    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    dom.addEventListener('click', (e) => {
      if (!this.active || !this.selectedItem) {
        if (this.active && !this.selectedItem) this._toast('先在下方选择要藏的物品');
        return;
      }
      const rect = dom.getBoundingClientRect();
      this._ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this._ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this._ray.setFromCamera(this._ndc, this.camera);
      const hits = this._ray.intersectObjects(this.pieces.map(p => p.group), true);
      if (!hits.length) { this.panelEl.classList.add('hidden'); return; }
      let o = hits[0].object;
      while (o && !o.userData.pieceId) o = o.parent;
      if (!o) return;
      const piece = this.pieces.find(p => p.def.id === o.userData.pieceId);
      if (!piece || !piece.slots.length) { this._toast(`「${piece?.def.name}」没有可以藏东西的地方`); return; }
      this.targetPiece = piece;
      this._renderPanel(piece);
    });
  }

  _renderPanel(piece) {
    const item = this.selectedItem;
    this.panelEl.innerHTML = `<h3>藏「${item.name}」到：${piece.def.name}</h3>`;
    for (const slot of piece.slots) {
      const btn = document.createElement('button');
      btn.className = 'slot-btn';
      let disable = false, note = '';
      if (slot.filledWith) { disable = true; note = '（已有东西）'; }
      const check = canHide(item, slot);
      if (!check.ok) { disable = true; note = `（${check.why}）`; btn.classList.add('no'); }
      else btn.classList.add('ok');
      btn.disabled = disable;
      btn.textContent = `${slot.name} · ${SLOT_LABELS[slot.type]}${note}`;
      btn.onclick = () => {
        const res = this.interact.placeItem(piece.def.id, slot.key, item.id);
        if (res.ok) {
          this._toast(`「${item.name}」已藏进${piece.def.name}的${slot.name}！`);
          this._renderPanel(piece);
        } else {
          this._toast(res.why);
        }
      };
      this.panelEl.appendChild(btn);
    }
    const tip = document.createElement('p');
    tip.className = 'slot-note';
    tip.textContent = '灰色位置放不下或有东西了；想换物品就在下方重选';
    this.panelEl.appendChild(tip);
    this.panelEl.classList.remove('hidden');
  }
}
