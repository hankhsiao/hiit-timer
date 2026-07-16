import React, { useState, useEffect, useRef } from 'react';
import {
  Play, Pause, RotateCcw, Activity, Timer, RefreshCw,
  History, Volume2, VolumeX, Zap, List, Trophy, Clock,
  X, Plus, Minus, Sun, Moon, Menu, ChevronDown, ChevronUp, Trash2, Pencil, SkipForward
} from 'lucide-react';
import NoSleep from 'nosleep.js';

// ─── Theme ────────────────────────────────────────────────────────────────────
const DARK = {
  bg: '#0D0D12', card: 'rgba(255,255,255,0.055)', cardBorder: 'rgba(255,255,255,0.07)',
  text: '#FFFFFF', subtext: 'rgba(255,255,255,0.38)',
  inputBg: 'rgba(255,255,255,0.07)', inputBorder: 'rgba(255,255,255,0.1)', inputText: '#fff',
  modalBg: '#1C1C26', divider: 'rgba(255,255,255,0.06)',
  iconBtn: 'rgba(255,255,255,0.09)', ringTrack: 'rgba(255,255,255,0.06)', glow: true,
  headerBg: 'rgba(13,13,18,0.72)', headerBorder: 'rgba(255,255,255,0.08)',
};
const LIGHT = {
  bg: '#F0F0F5', card: '#FFFFFF', cardBorder: 'rgba(0,0,0,0.06)',
  text: '#111111', subtext: 'rgba(0,0,0,0.35)',
  inputBg: 'rgba(0,0,0,0.04)', inputBorder: 'rgba(0,0,0,0.1)', inputText: '#111',
  modalBg: '#FFFFFF', divider: 'rgba(0,0,0,0.07)',
  iconBtn: 'rgba(0,0,0,0.07)', ringTrack: 'rgba(0,0,0,0.07)', glow: false,
  headerBg: 'rgba(240,240,245,0.72)', headerBorder: 'rgba(0,0,0,0.07)',
};

const PHASES = {
  IDLE:        { label: '準備就緒', color: '#FF4C5E' },
  ANNOUNCING:  { label: '播報中…',  color: '#4C6EF5' },
  PREPARING:   { label: '預備...',  color: '#4C6EF5' },
  WORK:        { label: '運動中',   color: '#FF4C5E' },
  REST:        { label: '休息',     color: '#20C997' },
  ROUND_RESET: { label: '組間休息', color: '#F59F00' },
  FINISHED:    { label: '完成！',   color: '#7C3AED' },
};

const DEFAULT_ROUTINES = [
  {
    id: 'hiit',
    name: 'HIIT',
    settings: { workTime: 30, restTime: 30, rounds: 3, roundReset: 60, mode: 'hiit',     exerciseNames: ['開合跳', '波比跳', '登山者', '深蹲跳'] },
  },
  {
    id: 'legs',
    name: '腿臀',
    settings: { workTime: 45, restTime: 45, rounds: 3, roundReset: 60, mode: 'strength', exerciseNames: ['高腳杯深蹲', '單腿羅馬尼亞硬舉', '保加利亞分腿蹲'] },
  },
  {
    id: 'push',
    name: '推系',
    settings: { workTime: 45, restTime: 45, rounds: 3, roundReset: 60, mode: 'strength', exerciseNames: ['深幅度伏地挺身', '地板啞鈴飛鳥', '腳高頭低伏地挺身'] },
  },
  {
    id: 'pull',
    name: '拉系',
    settings: { workTime: 45, restTime: 45, rounds: 3, roundReset: 60, mode: 'strength', exerciseNames: ['單臂啞鈴划船', '仰臥拉舉', '站姿啞鈴二頭彎舉'] },
  },
  {
    id: 'shoulders',
    name: '肩膀',
    settings: { workTime: 45, restTime: 45, rounds: 3, roundReset: 60, mode: 'strength', exerciseNames: ['坐姿啞鈴肩推', '啞鈴側平舉', '俯身飛鳥'] },
  },
  {
    id: 'stretch',
    name: '伸展',
    settings: { workTime: 45, restTime: 10, rounds: 1, roundReset: 15, mode: 'strength', exerciseNames: ['門框胸部伸展', '上斜方肌與頸部伸展（左）', '上斜方肌與頸部伸展（右）', '貓牛式（Cat-Cow）', '單膝跪地髖屈肌伸展（左）', '單膝跪地髖屈肌伸展（右）', '數字4伸展（左）', '數字4伸展（右）', '坐姿腿後側伸展（左）', '坐姿腿後側伸展（右）'] },
  },
];

function load(key, fb) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch { return fb; }
}
// Merge saved routines with DEFAULT_ROUTINES: keep every saved routine as-is
// (never overwrite the user's edits) and append any new default routines whose
// id isn't already present. This lets newly added defaults reach existing users.
function loadRoutines() {
  const saved = load('hiit_routines', null);
  if (!Array.isArray(saved)) return DEFAULT_ROUTINES;
  const existingIds = new Set(saved.map(r => r.id));
  const missing = DEFAULT_ROUTINES.filter(r => !existingIds.has(r.id));
  return missing.length ? [...saved, ...missing] : saved;
}
function fmt(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ─── Audio Engine ─────────────────────────────────────────────────────────────
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.silentAudio = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const silentWav = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      this.silentAudio = new Audio(silentWav);
      this.silentAudio.loop = true;
      this.silentAudio.volume = 0.001;
    } catch (e) { console.warn('AudioContext unavailable', e); }
  }

  startSilentLoop() {
    if (this.silentAudio) this.silentAudio.play().catch(() => {});
  }

  stopSilentLoop() {
    if (this.silentAudio) { this.silentAudio.pause(); this.silentAudio.currentTime = 0; }
  }

  stopSpeech() {
    window.speechSynthesis?.cancel();
  }

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

  tickBeep(n) {
    if (n === 0) {
      this.beep(660, 0.15, 0.4, 0);
      this.beep(880, 0.2, 0.5, 0.18);
    } else {
      this.beep(880, 0.1, 0.25, 0);
    }
  }

  speak(text, onEnd) {
    if (this.muted) { onEnd?.(); return; }
    const synth = window.speechSynthesis;
    if (!synth) { onEnd?.(); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW'; u.rate = 1.1; u.volume = 1;
    if (onEnd) { u.onend = onEnd; u.onerror = onEnd; }
    synth.speak(u);
  }

  kickSynth() {
    const synth = window.speechSynthesis;
    if (synth && synth.speaking) synth.pause(), synth.resume();
  }
}

const audioEngine = new AudioEngine();
const noSleep = new NoSleep();

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

  useEffect(() => {
    document.documentElement.style.background = T.bg;
    document.body.style.background = T.bg;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = T.bg;
  }, [T.bg]);

  const [routines, setRoutines]               = useState(loadRoutines);
  const [activeRoutineId, setActiveRoutineId] = useState(() => load('hiit_active_routine', 'hiit'));
  const [history, setHistory]                 = useState(() => load('hiit_history', []));
  const [phase, setPhase]                     = useState('IDLE');
  const [isActive, setIsActive]               = useState(false);
  const [timeLeft, setTimeLeft]               = useState(0);
  const [phaseDur, setPhaseDur]               = useState(1);
  const [currentEx, setCurrentEx]             = useState(0);
  const [currentRound, setCurrentRound]       = useState(1);
  const [isMuted, setIsMuted]                 = useState(false);
  const [modal, setModal]                     = useState(null);
  const [editNames, setEditNames]             = useState([]);
  const [newRoutineName, setNewRoutineName]   = useState('');
  const [pulse, setPulse]                     = useState(false);
  const [dropdownOpen, setDropdownOpen]       = useState(false);
  const [editingId, setEditingId]             = useState(null);
  const [editingName, setEditingName]         = useState('');
  const [visualFrac, setVisualFrac]           = useState(0);
  const [visualSec,  setVisualSec]            = useState(0);

  const timerRef         = useRef(null);
  const kickRef          = useRef(null);
  const stateRef         = useRef({});
  const announcingRef    = useRef(false);
  const announceFallback = useRef(null);
  const phaseEndRef      = useRef(null);
  const rafRef           = useRef(null);
  const phaseStartRef    = useRef(null);
  const baseElapsedRef   = useRef(0);
  const phaseDurRef      = useRef(1);

  const activeRoutine = routines.find(r => r.id === activeRoutineId) || routines[0];
  const settings      = activeRoutine.settings;
  const mode          = settings.mode || 'hiit';

  stateRef.current = { phase, timeLeft, currentEx, currentRound, settings, isActive, phaseDur, routineName: activeRoutine.name };

  const updateSettings = (updater) => {
    setRoutines(rs => rs.map(r =>
      r.id === activeRoutineId
        ? { ...r, settings: typeof updater === 'function' ? updater(r.settings) : { ...r.settings, ...updater } }
        : r
    ));
  };

  useEffect(() => { audioEngine.muted = isMuted; }, [isMuted]);
  useEffect(() => { localStorage.setItem('hiit_routines', JSON.stringify(routines)); }, [routines]);
  useEffect(() => { localStorage.setItem('hiit_active_routine', JSON.stringify(activeRoutineId)); }, [activeRoutineId]);
  useEffect(() => { localStorage.setItem('hiit_history', JSON.stringify(history)); }, [history]);

  useEffect(() => {
    if (isActive) {
      kickRef.current = setInterval(() => audioEngine.kickSynth(), 10000);
    } else {
      clearInterval(kickRef.current);
    }
    return () => clearInterval(kickRef.current);
  }, [isActive]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (!isActive) return;
    const loop = (now) => {
      const dur = phaseDurRef.current;
      if (!phaseStartRef.current || !dur) { rafRef.current = requestAnimationFrame(loop); return; }
      const sinceResume = (now - phaseStartRef.current) / 1000;
      const elapsed     = baseElapsedRef.current + sinceResume;
      const frac        = Math.min(elapsed / dur, 1);
      const remaining   = Math.max(dur - elapsed, 0);
      setVisualFrac(frac);
      setVisualSec(remaining < 0.05 ? 0 : Math.ceil(remaining));
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isActive, phase]);

  const calcTotal = (s = settings) => {
    const ex   = s.exerciseNames.length;
    const m    = s.mode || 'hiit';
    if (m === 'strength') {
      // Each exercise: rounds × work + (rounds-1) × rest; between exercises: roundReset
      return ex * s.rounds * s.workTime
        + ex * (s.rounds - 1) * s.restTime
        + (ex - 1) * s.roundReset;
    }
    // HIIT: each round cycles all exercises; between rounds: roundReset
    return (s.workTime + s.restTime) * ex * s.rounds
      - s.restTime * s.rounds + s.roundReset * (s.rounds - 1);
  };

  const startPhase = (p, dur) => {
    phaseStartRef.current  = performance.now();
    baseElapsedRef.current = 0;
    phaseDurRef.current    = dur;
    setVisualFrac(0);
    setVisualSec(dur);
    setPhase(p); setTimeLeft(dur); setPhaseDur(dur);
  };

  const transition = () => {
    const { phase, currentEx, currentRound, settings, routineName } = stateRef.current;
    const { workTime, restTime, roundReset, rounds, exerciseNames } = settings;
    const m        = settings.mode || 'hiit';
    const lastEx   = currentEx === exerciseNames.length - 1;
    const lastRound = currentRound === rounds;
    setPulse(true); setTimeout(() => setPulse(false), 300);

    const finishWorkout = () => {
      setPhase('FINISHED'); setIsActive(false);
      audioEngine.speak('訓練完成，太棒了');
      audioEngine.stopSilentLoop();
      noSleep.disable();
      const rec = {
        id: Date.now(),
        date: new Date().toLocaleDateString('zh-TW'),
        duration: Math.ceil(calcTotal(settings) / 60),
        routineName,
      };
      setHistory(h => [rec, ...h].slice(0, 20));
    };

    if (phase === 'PREPARING') {
      startPhase('WORK', workTime);
      if (m === 'strength') audioEngine.speak(`${exerciseNames[0]} 第1組，開始`);
      else                  audioEngine.speak(`${exerciseNames[0]} 開始`);

    } else if (phase === 'WORK') {
      if (m === 'strength') {
        if (lastRound && lastEx) {
          finishWorkout();
        } else if (lastRound) {
          // All rounds of this exercise done; break before next exercise
          audioEngine.speak(`${exerciseNames[currentEx]} 完成，準備${exerciseNames[currentEx + 1]}`);
          startPhase('ROUND_RESET', roundReset);
        } else {
          // More rounds of same exercise
          audioEngine.speak('休息');
          startPhase('REST', restTime);
        }
      } else {
        // HIIT
        if (!lastEx) {
          audioEngine.speak(`休息，準備好${exerciseNames[currentEx + 1]}`);
          startPhase('REST', restTime);
        } else if (!lastRound) {
          audioEngine.speak('一組完成，大組休息');
          startPhase('ROUND_RESET', roundReset);
        } else {
          finishWorkout();
        }
      }

    } else if (phase === 'REST') {
      if (m === 'strength') {
        const nextRound = currentRound + 1;
        setCurrentRound(nextRound);
        startPhase('WORK', workTime);
        audioEngine.speak(`${exerciseNames[currentEx]} 第${nextRound}組，開始`);
      } else {
        const nextEx = currentEx + 1;
        setCurrentEx(nextEx);
        startPhase('WORK', workTime);
        audioEngine.speak(`${exerciseNames[nextEx]} 開始`);
      }

    } else if (phase === 'ROUND_RESET') {
      if (m === 'strength') {
        const nextEx = currentEx + 1;
        setCurrentEx(nextEx);
        setCurrentRound(1);
        startPhase('WORK', workTime);
        audioEngine.speak(`${exerciseNames[nextEx]} 第1組，開始`);
      } else {
        setCurrentEx(0);
        setCurrentRound(r => r + 1);
        startPhase('WORK', workTime);
        audioEngine.speak(`第 ${currentRound + 1} 組，${exerciseNames[0]} 開始`);
      }
    }
  };

  useEffect(() => {
    if (!isActive) { clearInterval(timerRef.current); return; }

    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        const { phase, currentEx, currentRound, settings } = stateRef.current;
        const { workTime, exerciseNames } = settings;
        const m    = settings.mode || 'hiit';
        const next = t - 1;

        if (next <= 3) audioEngine.tickBeep(next);

        if (phase === 'WORK' && workTime > 30) {
          const half = Math.floor(workTime / 2);
          if (next === half) audioEngine.speak('一半了，繼續');
        }

        if (phase === 'REST' && next === 3) {
          if (m === 'strength') {
            audioEngine.speak(`準備，第${currentRound + 1}組`);
          } else {
            const ni = currentEx + 1;
            if (ni < exerciseNames.length) audioEngine.speak(`準備好，${exerciseNames[ni]}`);
          }
        }

        if (phase === 'ROUND_RESET' && next === 3) {
          if (m === 'strength') {
            const ni = currentEx + 1;
            if (ni < exerciseNames.length) audioEngine.speak(`準備，${exerciseNames[ni]}`);
          } else {
            audioEngine.speak(`準備好，${exerciseNames[0]}`);
          }
        }

        if (next <= 0) {
          clearInterval(timerRef.current);
          // Show ring fully closed for 350ms before the next phase starts
          phaseEndRef.current = setTimeout(transition, 350);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [isActive, phase]);

  const cancelAnnouncing = () => {
    announcingRef.current = false;
    clearTimeout(announceFallback.current);
    setPhase('IDLE');
    audioEngine.stopSpeech();
    audioEngine.stopSilentLoop();
    noSleep.disable();
  };

  const toggle = () => {
    audioEngine.init();

    if (phase === 'ANNOUNCING') {
      cancelAnnouncing();
      return;
    }

    if (phase === 'IDLE' || phase === 'FINISHED') {
      const exList   = settings.exerciseNames.join('，');
      const roundStr = settings.rounds > 1 ? `每個動作${settings.rounds}組，` : '';

      audioEngine.startSilentLoop();
      noSleep.enable();
      setCurrentEx(0); setCurrentRound(1);
      setPhase('ANNOUNCING');
      announcingRef.current = true;

      const afterAnnounce = () => {
        if (!announcingRef.current) return;
        announcingRef.current = false;
        clearTimeout(announceFallback.current);
        startPhase('PREPARING', 3);
        setIsActive(true);
      };

      audioEngine.speak(`今天的訓練：${roundStr}${exList}`, afterAnnounce);
      announceFallback.current = setTimeout(afterAnnounce, 15000);
    } else {
      if (isActive) {
        if (phaseStartRef.current) {
          baseElapsedRef.current += (performance.now() - phaseStartRef.current) / 1000;
          phaseStartRef.current = null;
        }
        audioEngine.stopSilentLoop();
        noSleep.disable();
      } else {
        phaseStartRef.current = performance.now();
        audioEngine.startSilentLoop();
        audioEngine.resume();
        noSleep.enable();
      }
      setIsActive(a => !a);
    }
  };

  const reset = () => {
    if (announcingRef.current) cancelAnnouncing();
    clearInterval(timerRef.current);
    clearTimeout(phaseEndRef.current);
    cancelAnimationFrame(rafRef.current);
    phaseStartRef.current = null;
    baseElapsedRef.current = 0;
    audioEngine.stopSilentLoop();
    audioEngine.stopSpeech();
    noSleep.disable();
    setIsActive(false); setPhase('IDLE'); setTimeLeft(0); setPhaseDur(1);
    setCurrentEx(0); setCurrentRound(1);
    setVisualFrac(0); setVisualSec(0);
  };

  // Skip the current phase and jump straight to the next one.
  // Doubles as a manual rescue if the countdown ever stalls.
  const skipToNext = () => {
    const p = stateRef.current.phase;
    if (p !== 'PREPARING' && p !== 'WORK' && p !== 'REST' && p !== 'ROUND_RESET') return;
    clearInterval(timerRef.current);
    clearTimeout(phaseEndRef.current);
    audioEngine.stopSpeech();
    // If we were paused, resume the workout as we advance.
    if (!stateRef.current.isActive) {
      audioEngine.startSilentLoop();
      audioEngine.resume();
      noSleep.enable();
      setIsActive(true);
    }
    transition();
  };

  const switchRoutine = (id) => {
    reset();
    setActiveRoutineId(id);
    setDropdownOpen(false);
  };

  const addRoutine = () => {
    const name = newRoutineName.trim() || '新課表';
    const id   = `routine_${Date.now()}`;
    setRoutines(rs => [...rs, { id, name, settings: { ...settings } }]);
    reset();
    setActiveRoutineId(id);
    setModal(null);
    setNewRoutineName('');
  };

  const moveRoutine = (id, dir) => {
    setRoutines(rs => {
      const i = rs.findIndex(r => r.id === id);
      if (dir === 'up' && i === 0) return rs;
      if (dir === 'down' && i === rs.length - 1) return rs;
      const next = [...rs];
      const swap = dir === 'up' ? i - 1 : i + 1;
      [next[i], next[swap]] = [next[swap], next[i]];
      return next;
    });
  };

  const saveRename = () => {
    const name = editingName.trim();
    if (name && editingId) {
      setRoutines(rs => rs.map(r => r.id === editingId ? { ...r, name } : r));
    }
    setEditingId(null);
    setEditingName('');
  };

  const deleteRoutine = (id) => {
    if (routines.length <= 1) return;
    const next = routines.filter(r => r.id !== id);
    setRoutines(next);
    if (activeRoutineId === id) {
      setActiveRoutineId(next[0].id);
      reset();
    }
  };

  const openExercises = () => {
    audioEngine.init();
    setEditNames([...settings.exerciseNames]);
    setModal('exercises');
  };

  const phaseInfo     = PHASES[phase] || PHASES.IDLE;
  const circumference = 2 * Math.PI * 110;
  const ringFraction = (phase === 'IDLE' || phase === 'ANNOUNCING' || phase === 'FINISHED') ? 0 : visualFrac;
  const ringOffset   = circumference * (1 - ringFraction);
  const isRunning     = phase !== 'IDLE' && phase !== 'FINISHED';

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
    <div
      style={{
        fontFamily: "'DM Sans', sans-serif", background: T.bg, minHeight: '100dvh',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        color: T.text, userSelect: 'none', transition: 'background 0.35s, color 0.35s',
      }}
      onClick={() => setDropdownOpen(false)}
    >
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,700;9..40,900&family=DM+Mono:wght@500&display=swap" rel="stylesheet" />

      {/* ── Header (sticky app bar) ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 40, width: '100%',
        display: 'flex', justifyContent: 'center',
        background: T.headerBg,
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: `1px solid ${T.headerBorder}`,
        padding: 'calc(env(safe-area-inset-top, 0px) + 10px) 20px 10px',
        transition: 'background 0.35s, border-color 0.35s',
      }}>
        {/* Layout row: left/right in flex, centre absolutely overlaid */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', height: 44, width: '100%', maxWidth: 380 }}>

          {/* Left: menu */}
          <button
            onClick={e => { e.stopPropagation(); audioEngine.init(); setModal('menu'); }}
            style={{ ...ib(), zIndex: 1 }}
          >
            <Menu size={20} />
          </button>

          {/* Right: exercise list */}
          <button
            onClick={() => openExercises()}
            style={{ ...ib(), marginLeft: 'auto', zIndex: 1, padding: '10px 16px', gap: 6, fontSize: 13, fontWeight: 700, flexDirection: 'row' }}
          >
            <List size={16} /><span>動作清單</span>
          </button>

          {/* Centre overlay — always geometrically centred, never shifts layout */}
          <div
            style={{
              position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ position: 'relative', pointerEvents: 'auto' }}>
              <button
                onClick={() => !isRunning && setDropdownOpen(o => !o)}
                style={{
                  background: 'none', border: 'none',
                  cursor: isRunning ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 13, fontWeight: 900, letterSpacing: '0.15em',
                  color: isRunning ? T.subtext : T.text,
                  padding: '6px 8px', borderRadius: 10,
                  transition: 'color 0.3s', textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                {activeRoutine.name}
                {!isRunning && <ChevronDown size={13} style={{ opacity: 0.55, marginTop: 1 }} />}
              </button>

              {dropdownOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: '50%',
                  transform: 'translateX(-50%)',
                  background: T.modalBg, borderRadius: 14, padding: '6px 0',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.28)', zIndex: 50,
                  minWidth: 140, border: `1px solid ${T.cardBorder}`,
                  animation: 'dropdownIn 0.12s ease',
                }}>
                  {routines.map(r => (
                    <button
                      key={r.id}
                      onClick={() => switchRoutine(r.id)}
                      style={{
                        width: '100%', padding: '10px 18px', background: 'none', border: 'none',
                        cursor: 'pointer', textAlign: 'left', display: 'block',
                        fontSize: 14, fontWeight: r.id === activeRoutineId ? 900 : 600,
                        color: r.id === activeRoutineId ? phaseInfo.color : T.text,
                        letterSpacing: '0.04em', whiteSpace: 'nowrap',
                      }}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Ring ── */}
      <div style={{ position: 'relative', margin: '32px 0 20px', width: 264, height: 264 }}>
        <svg width="264" height="264" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
          <circle cx="132" cy="132" r="110" fill="none" stroke={T.ringTrack} strokeWidth="8" />
          <circle cx="132" cy="132" r="110" fill="none"
            stroke={phaseInfo.color} strokeWidth="8"
            strokeDasharray={circumference} strokeDashoffset={ringOffset}
            strokeLinecap="round"
            style={{ transition: 'stroke 0.5s ease' }} />
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
            {(phase === 'IDLE' || phase === 'ANNOUNCING') ? fmt(calcTotal()) : fmt(visualSec)}
          </div>
          {phase !== 'IDLE' && phase !== 'ANNOUNCING' && phase !== 'FINISHED' && (
            <div style={{ fontSize: 11, color: T.subtext, fontWeight: 700, marginTop: 10 }}>
              {mode === 'strength'
                ? `第 ${currentRound} 組 / 共 ${settings.rounds} 組`
                : `第 ${currentRound} 組 / 共 ${settings.rounds} 組`}
            </div>
          )}
          {(phase === 'IDLE' || phase === 'ANNOUNCING') && (
            <div style={{ fontSize: 11, color: T.subtext, fontWeight: 600, marginTop: 8 }}>
              {phase === 'ANNOUNCING' ? '點擊取消' : '預計總時長'}
            </div>
          )}
        </div>
      </div>

      {/* ── Exercise dots ── */}
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

      {/* ── Play / Reset ── */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 36 }}>
        {phase !== 'IDLE' && phase !== 'ANNOUNCING'
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
          {isActive || phase === 'ANNOUNCING'
            ? <Pause size={30} color="#fff" fill="#fff" />
            : <Play  size={30} color="#fff" fill="#fff" style={{ transform: 'translateX(2px)' }} />}
        </button>
        {phase === 'PREPARING' || phase === 'WORK' || phase === 'REST' || phase === 'ROUND_RESET'
          ? <button onClick={skipToNext} title="跳到下一個" aria-label="跳到下一個"
              style={{ width: 52, height: 52, borderRadius: '50%',
                background: T.iconBtn, border: 'none', color: T.text, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SkipForward size={20} />
            </button>
          : <div style={{ width: 52 }} />}
      </div>

      {/* ── Settings cards ── */}
      <div style={{ width: '100%', maxWidth: 420, padding: `0 20px calc(env(safe-area-inset-bottom, 0px) + 32px)`, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Mode toggle */}
        <div style={cardS}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ color: '#4C6EF5' }}><Zap size={18} /></div>
            <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>模式</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['hiit', '循環'], ['strength', '直組']].map(([m, label]) => (
              <button key={m}
                onClick={() => updateSettings(s => ({ ...s, mode: m }))}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  background: mode === m ? '#4C6EF5' : T.iconBtn,
                  color: mode === m ? '#fff' : T.subtext,
                  fontSize: 12, fontWeight: 800, transition: 'background 0.2s, color 0.2s',
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {[
          { label: 'Work',        key: 'workTime',      icon: <Activity  size={18} />, color: '#FF4C5E', isTime: true  },
          { label: 'Rest',        key: 'restTime',      icon: <Timer     size={18} />, color: '#20C997', isTime: true  },
          { label: 'Exercises',   key: 'exerciseNames', icon: <List      size={18} />, color: '#748FFC', readOnly: true, display: `${settings.exerciseNames.length} 個動作`, onCardClick: openExercises },
          { label: 'Rounds',      key: 'rounds',        icon: <RefreshCw size={18} />, color: '#748FFC', isTime: false },
          { label: 'Round Reset', key: 'roundReset',    icon: <Clock     size={18} />, color: '#F59F00', isTime: true  },
        ].map(item => (
          <div
            key={item.key}
            style={{ ...cardS, cursor: item.onCardClick ? 'pointer' : 'default' }}
            onClick={item.onCardClick}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ color: item.color }}>{item.icon}</div>
              <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{item.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {!item.readOnly && (
                <button style={stepS} onClick={e => { e.stopPropagation(); updateSettings(s => ({
                  ...s, [item.key]: Math.max(item.key === 'rounds' ? 1 : 5, s[item.key] - (item.key === 'rounds' ? 1 : 5)),
                })); }}>
                  <Minus size={14} />
                </button>
              )}
              <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 15,
                color: item.color, minWidth: 58, textAlign: 'center' }}>
                {item.readOnly ? item.display : item.isTime ? fmt(settings[item.key]) : `${settings[item.key]}×`}
              </span>
              {!item.readOnly && (
                <button style={stepS} onClick={e => { e.stopPropagation(); updateSettings(s => ({
                  ...s, [item.key]: s[item.key] + (item.key === 'rounds' ? 1 : 5),
                })); }}>
                  <Plus size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ════════ Modals ════════ */}

      {modal === 'menu' && (
        <Sheet T={T} onClose={() => setModal(null)} title="選單">
          <MenuItem T={T}
            icon={darkMode ? <Sun size={18} /> : <Moon size={18} />}
            label={darkMode ? '切換亮色模式' : '切換暗色模式'}
            onClick={() => { setDarkMode(d => !d); setModal(null); }} />
          <MenuItem T={T}
            icon={isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            label={isMuted ? '開啟聲音' : '靜音'}
            onClick={() => { audioEngine.muted = !isMuted; setIsMuted(m => !m); setModal(null); }} />
          <Divider T={T} />
          <MenuItem T={T} icon={<History size={18} />} label="訓練紀錄"
            onClick={() => setModal('history')} />
          <Divider T={T} />
          <MenuItem T={T} icon={<Plus size={18} />} label="新增課表"
            onClick={() => { setNewRoutineName(''); setModal('addRoutine'); }} />
          <MenuItem T={T} icon={<List size={18} />} label="管理課表"
            onClick={() => setModal('manageRoutines')} />
        </Sheet>
      )}

      {modal === 'history' && (
        <Sheet T={T} onClose={() => setModal(null)} title="訓練紀錄">
          {history.length === 0
            ? <Empty T={T} msg="尚無訓練紀錄" />
            : history.map(h => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', padding: '13px 0', borderBottom: `1px solid ${T.divider}` }}>
                <div>
                  <div style={{ fontSize: 11, color: T.subtext, marginBottom: 2 }}>{h.date}</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: T.text }}>
                    {h.duration} 分鐘 · {h.routineName || 'HIIT'}
                  </div>
                </div>
                <Trophy size={17} style={{ color: '#F59F00' }} />
              </div>
            ))
          }
        </Sheet>
      )}

      {modal === 'exercises' && (
        <Sheet T={T} onClose={() => setModal(null)} title="動作清單"
          footer={
            <button onClick={() => {
              updateSettings(s => ({ ...s, exerciseNames: editNames.filter(n => n.trim()) }));
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

      {modal === 'addRoutine' && (
        <Sheet T={T} onClose={() => setModal(null)} title="新增課表"
          footer={
            <button onClick={addRoutine}
              style={{ width: '100%', padding: 14, background: '#FF4C5E', border: 'none',
                borderRadius: 14, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
              建立
            </button>
          }>
          <div style={{ fontSize: 13, color: T.subtext, fontWeight: 600, marginBottom: 10 }}>
            將複製「{activeRoutine.name}」的目前設定
          </div>
          <input
            value={newRoutineName}
            onChange={e => setNewRoutineName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addRoutine()}
            placeholder="課表名稱…"
            autoFocus
            style={{ width: '100%', background: T.inputBg, border: `1px solid ${T.inputBorder}`,
              borderRadius: 12, padding: '14px 16px', color: T.inputText,
              fontSize: 15, fontWeight: 600, outline: 'none', fontFamily: 'inherit',
              boxSizing: 'border-box' }} />
        </Sheet>
      )}

      {modal === 'manageRoutines' && (
        <Sheet T={T} onClose={() => { setModal(null); setEditingId(null); }} title="管理課表">
          {routines.map((r, i) => (
            <div key={r.id} style={{ padding: '12px 0', borderBottom: `1px solid ${T.divider}` }}>
              {/* Name row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {editingId === r.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onBlur={saveRename}
                    onKeyDown={e => { if (e.key === 'Enter') { e.target.blur(); } }}
                    style={{
                      flex: 1, background: T.inputBg, border: `1px solid ${T.inputBorder}`,
                      borderRadius: 10, padding: '7px 12px', color: T.inputText,
                      fontSize: 15, fontWeight: 700, outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                ) : (
                  <button
                    onClick={() => { setEditingId(r.id); setEditingName(r.name); }}
                    style={{
                      flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                      textAlign: 'left', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 15, color: r.id === activeRoutineId ? '#FF4C5E' : T.text }}>
                      {r.name}
                    </span>
                    {r.id === activeRoutineId && (
                      <span style={{ fontSize: 10, color: T.subtext, fontWeight: 600 }}>使用中</span>
                    )}
                    <Pencil size={12} style={{ color: T.subtext, opacity: 0.6, marginLeft: 2 }} />
                  </button>
                )}

                {/* Up / Down / Delete */}
                <button
                  onClick={() => moveRoutine(r.id, 'up')}
                  style={{ background: T.iconBtn, border: 'none', borderRadius: 8, padding: '6px 8px',
                    cursor: i === 0 ? 'default' : 'pointer', color: T.text,
                    opacity: i === 0 ? 0.2 : 1, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                >
                  <ChevronUp size={15} />
                </button>
                <button
                  onClick={() => moveRoutine(r.id, 'down')}
                  style={{ background: T.iconBtn, border: 'none', borderRadius: 8, padding: '6px 8px',
                    cursor: i === routines.length - 1 ? 'default' : 'pointer', color: T.text,
                    opacity: i === routines.length - 1 ? 0.2 : 1, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                >
                  <ChevronDown size={15} />
                </button>
                {routines.length > 1 && (
                  <button
                    onClick={() => deleteRoutine(r.id)}
                    style={{ background: 'rgba(255,76,94,0.12)', border: 'none', borderRadius: 8,
                      padding: '6px 8px', color: '#FF4C5E', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', flexShrink: 0 }}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>

              {/* Exercise preview */}
              <div style={{ fontSize: 11, color: T.subtext, marginTop: 5,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 2 }}>
                {r.settings.exerciseNames.join(' · ')}
              </div>
            </div>
          ))}
        </Sheet>
      )}

      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
        @keyframes dropdownIn{
          from{opacity:0;transform:translateX(-50%) translateY(4px)}
          to{opacity:1;transform:translateX(-50%) translateY(0)}
        }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MenuItem({ T, icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 14,
      padding: '13px 4px', background: 'none', border: 'none',
      color: T.text, cursor: 'pointer', borderRadius: 12,
      fontSize: 15, fontWeight: 600, textAlign: 'left',
    }}>
      <span style={{ color: T.subtext, display: 'flex' }}>{icon}</span>
      {label}
    </button>
  );
}

function Divider({ T }) {
  return <div style={{ height: 1, background: T.divider, margin: '6px 0' }} />;
}

function Sheet({ T, onClose, title, children, footer }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: T.modalBg, width: '100%', maxWidth: 420,
        borderRadius: '24px 24px 0 0', padding: `28px 24px calc(env(safe-area-inset-bottom, 0px) + 28px)`,
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
