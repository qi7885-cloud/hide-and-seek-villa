// audio.js — 零素材音效：WebAudio 实时合成
let actx = null;
function ensure() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}

function tone(freq, dur, type = 'sine', vol = 0.12, when = 0, slideTo = 0) {
  try {
    const a = ensure();
    const t = a.currentTime + when;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch (e) { /* 音频不可用时静默 */ }
}

export const SFX = {
  open()  { tone(320, 0.08, 'triangle', 0.1); tone(170, 0.1, 'sine', 0.08, 0.03); },
  close() { tone(190, 0.07, 'triangle', 0.09); },
  place() { tone(500, 0.09, 'sine', 0.1); tone(640, 0.08, 'sine', 0.08, 0.06); },
  pickup(){ tone(660, 0.1, 'sine', 0.12); tone(880, 0.14, 'sine', 0.12, 0.08); },
  found() { tone(523, 0.12, 'sine', 0.14); tone(659, 0.12, 'sine', 0.14, 0.11); tone(784, 0.24, 'sine', 0.14, 0.22); tone(1046, 0.3, 'sine', 0.1, 0.34); },
  lost()  { tone(311, 0.22, 'sine', 0.11); tone(233, 0.3, 'sine', 0.11, 0.18); tone(175, 0.4, 'sine', 0.1, 0.38); },
  tick()  { tone(1050, 0.03, 'square', 0.04); },
  unlock(){ tone(440, 0.05, 'sine', 0.06); },
};
