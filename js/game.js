// game.js — 回合状态机：MENU → HIDE(藏家) → COVER(传递) → SEEK(找家) → RESULT
import * as THREE from 'three';
import { itemById } from './items.js';

export const Phase = { MENU: 'menu', HIDE: 'hide', COVER: 'cover', SEEK: 'seek', RESULT: 'result' };

export class Game {
  constructor(ctx, villa, pieces, interact, placement, player, godCam, avatar, pip) {
    this.ctx = ctx;
    this.villa = villa;
    this.pieces = pieces;
    this.interact = interact;
    this.placement = placement;
    this.player = player;
    this.godCam = godCam;
    this.avatar = avatar;
    this.pip = pip;

    this.phase = Phase.MENU;
    this.settings = { rounds: 3, seekTime: 120, hints: true };
    this.round = 0;
    this.score = { hider: 0, seeker: 0 };  // 藏家得分=成功藏过；找家得分=找到
    this.timer = 0;
    this.target = null;                    // 本回合被藏的物品 {itemId, pieceId, slotKey}
    this.onToast = null;

    placement.onDone = () => this.confirmHide();
    interact.onPickup = (userData) => this.onItemFound(userData);
  }

  toast(msg) { if (this.onToast) this.onToast(msg); }

  // ---- 开始新一回合（藏家先手） ----
  startRound() {
    this.round++;
    this.interact.clearAllItems();
    this._setPhase(Phase.HIDE);
    this.player.frozen = true;
    this.player.setLock(false);
    this.godCam.enabled = true;
    this.placement.show();
    this.toast(`第 ${this.round}/${this.settings.rounds} 回合 —— 你是藏家，藏一件东西吧`);
  }

  // ---- 藏家确认完成 ----
  confirmHide() {
    if (this.phase !== Phase.HIDE) return;
    const placed = this.interact.placedItems[this.interact.placedItems.length - 1];
    if (placed) this.target = { ...placed.userData };
    this.placement.hide();
    this.godCam.enabled = false;
    this._setPhase(Phase.COVER);
    document.getElementById('screen-cover').classList.remove('hidden');
  }

  // ---- 找家开始搜索 ----
  beginSeek() {
    if (this.phase !== Phase.COVER) return;
    document.getElementById('screen-cover').classList.add('hidden');
    this._setPhase(Phase.SEEK);
    this.timer = this.settings.seekTime;
    this.player.frozen = false;
    this.player.setLock(true);
    this.player.teleport(this.villa.spawn.seeker.pos, this.villa.spawn.seeker.yaw);
    this.interact.enabled = true;
    this.pip.enabled = true;           // 藏家第三人称观战画中画
    this.toast('你是找家！限时找出被藏起来的东西');
  }

  // ---- 找到物品 ----
  onItemFound(userData) {
    if (this.phase !== Phase.SEEK) return;
    const mesh = this.interact.placedItems.find(m => m.userData.itemId === userData.itemId);
    if (mesh) this.interact.removeItem(mesh);
    this._endRound(true, userData.itemId, userData.pieceId, userData.slotKey);
  }

  // ---- 回合结束 ----
  _endRound(found, itemId, pieceId, slotKey) {
    this.interact.enabled = false;
    this.player.setLock(false);
    this.player.frozen = true;
    this.pip.enabled = false;
    document.getElementById('timer').classList.add('hidden');
    if (found) this.score.seeker++;
    else this.score.hider++;
    this._setPhase(Phase.RESULT);
    const title = document.getElementById('result-title');
    const detail = document.getElementById('result-detail');
    const score = document.getElementById('result-score');
    if (found) {
      const item = itemById(itemId);
      title.textContent = '🎉 被找到了！';
      detail.innerHTML = `「${item ? item.name : itemId}」就藏在里面，找家用时 ${Math.round(this.settings.seekTime - this.timer)} 秒`;
    } else {
      title.textContent = '⏰ 时间到！没找到';
      detail.innerHTML = '藏家守住了秘密';
    }
    score.textContent = `比分 —— 找家 ${this.score.seeker} : ${this.score.hider} 藏家`;
    document.getElementById('screen-result').classList.remove('hidden');
  }

  // ---- 下一回合 / 结束 ----
  nextRound() {
    document.getElementById('screen-result').classList.add('hidden');
    if (this.round >= this.settings.rounds) {
      const s = this.score;
      const draw = s.seeker === s.hider;
      const winner = draw ? '平局！' : (s.seeker > s.hider ? '找家' : '藏家');
      document.getElementById('result-title').textContent = draw ? '🤝 平局！' : `🏆 ${winner}获胜！`;
      document.getElementById('result-detail').innerHTML = `最终比分 —— 找家 ${s.seeker} : ${s.hider} 藏家<br>刷新页面可重新开始`;
      document.getElementById('result-score').textContent = '';
      const btn = document.getElementById('btn-next-round');
      btn.textContent = '再来一局';
      btn.onclick = () => location.reload();
      document.getElementById('screen-result').classList.remove('hidden');
      this._setPhase(Phase.MENU);
      return;
    }
    this.startRound();
  }

  // ---- 计时 ----
  tick(dt) {
    if (this.phase !== Phase.SEEK) return;
    this.timer -= dt;
    const tEl = document.getElementById('timer');
    tEl.classList.remove('hidden');
    const m = Math.max(0, Math.floor(this.timer / 60));
    const s = Math.max(0, Math.floor(this.timer % 60));
    tEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    tEl.classList.toggle('urgent', this.timer < 20);
    if (this.timer <= 0) this._endRound(false);
  }

  _setPhase(p) { this.phase = p; }
}
