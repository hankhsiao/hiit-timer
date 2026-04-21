import React, { useState, useEffect, useRef } from 'react';
import {
  Play, Pause, RotateCcw, Activity, Timer, RefreshCw,
  History, Volume2, VolumeX, Zap, List, Trophy, Clock,
  X, Plus, Minus, Sun, Moon
} from 'lucide-react';

// ─── Theme ────────────────────────────────────────────────────────────────────
const DARK = {
  bg: '#0D0D12', card: 'rgba(255,255,255,0.055)', cardBorder: 'rgba(255,255,255,0.07)',
  text: '#FFFFFF', subtext: 'rgba(255,255,255,0.38)',
  inputBg: 'rgba(255,255,255,0.07)', inputBorder: 'rgba(255,255,255,0.1)', inputText: '#fff',
  modalBg: '#1C1C26', divider: 'rgba(255,255,255,0.06)',
  iconBtn: 'rgba(255,255,255,0.09)', ringTrack: 'rgba(255,255,255,0.06)', glow: true,
};
const LIGHT = {
  bg: '#F0F0F5', card: '#FFFFFF', cardBorder: 'rgba(0,0,0,0.06)',
  text: '#111111', subtext: 'rgba(0,0,0,0.35)',
  inputBg: 'rgba(0,0,0,0.04)', inputBorder: 'rgba(0,0,0,0.1)', inputText: '#111',
  modalBg: '#FFFFFF', divider: 'rgba(0,0,0,0.07)',
  iconBtn: 'rgba(0,0,0,0.07)', ringTrack: 'rgba(0,0,0,0.07)', glow: false,
};

const PHASES = {
  IDLE:        { label: '準備就緒', color: '#FF4C5E' },
  PREPARING:   { label: '預備...',  color: '#4C6EF5' },
  WORK:        { label: '運動中',   color: '#FF4C5E' },
  REST:        { label: '休息',     color: '#20C997' },
  ROUND_RESET: { label: '組間休息', color: '#F59F00' },
  FINISHED:    { label: '完成！',   color: '#7C3AED' },
};

const DEFAULT_SETTINGS = {
  workTime: 30, restTime: 30, rounds: 3, roundReset: 60,
  exerciseNames: ['開合跳', '波比跳', '登山者', '深蹲跳'],
};

function load(key, fb) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch { return fb; }
}
function fmt(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ─── Audio Engine ─────────────────────────────────────────────────────────────
// Uses Web Audio API for beeps (works when screen is locked on iOS PWA)
// Uses SpeechSynthesis for voice cues (requires screen on in browser; works in PWA)
// A silent looping <audio> keeps the AudioContext session alive on iOS

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.silentAudio = null;
    this.muted = false;
  }

  // Must be called on first user gesture
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Silent looping audio – keeps audio session alive on iOS when screen locks
      // A 1-sample silent WAV encoded as base64
      const silentWav = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      this.silentAudio = new Audio(silentWav);
      this.silentAudio.loop = true;
      this.silentAudio.volume = 0.001; // near-silent but not 0
    } catch (e) { console.warn('AudioContext unavailable', e); }
  }

  startSilentLoop() {
    if (this.silentAudio) this.silentAudio.play().catch(() => {});
  }

  stopSilentLoop() {
    if (this.silentAudio) { this.silentAudio.pause(); this.silentAudio.currentTime = 0; }
  }

  // Resume context if suspended (iOS requires this after interruption)
  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (e) {}
    }
  }

  beep(freq = 880, duration = 0.12, volume = 0.35, delay = 0) {
    if (this.muted || !this.ctx) return;
    this.resume();
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t); osc.stop(t + duration + 0.02);
  }

  // High beep = countdown tick; low beep = phase end
  tickBeep(n) {
    if (n === 0) {
      // Double beep for phase end
      this.beep(660, 0.15, 0.4, 0);
      this.beep(880, 0.2,  0.5, 0.18);
    } else {
      this.beep(880, 0.1, 0.25, 0);
    }
  }

  speak(text) {
    if (this.muted) return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW'; u.rate = 1.1; u.volume = 1;
    synth.speak(u);
  }

  // iOS SpeechSynthesis sometimes pauses itself – kick it periodically
  kickSynth() {
    const synth = window.speechSynthesis;
    if (synth && synth.speaking) synth.pause(), synth.resume();
  }
}

const audioEngine = new AudioEngine();

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const prefersDark = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches : true;
  const [darkMode, setDarkMode] = useState(prefersDark);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = e => setDarkMode(e.matches);
    mq.addEventListener('change', h); return () => mq.removeEventListener('change', h);
  }, []);
  const T = darkMode ? DARK : LIGHT;

  const [settings,     setSettings]     = useState(() => load('hiit_settings', DEFAULT_SETTINGS));
  const [history,      setHistory]      = useState(() => load('hiit_history',  []));
  const [phase,        setPhase]        = useState('IDLE');
  const [isActive,     setIsActive]     = useState(false);
  const [timeLeft,     setTimeLeft]     = useState(0);
  const [phaseDur,     setPhaseDur]     = useState(1);
  const [currentEx,    setCurrentEx]    = useState(0);
  const [currentRound, setCurrentRound] = useState(1);
  const [isMuted,      setIsMuted]      = useState(false);
  const [modal,        setModal]        = useState(null);
  const [editNames,    setEditNames]    = useState([]);
  const [pulse,        setPulse]        = useState(false);

  const timerRef    = useRef(null);
  const kickRef     = useRef(null);  // synth kick interval
  const wakeLockRef = useRef(null);
  const stateRef    = useRef({});
  stateRef.current = { phase, timeLeft, currentEx, currentRound, settings, isActive, phaseDur };

  // Sync mute state to engine
  useEffect(() => { audioEngine.muted = isMuted; }, [isMuted]);
  useEffect(() => { localStorage.setItem('hiit_settings', JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem('hiit_history',  JSON.stringify(history));  }, [history]);

  // Kick SpeechSynthesis every 10s to prevent iOS pausing it
  useEffect(() => {
    if (isActive) {
      kickRef.current = setInterval(() => audioEngine.kickSynth(), 10000);
    } else {
      clearInterval(kickRef.current);
    }
    return () => clearInterval(kickRef.current);
  }, [isActive]);

  // Screen Wake Lock – keeps display on while timer is running so audio never stops
  useEffect(() => {
    const acquire = async () => {
      if (!('wakeLock' in navigator)) return;
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch (e) { console.warn('WakeLock request failed', e); }
    };
    const release = async () => {
      if (wakeLockRef.current) {
        try { await wakeLockRef.current.release(); } catch (e) {}
        wakeLockRef.current = null;
      }
    };
    // Re-acquire after browser releases it (e.g. user briefly switches tab)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    if (isActive) {
      acquire();
      document.addEventListener('visibilitychange', onVisibilityChange);
    } else {
      release();
    }
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [isActive]);

  const calcTotal = (s = settings) => {
    const ex = s.exerciseNames.length;
    return (s.workTime + s.restTime) * ex * s.rounds
      - s.restTime * s.rounds + s.roundReset * (s.rounds - 1);
  };

  const startPhase = (p, dur) => { setPhase(p); setTimeLeft(dur); setPhaseDur(dur); };

  const transition = () => {
    const { phase, currentEx, currentRound, settings } = stateRef.current;
    const { workTime, restTime, roundReset, rounds, exerciseNames } = settings;
    const lastEx    = currentEx === exerciseNames.length - 1;
    const lastRound = currentRound === rounds;
    setPulse(true); setTimeout(() => setPulse(false), 300);

    if (phase === 'PREPARING') {
      startPhase('WORK', workTime);
      audioEngine.speak(`${exerciseNames[0]} 開始`);
    } else if (phase === 'WORK') {
      if (!lastEx) {
        // Announce NEXT exercise before rest starts (preview feeling)
        audioEngine.speak(`休息，準備好${exerciseNames[currentEx + 1]}`);
        startPhase('REST', restTime);
      } else if (!lastRound) {
        audioEngine.speak('一組完成，大組休息');
        startPhase('ROUND_RESET', roundReset);
      } else {
        setPhase('FINISHED'); setIsActive(false);
        audioEngine.speak('訓練完成，太棒了');
        audioEngine.stopSilentLoop();
        const rec = { id: Date.now(), date: new Date().toLocaleDateString('zh-TW'), duration: Math.ceil(calcTotal() / 60) };
        setHistory(h => [rec, ...h].slice(0, 20));
      }
    } else if (phase === 'REST') {
      const next = currentEx + 1;
      setCurrentEx(next); startPhase('WORK', workTime);
      audioEngine.speak(`${exerciseNames[next]} 開始`);
    } else if (phase === 'ROUND_RESET') {
      setCurrentEx(0); setCurrentRound(r => r + 1); startPhase('WORK', workTime);
      audioEngine.speak(`第 ${currentRound + 1} 組，${settings.exerciseNames[0]} 開始`);
    }
  };

  useEffect(() => {
    if (!isActive) { clearInterval(timerRef.current); return; }

    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        const { phase, phaseDur, currentEx, settings } = stateRef.current;
        const { workTime, exerciseNames } = settings;
        const next = t - 1;

        // Countdown beeps at 3,2,1,0
        if (next <= 3) audioEngine.tickBeep(next);

        // Mid-point voice cue for WORK phases > 30s
        if (phase === 'WORK' && workTime > 30) {
          const half = Math.floor(workTime / 2);
          if (next === half) audioEngine.speak('一半了，繼續');
        }

        // Preview next exercise 3 seconds before REST ends
        if (phase === 'REST' && next === 3) {
          const nextIdx = currentEx + 1;
          if (nextIdx < exerciseNames.length) {
            audioEngine.speak(`準備好，${exerciseNames[nextIdx]}`);
          }
        }

        // Preview next exercise 3 seconds before ROUND_RESET ends
        if (phase === 'ROUND_RESET' && next === 3) {
          audioEngine.speak(`準備好，${exerciseNames[0]}`);
        }

        if (next <= 0) { clearInterval(timerRef.current); transition(); return 0; }
        return next;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [isActive, phase]);

  const toggle = () => {
    // Init audio engine on first user gesture
    audioEngine.init();

    if (phase === 'IDLE' || phase === 'FINISHED') {
      // Read out all exercises before starting
      const exList = settings.exerciseNames.join('，');
      const roundStr = settings.rounds > 1 ? `共 ${settings.rounds} 組，` : '';
      audioEngine.speak(`今天的訓練：${roundStr}${exList}。五秒後開始`);
      audioEngine.startSilentLoop();
      startPhase('PREPARING', 5);
      setCurrentEx(0); setCurrentRound(1); setIsActive(true);
    } else {
      if (isActive) {
        audioEngine.stopSilentLoop();
      } else {
        audioEngine.startSilentLoop();
        audioEngine.resume();
      }
      setIsActive(a => !a);
    }
  };

  const reset = () => {
    clearInterval(timerRef.current);
    audioEngine.stopSilentLoop();
    window.speechSynthesis?.cancel();
    setIsActive(false); setPhase('IDLE'); setTimeLeft(0); setPhaseDur(1);
    setCurrentEx(0); setCurrentRound(1);
  };

  const phaseInfo     = PHASES[phase] || PHASES.IDLE;
  const circumference = 2 * Math.PI * 110;
  const ringFraction  = (phase === 'IDLE' || phase === 'FINISHED' || phaseDur === 0)
    ? 0 : (phaseDur - timeLeft) / phaseDur;
  const ringOffset = circumference * (1 - ringFraction);

  const ib = (extra = {}) => ({
    background: T.iconBtn, border: 'none', color: T.text, borderRadius: 14,
    padding: 10, cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', transition: 'background 0.3s', ...extra,
  });
  const cardS = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: T.card, border: `1px solid ${T.cardBorder}`,
    borderRadius: 18, padding: '14px 18px', transition: 'background 0.3s',
  };
  const stepS = {
    width: 32, height: 32, borderRadius: '50%', background: T.iconBtn,
    border: 'none', color: T.text, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: T.bg, minHeight: '100vh',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      color: T.text, userSelect: 'none', transition: 'background 0.35s, color 0.35s' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,700;9..40,900&family=DM+Mono:wght@500&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ width: '100%', maxWidth: 420, padding: '52px 20px 0',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => { audioEngine.init(); setEditNames([...settings.exerciseNames]); setModal('exercises'); }}
          style={{ ...ib(), padding: '10px 16px', gap: 6, fontSize: 13, fontWeight: 700, flexDirection: 'row' }}>
          <List size={16} /><span>動作清單</span>
        </button>
        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.18em', color: T.subtext }}>HIIT TIMER</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setDarkMode(d => !d)} style={ib()}>
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={() => { audioEngine.muted = !isMuted; setIsMuted(m => !m); }}
            style={ib({ color: isMuted ? T.subtext : T.text })}>
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button onClick={() => setModal('history')} style={ib()}><History size={18} /></button>
        </div>
      </div>

      {/* Ring */}
      <div style={{ position: 'relative', margin: '32px 0 20px', width: 264, height: 264 }}>
        <svg width="264" height="264" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
          <circle cx="132" cy="132" r="110" fill="none" stroke={T.ringTrack} strokeWidth="8" />
          <circle cx="132" cy="132" r="110" fill="none"
            stroke={phaseInfo.color} strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={ringOffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.95s linear, stroke 0.5s ease' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.2em', color: phaseInfo.color,
            marginBottom: 8, textTransform: 'uppercase', transition: 'color 0.5s' }}>
            {phaseInfo.label}
          </div>
          <div style={{ fontSize: 68, fontWeight: 900, fontFamily: "'DM Mono', monospace",
            lineHeight: 1, color: T.text,
            transform: pulse ? 'scale(1.05)' : 'scale(1)', transition: 'transform 0.15s' }}>
            {phase === 'IDLE' ? fmt(calcTotal()) : fmt(timeLeft)}
          </div>
          {phase !== 'IDLE' && phase !== 'FINISHED' && (
            <div style={{ fontSize: 11, color: T.subtext, fontWeight: 700, marginTop: 10 }}>
              第 {currentRound} 組 / 共 {settings.rounds} 組
            </div>
          )}
          {phase === 'IDLE' && (
            <div style={{ fontSize: 11, color: T.subtext, fontWeight: 600, marginTop: 8 }}>預計總時長</div>
          )}
        </div>
      </div>

      {/* Exercise dots */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, height: 28, alignItems: 'center' }}>
        {phase === 'WORK' && settings.exerciseNames.map((name, i) => (
          <div key={i} style={{
            height: i === currentEx ? 28 : 8, width: i === currentEx ? 'auto' : 8,
            padding: i === currentEx ? '0 12px' : 0, borderRadius: 20,
            background: i === currentEx ? phaseInfo.color
              : i < currentEx ? (darkMode ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.18)')
              : (darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', color: '#fff',
            transition: 'all 0.32s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            {i === currentEx ? name : ''}
          </div>
        ))}
      </div>

      {/* Play/Reset */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 36 }}>
        {phase !== 'IDLE'
          ? <button onClick={reset} style={{ width: 52, height: 52, borderRadius: '50%',
              background: T.iconBtn, border: 'none', color: T.text, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RotateCcw size={20} />
            </button>
          : <div style={{ width: 52 }} />}
        <button onClick={toggle} style={{
          width: 80, height: 80, borderRadius: '50%', background: phaseInfo.color, border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: T.glow ? `0 0 36px ${phaseInfo.color}55` : '0 4px 16px rgba(0,0,0,0.15)',
          transition: 'background 0.5s, box-shadow 0.5s',
        }}>
          {isActive
            ? <Pause size={30} color="#fff" fill="#fff" />
            : <Play  size={30} color="#fff" fill="#fff" style={{ transform: 'translateX(2px)' }} />}
        </button>
        <div style={{ width: 52 }} />
      </div>

      {/* Settings */}
      <div style={{ width: '100%', maxWidth: 420, padding: '0 20px 48px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { label: 'Work',        key: 'workTime',      icon: <Activity  size={18} />, color: '#FF4C5E', isTime: true  },
          { label: 'Rest',        key: 'restTime',      icon: <Timer     size={18} />, color: '#20C997', isTime: true  },
          { label: 'Exercises',   key: 'exerciseNames', icon: <Zap       size={18} />, color: '#748FFC', readOnly: true, display: settings.exerciseNames.length },
          { label: 'Rounds',      key: 'rounds',        icon: <RefreshCw size={18} />, color: '#748FFC', isTime: false },
          { label: 'Round Reset', key: 'roundReset',    icon: <Clock     size={18} />, color: '#F59F00', isTime: true  },
        ].map(item => (
          <div key={item.key} style={cardS}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ color: item.color }}>{item.icon}</div>
              <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{item.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {!item.readOnly && (
                <button style={stepS} onClick={() => setSettings(s => ({
                  ...s, [item.key]: Math.max(item.key === 'rounds' ? 1 : 5, s[item.key] - (item.key === 'rounds' ? 1 : 5))
                }))}>
                  <Minus size={14} />
                </button>
              )}
              <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 15,
                color: item.color, minWidth: 58, textAlign: 'center' }}>
                {item.readOnly ? item.display : item.isTime ? fmt(settings[item.key]) : `${settings[item.key]}×`}
              </span>
              {!item.readOnly && (
                <button style={stepS} onClick={() => setSettings(s => ({
                  ...s, [item.key]: s[item.key] + (item.key === 'rounds' ? 1 : 5)
                }))}>
                  <Plus size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal: History */}
      {modal === 'history' && (
        <Sheet T={T} onClose={() => setModal(null)} title="訓練紀錄">
          {history.length === 0
            ? <Empty T={T} msg="尚無訓練紀錄" />
            : history.map(h => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', padding: '13px 0', borderBottom: `1px solid ${T.divider}` }}>
                <div>
                  <div style={{ fontSize: 11, color: T.subtext, marginBottom: 2 }}>{h.date}</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{h.duration} 分鐘 HIIT</div>
                </div>
                <Trophy size={17} style={{ color: '#F59F00' }} />
              </div>
            ))
          }
        </Sheet>
      )}

      {/* Modal: Exercises */}
      {modal === 'exercises' && (
        <Sheet T={T} onClose={() => setModal(null)} title="動作清單"
          footer={
            <button onClick={() => {
              setSettings(s => ({ ...s, exerciseNames: editNames.filter(n => n.trim()) }));
              setModal(null);
            }} style={{ width: '100%', padding: 14, background: '#FF4C5E', border: 'none',
              borderRadius: 14, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
              儲存
            </button>
          }>
          {editNames.map((name, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input value={name}
                onChange={e => setEditNames(arr => { const n = [...arr]; n[i] = e.target.value; return n; })}
                style={{ flex: 1, background: T.inputBg, border: `1px solid ${T.inputBorder}`,
                  borderRadius: 12, padding: '12px 14px', color: T.inputText,
                  fontSize: 14, fontWeight: 600, outline: 'none', fontFamily: 'inherit' }} />
              <button onClick={() => setEditNames(arr => arr.filter((_, j) => j !== i))}
                style={{ background: 'rgba(255,76,94,0.12)', border: 'none', borderRadius: 12,
                  padding: '0 14px', color: '#FF4C5E', cursor: 'pointer', fontSize: 20, fontWeight: 700 }}>×</button>
            </div>
          ))}
          <button onClick={() => setEditNames(arr => [...arr, '新動作'])}
            style={{ width: '100%', padding: 12, background: T.inputBg,
              border: `1.5px dashed ${T.inputBorder}`, borderRadius: 12,
              color: T.subtext, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
            + 新增動作
          </button>
        </Sheet>
      )}

      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

function Sheet({ T, onClose, title, children, footer }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: T.modalBg, width: '100%', maxWidth: 420,
        borderRadius: '24px 24px 0 0', padding: '28px 24px 36px',
        maxHeight: '82vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.2)', transition: 'background 0.3s',
        overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontWeight: 900, fontSize: 18, color: T.text }}>{title}</span>
          <button onClick={onClose} style={{ background: T.iconBtn, border: 'none', color: T.text,
            borderRadius: 10, padding: '6px 10px', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ flex: 1 }}>{children}</div>
        {footer && <div style={{ marginTop: 16 }}>{footer}</div>}
      </div>
    </div>
  );
}

function Empty({ T, msg }) {
  return <div style={{ textAlign: 'center', color: T.subtext, padding: '40px 0', fontSize: 14 }}>{msg}</div>;
}