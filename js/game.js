// game.js — 回合状态机：MENU → HIDE(藏家FP) → COVER(传递) → SEEK(找家) → RESULT
// 联机模式（2026-09-18 方案①）：mode = 'host'（藏完上传房间）/ 'guest'（输入房号搜索）
//   藏点真相在服务端：guest 永远拿不到藏点，只能逐槽位 check；计时 deadline 由服务端下发。
import * as THREE from 'three';
import { itemById } from './items.js';
import { SFX } from './audio.js';
import { netCreate, netStartSeek, netStatus } from './net.js';

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
    this.mode = 'local';        // 'local' | 'host' | 'guest'
    this.settings = { rounds: 3, seekTime: 120, hints: true, hideCount: 2 };
    this.round = 0;
    this.score = { hider: 0, seeker: 0 };
    this.timer = 0;
    this.hintCooldown = 0;
    this.targets = [];          // 本回合所有藏匿物 [{itemId, pieceName, slotName, found}]
    this.onToast = null;
    this.online = { code: null, total: 0, deadline: null, nowOffset: 0, pollId: null, foundCount: 0 };
    this.onlineAction = null;   // screen-online 主按钮行为（由各流程设置）

    placement.onDone = () => this.confirmHide();
    placement.maxItems = this.settings.hideCount;
    interact.onPickup = (userData, mesh) => this.onItemFound(userData, mesh);
  }

  toast(msg) { if (this.onToast) this.onToast(msg); }

  _fmtDur(sec) { return sec > 0 ? `${Math.round(sec / 60)} 分钟` : '不限时'; }

  // ---- 联机·藏家：进入布置（与 startRound 同流程，藏完走 _hostSealed） ----
  startOnlineHost() {
    this.mode = 'host';
    this.settings.rounds = 1;
    this.round = 0;
    document.getElementById('screen-menu').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.godCam.enabled = false;
    this.godCam.autoRotate = false;
    this.startRound();
    this._banner('联机 · 你是藏家：藏好后按 G 生成房间号');
    this._helpBar('【联机藏家】<b>WASD</b> 移动 <span class="hb-sep">|</span> <b>E</b> 选位置藏物品 '
      + '<span class="hb-sep">|</span> <b>G</b> 完成并生成房间号 <span class="hb-sep">|</span> <b>Esc</b> 取消');
  }

  // ---- 联机·藏家：藏完 → 上传房间 → 等待屏轮询 ----
  async _hostSealed(hides) {
    this.godCam.enabled = false;
    this._setPhase(Phase.COVER);
    let code;
    try {
      ({ code } = await netCreate(hides, this.settings.seekTime));
    } catch (e) {
      this.toast(`创建房间失败：${e.message}`);
      this.quitToMenu();
      return;
    }
    this.online.code = code;
    this.online.total = hides.length;
    const link = `${location.origin}${location.pathname}?room=${code}`;
    document.getElementById('online-title').textContent = '🔒 藏匿已上锁';
    document.getElementById('online-info').textContent =
      `共 ${hides.length} 件物品 · 搜索限时 ${this._fmtDur(this.settings.seekTime)}。把链接发给朋友，对方打开就能直接搜：`;
    const codeLine = document.getElementById('online-code-line');
    codeLine.textContent = code;
    codeLine.onclick = async () => {
      try { await navigator.clipboard.writeText(link); this.toast('链接已复制，发给朋友即可'); }
      catch { this.toast(`链接：${link}`); }
    };
    // 分享链接明示 + 一键复制（朋友打开链接 = 自动进入找家加入流程）
    const linkBox = document.getElementById('online-link-box');
    const linkInput = document.getElementById('online-link');
    linkInput.value = link;
    linkBox.classList.remove('hidden');
    const copyBtn = document.getElementById('btn-online-copy');
    copyBtn.onclick = async () => {
      try { await navigator.clipboard.writeText(link); copyBtn.textContent = '已复制 ✓'; }
      catch { linkInput.select(); document.execCommand && document.execCommand('copy'); copyBtn.textContent = '已复制 ✓'; }
      setTimeout(() => { copyBtn.textContent = '复制链接'; }, 2000);
    };
    document.getElementById('online-live').textContent = '等待玩家加入…';
    const btn = document.getElementById('btn-online-action');
    btn.classList.add('hidden');
    document.getElementById('screen-online').classList.remove('hidden');
    const poll = async () => {
      try {
        const s = await netStatus(code);
        if (s.state === 'seeking') {
          document.getElementById('online-live').textContent = `对方正在搜索 · 已找到 ${s.foundCount}/${s.total} 件`;
        } else if (s.state === 'done') {
          clearInterval(this.online.pollId);
          this.online.pollId = null;
          this._hostResult(s);
        }
      } catch { document.getElementById('online-live').textContent = '网络波动，继续等待…'; }
    };
    poll();
    this.online.pollId = setInterval(poll, 4000);
  }

  _hostResult(s) {
    this._setPhase(Phase.RESULT);
    const foundSet = new Set(s.foundKeys);
    const nameOf = (pid) => { const p = this.pieces.find(q => q.def.id === pid); return p ? p.def.name : pid; };
    const title = document.getElementById('result-title');
    const detail = document.getElementById('result-detail');
    if (s.reason === 'all_found') {
      title.textContent = '😢 对方把你的藏物全找到了！';
      detail.innerHTML = s.hides.map(h => foundSet.has(`${h.pieceId}:${h.slotKey}`)
        ? `✅ 「${itemById(h.itemId).name}」在 ${nameOf(h.pieceId)} —— 被找到了`
        : `❌`).join('<br>');
    } else {
      title.textContent = '🎉 时间到！你的藏物守住了';
      detail.innerHTML = `对方只找到 ${s.foundCount}/${s.total} 件<br>` + s.hides.map(h =>
        foundSet.has(`${h.pieceId}:${h.slotKey}`)
          ? `✅ 「${itemById(h.itemId).name}」（${nameOf(h.pieceId)}）被找到了`
          : `❌ 「${itemById(h.itemId).name}」藏在 ${nameOf(h.pieceId)} —— 没被找到`).join('<br>');
    }
    document.getElementById('result-score').textContent = `联机单局 —— 对方找到 ${s.foundCount}/${s.total} 件`;
    document.getElementById('screen-online').classList.add('hidden');
    const btn = document.getElementById('btn-next-round');
    btn.textContent = '返回菜单';
    btn.onclick = () => this.quitToMenu();
    document.getElementById('screen-result').classList.remove('hidden');
  }

  // ---- 联机·找家：加入房间 → 确认屏 ----
  guestJoin(code, st) {
    this.mode = 'guest';
    this.online.code = code;
    document.getElementById('screen-menu').classList.add('hidden');
    document.getElementById('screen-online').classList.remove('hidden');
    document.getElementById('online-title').textContent = `房间 ${code}`;
    document.getElementById('online-info').textContent =
      `房主已藏好 ${st.total} 件物品 · 搜索限时 ${this._fmtDur(st.seekTime)}` +
      (st.state === 'seeking' ? '（搜索已开始，剩余时间以服务端为准）' : '');
    document.getElementById('online-code-line').textContent = '';
    document.getElementById('online-live').textContent = '';
    const btn = document.getElementById('btn-online-action');
    btn.textContent = '我是找家，开始搜索！';
    btn.classList.remove('hidden');
    this.onlineAction = () => this.guestStart(code);
  }

  // ---- 联机·找家：开始（或断线恢复）搜索 ----
  async guestStart(code) {
    let st = await netStatus(code);
    if (st.state === 'hidden') {
      st = { ...st, ...(await netStartSeek(code)) };
    }
    if (st.state !== 'seeking') { this.toast('该房间已经结束了'); this.quitToMenu(); return; }
    this.online.deadline = st.deadline;
    this.online.total = st.total;
    this.online.foundCount = 0;
    this.online.nowOffset = st.now ? Date.now() - st.now : 0;   // 服务器时钟校准
    this.targets = [];
    this._setPhase(Phase.SEEK);
    this.timer = 0;
    this.hintCooldown = 0;
    document.getElementById('screen-online').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.godCam.enabled = false;
    this.godCam.autoRotate = false;
    this.player.frozen = false;
    this.player.setLock(true);
    this.player.teleport(this.villa.spawn.seeker.pos, this.villa.spawn.seeker.yaw);
    this.interact.enabled = true;
    this._crosshair(true);
    this._foundHud();
    this._banner(`联机 · 限时搜索（服务端计时${st.deadline ? '' : ' · 不限时'}）`);
    this._helpBar('【联机找家】<b>WASD</b> 移动 <span class="hb-sep">|</span> <b>E</b> 开门·抽屉·拿取 '
      + '<span class="hb-sep">|</span> <b>R</b> 搜查当前家具 <span class="hb-sep">|</span> <b>Q</b> 关上抽屉 '
      + '<span class="hb-sep">|</span> <b>Esc</b> 退出 —— 共 <b>' + st.total + '</b> 件藏在全屋 40+ 藏点里');
    this.toast(`你是找家！${st.total} 件物品藏在别墅里，按 R 搜查家具，开门翻抽屉也会自动搜查`);
    document.getElementById('btn-exit').classList.remove('hidden');
  }

  // ---- 联机·找家：结算（全部找到 / 超时） ----
  async _guestFinish(reason) {
    if (this.phase !== Phase.SEEK) return;
    this.interact.resetRound();
    this.interact.enabled = false;
    this.player.setLock(false);
    this.player.frozen = true;
    document.getElementById('timer').classList.add('hidden');
    document.getElementById('found-counter').classList.add('hidden');
    document.getElementById('hint-chip').classList.add('hidden');
    this._helpBar(null);
    this._crosshair(false);
    this._setPhase(Phase.RESULT);
    let s;
    try { s = await netStatus(this.online.code); }
    catch (e) { this.toast(e.message); this.quitToMenu(); return; }
    const foundSet = new Set(s.foundKeys || []);
    const nameOf = (pid) => { const p = this.pieces.find(q => q.def.id === pid); return p ? p.def.name : pid; };
    const title = document.getElementById('result-title');
    const detail = document.getElementById('result-detail');
    const allFound = (s.foundCount || 0) >= s.total;
    if (allFound) {
      title.textContent = '🎉 全部找到了！';
      detail.innerHTML = s.hides.map(h => `✅ 「${itemById(h.itemId).name}」藏在 ${nameOf(h.pieceId)} 的${this._slotName(h)}`).join('<br>');
    } else {
      title.textContent = '⏰ 时间到！';
      detail.innerHTML = `只找到 ${s.foundCount}/${s.total} 件<br>` + s.hides.map(h =>
        foundSet.has(`${h.pieceId}:${h.slotKey}`)
          ? `✅ 「${itemById(h.itemId).name}」被你找到了`
          : `❌ 「${itemById(h.itemId).name}」藏在 ${nameOf(h.pieceId)} 的${this._slotName(h)}`).join('<br>');
    }
    document.getElementById('result-score').textContent = `联机单局 —— 找到 ${s.foundCount}/${s.total} 件`;
    document.getElementById('screen-online').classList.add('hidden');
    const btn = document.getElementById('btn-next-round');
    btn.textContent = '返回菜单';
    btn.onclick = () => this.quitToMenu();
    document.getElementById('screen-result').classList.remove('hidden');
    if (allFound) SFX.found(); else SFX.lost();
  }

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
    if (this.mode === 'host') {
      this._hostSealed(this.targets.map(t => ({ pieceId: t.pieceId, slotKey: t.slotKey, itemId: t.itemId })));
      return;
    }
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
      `<b>E</b> 开门·抽屉·书本·拿取 <b>Q</b> 关上抽屉 <span class="hb-sep">|</span> <b>Esc</b> 退出本局 <span class="hb-sep">|</span> ` +
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
    if (this.mode === 'guest') {
      // 联机找家：本地计数 + 全部找到时向服务端确认结算
      this.online.foundCount++;
      this._foundHud();
      if (this.online.foundCount >= this.online.total) this._guestFinish('all_found');
      else this.toast(`漂亮！还剩 ${this.online.total - this.online.foundCount} 件没找到`);
      return;
    }
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
    this.mode = 'local';
    if (this.online.pollId) { clearInterval(this.online.pollId); this.online.pollId = null; }
    this.online = { code: null, total: 0, deadline: null, nowOffset: 0, pollId: null, foundCount: 0 };
    this.onlineAction = null;
    this.round = 0;
    this.score = { hider: 0, seeker: 0 };
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('screen-cover').classList.add('hidden');
    document.getElementById('screen-result').classList.add('hidden');
    document.getElementById('screen-online').classList.add('hidden');
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
    if (this.mode === 'guest') {
      // 联机找家：倒计时以服务端 deadline 为准（本地时钟已校准偏移）；联机不做冷热提示
      if (!this.online.deadline) { tEl.textContent = '∞ 不限时'; return; }
      const remain = (this.online.deadline - (Date.now() - this.online.nowOffset)) / 1000;
      const m = Math.max(0, Math.floor(remain / 60));
      const s = Math.max(0, Math.floor(remain % 60));
      tEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      tEl.classList.toggle('urgent', remain < 20);
      const secLeft = Math.ceil(remain);
      if (remain <= 10 && secLeft !== this._lastTick) { this._lastTick = secLeft; SFX.tick(); }
      if (remain <= 0) this._guestFinish('timeout');
      return;
    }
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
    const total = this.mode === 'guest' ? this.online.total : this.targets.length;
    const n = this.mode === 'guest' ? this.online.foundCount
      : this.targets.filter(t => t.found).length;
    el.textContent = `📦 已找到 ${n}/${total} 件`;
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
