// game.js — 回合状态机：MENU → HIDE(藏家FP) → COVER(传递) → SEEK(找家) → RESULT
import * as THREE from 'three';
import { itemById } from './items.js';
import { SFX } from './audio.js';

export const Phase = { MENU: 'menu', HIDE: 'hide', COVER: 'cover', SEEK: 'seek', RESULT: 'result' };

export class Game {
  constructor(ctx, villa, pieces, interact, placement, player, godCam) {
    this.ctx = ctx;
    this.villa = villa;
    this.pieces = pieces;
    this.interact = interact;
    this.placement = placement;
    this.player = player;
    this.godCam = godCam;

    this.phase = Phase.MENU;
    this.settings = { rounds: 3, seekTime: 120, hints: true, hideCount: 2 };
    this.round = 0;
    this.score = { hider: 0, seeker: 0 };
    this.timer = 0;
    this.hintCooldown = 0;
    this.targets = [];          // 本回合所有藏匿物 [{itemId, pieceName, slotName, found}]
    this.onToast = null;

    placement.onDone = () => this.confirmHide();
    placement.maxItems = this.settings.hideCount;
    interact.onPickup = (userData, mesh) => this.onItemFound(userData, mesh);
  }

  toast(msg) { if (this.onToast) this.onToast(msg); }

  // ---- 开始新一回合（藏家第一视角布置） ----
  startRound() {
    this.round++;
    this.interact.resetRound();
    this.interact.clearAllItems();
    this.targets = [];
    this.placement.maxItems = this.settings.hideCount;
    this._setPhase(Phase.HIDE);
    this.player.frozen = false;
    this.player.setLock(true);
    this.player.teleport(this.villa.spawn.seeker.pos, this.villa.spawn.seeker.yaw);
    this.interact.enabled = false;
    this.interact.hideMode = true;
    this.placement.show();
    this._crosshair(true);
    this._banner(`第 ${this.round}/${this.settings.rounds} 回合 · 藏家第一视角布置`);
  }

  // ---- 藏家确认完成 ----
  confirmHide() {
    if (this.phase !== Phase.HIDE) return;
    this.interact.hideMode = false;
    this.placement.hide();
    this.player.frozen = true;
    this.player.setLock(false);
    // 记录所有藏匿目标
    const nameOf = (pid) => { const p = this.pieces.find(q => q.def.id === pid); return p ? p.def.name : pid; };
    this.targets = this.interact.placedItems.map(m => ({
      itemId: m.userData.itemId,
      pieceId: m.userData.pieceId,
      pieceName: nameOf(m.userData.pieceId),
      slotKey: m.userData.slotKey,
      found: false,
    }));
    this.godCam.enabled = false;
    this._setPhase(Phase.COVER);
    document.getElementById('screen-cover').classList.remove('hidden');
    document.getElementById('cover-count').textContent =
      `本回合共藏了 ${this.targets.length} 件物品，找家需要全部找出（限时 ${this.settings.seekTime ? this.settings.seekTime / 60 + ' 分钟' : '不限'}）`;
  }

  // ---- 找家开始搜索 ----
  beginSeek() {
    if (this.phase !== Phase.COVER) return;
    document.getElementById('screen-cover').classList.add('hidden');
    this._setPhase(Phase.SEEK);
    this.timer = this.settings.seekTime;
    this.hintCooldown = 0;
    this._lastTick = null;
    this.player.frozen = false;
    this.player.setLock(true);
    this.player.teleport(this.villa.spawn.seeker.pos, this.villa.spawn.seeker.yaw);
    this.interact.enabled = true;
    this._crosshair(true);
    this._banner(`第 ${this.round}/${this.settings.rounds} 回合 · 限时搜索`);
    this._foundHud();
    this._helpBar(`【找家】<b>WASD</b> 移动 <span class="hb-sep">|</span> <b>Shift</b> 跑 <span class="hb-sep">|</span> ` +
      `<b>E</b> 开门/检查/拿取 <span class="hb-sep">|</span> <b>Esc</b> 退出本局 <span class="hb-sep">|</span> ` +
      `规则：找出藏家藏的全部 <b>${this.targets.length}</b> 件物品`);
    this.toast(`你是找家！共有 ${this.targets.length} 件物品等着你找`);
  }

  // 底部操作提示条（null = 隐藏）
  _helpBar(html) {
    const el = document.getElementById('help-bar');
    if (!el) return;
    if (html) { el.innerHTML = html; el.classList.remove('hidden'); }
    else el.classList.add('hidden');
  }

  // ---- 找到一件 ----
  onItemFound(userData, mesh) {
    if (this.phase !== Phase.SEEK) return;
    // 用射线实际命中的网格移除：同名物品重复藏匿时不会误删另一件
    if (mesh) this.interact.removeItem(mesh);
    const t = this.targets.find(t => t.itemId === userData.itemId && !t.found);
    if (t) t.found = true;
    const left = this.targets.filter(t => !t.found).length;
    this._foundHud();
    if (left <= 0) {
      this._endRound(true);
    } else {
      this.toast(`漂亮！还剩 ${left} 件没找到`);
    }
  }

  // ---- 回合结束 ----
  _endRound(found) {
    this.interact.resetRound();   // 退出检查特写并合上柜门，避免状态泄漏到下一回合
    this.interact.enabled = false;
    this.player.setLock(false);
    this.player.frozen = true;
    document.getElementById('timer').classList.add('hidden');
    document.getElementById('hint-chip').classList.add('hidden');
    document.getElementById('found-counter').classList.add('hidden');
    this._helpBar(null);
    this._crosshair(false);
    if (found) { this.score.seeker++; SFX.found(); }
    else { this.score.hider++; SFX.lost(); }
    this._setPhase(Phase.RESULT);
    const title = document.getElementById('result-title');
    const detail = document.getElementById('result-detail');
    const score = document.getElementById('result-score');
    const foundN = this.targets.filter(t => t.found).length;
    if (found) {
      const used = this.settings.seekTime ? `用时 ${Math.round(this.settings.seekTime - this.timer)} 秒` : '不限时通关';
      title.textContent = '🎉 全部找到了！';
      detail.innerHTML = `${used}<br>` + this.targets.map(t =>
        `「${itemById(t.itemId).name}」在 ${t.pieceName} 的${this._slotName(t)}`).join('<br>');
    } else {
      title.textContent = '⏰ 时间到！';
      detail.innerHTML = `只找到 ${foundN}/${this.targets.length} 件，藏家守住了秘密<br>` +
        this.targets.map(t => t.found
          ? `✅ 「${itemById(t.itemId).name}」已被找到`
          : `❌ 「${itemById(t.itemId).name}」藏在 ${t.pieceName} 的${this._slotName(t)}`).join('<br>');
    }
    score.textContent = `比分 —— 找家 ${this.score.seeker} : ${this.score.hider} 藏家`;
    document.getElementById('screen-result').classList.remove('hidden');
  }

  _slotName(t) {
    const p = this.pieces.find(q => q.def.id === t.pieceId);
    const s = p?.slots.find(s => s.key === t.slotKey);
    return s ? s.name : t.slotKey;
  }

  // ---- 下一回合 / 终局 ----
  nextRound() {
    document.getElementById('screen-result').classList.add('hidden');
    if (this.round >= this.settings.rounds) {
      const s = this.score;
      const draw = s.seeker === s.hider;
      const winner = draw ? '平局！' : (s.seeker > s.hider ? '找家' : '藏家');
      document.getElementById('result-title').textContent = draw ? '🤝 平局！' : `🏆 ${winner}获胜！`;
      document.getElementById('result-detail').innerHTML = `最终比分 —— 找家 ${s.seeker} : ${s.hider} 藏家<br>点击下方按钮重新开始`;
      document.getElementById('result-score').textContent = '';
      const btn = document.getElementById('btn-next-round');
      btn.textContent = '再来一局';
      btn.onclick = () => location.reload();
      document.getElementById('screen-result').classList.remove('hidden');
      this._setPhase(Phase.MENU);
      return;
    }
    const btn = document.getElementById('btn-next-round');
    btn.textContent = '下一回合';
    btn.onclick = () => this.nextRound();
    this.startRound();
  }

  // ---- 退出本局回主菜单 ----
  quitToMenu() {
    this.interact.resetRound();
    this.interact.clearAllItems();
    this.interact.enabled = false;
    this.interact.hideMode = false;
    this.placement.hide();
    this.player.setLock(false);
    this.player.frozen = true;
    this.godCam.enabled = true;
    this.godCam.autoRotate = true;
    this._setPhase(Phase.MENU);
    this.round = 0;
    this.score = { hider: 0, seeker: 0 };
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('screen-cover').classList.add('hidden');
    document.getElementById('screen-result').classList.add('hidden');
    document.getElementById('timer').classList.add('hidden');
    document.getElementById('hint-chip').classList.add('hidden');
    document.getElementById('found-counter').classList.add('hidden');
    this._helpBar(null);
    this._crosshair(false);
    document.getElementById('screen-menu').classList.remove('hidden');
  }

  // ---- 计时 + 冷热提示 ----
  tick(dt) {
    if (this.phase !== Phase.SEEK) return;
    const tEl = document.getElementById('timer');
    tEl.classList.remove('hidden');
    if (!this.settings.seekTime) {
      tEl.textContent = '∞ 不限时';
    } else {
      this.timer -= dt;
      const m = Math.max(0, Math.floor(this.timer / 60));
      const s = Math.max(0, Math.floor(this.timer % 60));
      tEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      tEl.classList.toggle('urgent', this.timer < 20);
      const secLeft = Math.ceil(this.timer);
      if (this.timer <= 10 && secLeft !== this._lastTick) { this._lastTick = secLeft; SFX.tick(); }
      // 超时结算（放在提示逻辑之前：关闭"距离提示"也能正常结束回合）
      if (this.timer <= 0) { this._endRound(false); return; }
    }

    // 冷热提示：指向最近的未找到物品
    this.hintCooldown -= dt;
    const chip = document.getElementById('hint-chip');
    if (!this.settings.hints) { chip.classList.add('hidden'); return; }
    if (this.hintCooldown <= 0) {
      this.hintCooldown = 2.5;
      const remaining = this.interact.placedItems;
      if (remaining.length) {
        let best = null, bestD = Infinity;
        for (const m of remaining) {
          const d = m.position.distanceTo(this.player.pos);
          if (d < bestD) { bestD = d; best = m; }
        }
        const [cls, text] =
          bestD < 1.6 ? ['blazing', '🔥 烫烫烫！就在附近'] :
          bestD < 3.5 ? ['hot', '🥵 很热，越来越近了'] :
          bestD < 6   ? ['warm', '😊 有一点温热'] :
          bestD < 9   ? ['cool', '🙂 有点凉，换个区域？'] :
                        ['cold', '🥶 很冷，完全不对'];
        chip.classList.remove('cold', 'cool', 'warm', 'hot', 'blazing');
        chip.classList.add(cls);
        chip.textContent = text;
        chip.classList.remove('hidden');
      }
    }
  }

  _foundHud() {
    const el = document.getElementById('found-counter');
    const n = this.targets.filter(t => t.found).length;
    el.textContent = `📦 已找到 ${n}/${this.targets.length} 件`;
    el.classList.remove('hidden');
  }

  _banner(text) {
    const el = document.getElementById('role-banner');
    el.textContent = text;
    el.classList.remove('hidden');
  }

  _crosshair(show) {
    document.getElementById('crosshair').classList.toggle('hidden', !show);
  }

  _setPhase(p) { this.phase = p; }
}
