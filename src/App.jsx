import React, { useState, useEffect, useRef } from 'react';
import {
  Play, Pause, RotateCcw, Activity, Timer, RefreshCw,
  History, Volume2, VolumeX, Zap, List, Trophy, Clock,
  X, Plus, Minus, Heart, Sun, Moon, Download, ChevronRight
} from 'lucide-react';

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

// ── Apple Health XML builder ──────────────────────────────────────────────────
function buildXML(workouts) {
  const now = new Date().toISOString();
  const rows = workouts.map(w => {
    const end   = new Date(w.id);
    const start = new Date(end.getTime() - w.duration * 60000);
    return `  <Record type="HKWorkoutActivityTypeHighIntensityIntervalTraining"
    sourceName="HIIT Timer" sourceVersion="1"
    creationDate="${now}"
    startDate="${start.toISOString()}"
    endDate="${end.toISOString()}"
    duration="${w.duration}" durationUnit="min"/>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
  <!ELEMENT HealthData (Record*)>
  <!ATTLIST HealthData locale CDATA #REQUIRED>
  <!ELEMENT Record EMPTY>
]>
<HealthData locale="zh_TW">
${rows}
</HealthData>`;
}

// ── Reliable download via data: URI (works inside iframes/sandboxes) ──────────
function downloadXML(workouts) {
  const xml     = buildXML(workouts);
  const b64     = btoa(unescape(encodeURIComponent(xml)));      // UTF-8 safe base64
  const dataURI = `data:application/xml;base64,${b64}`;
  const a       = document.createElement('a');
  a.href        = dataURI;
  a.download    = 'hiit-workout.xml';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 500);
}

// ── App ───────────────────────────────────────────────────────────────────────
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
  const [modal,        setModal]        = useState(null); // 'history'|'exercises'|'healthGuide'
  const [editNames,    setEditNames]    = useState([]);
  const [pulse,        setPulse]        = useState(false);

  const timerRef = useRef(null);
  const synth    = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const stateRef = useRef({});
  stateRef.current = { phase, timeLeft, currentEx, currentRound, settings, isActive, phaseDur };

  useEffect(() => { localStorage.setItem('hiit_settings', JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem('hiit_history',  JSON.stringify(history));  }, [history]);

  const speak = text => {
    if (isMuted || !synth.current) return;
    synth.current.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW'; u.rate = 1.1; synth.current.speak(u);
  };

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
      startPhase('WORK', workTime); speak(`${exerciseNames[0]} 開始`);
    } else if (phase === 'WORK') {
      if (!lastEx) {
        startPhase('REST', restTime); speak('休息');
      } else if (!lastRound) {
        startPhase('ROUND_RESET', roundReset); speak('一組完成，大組休息');
      } else {
        setPhase('FINISHED'); setIsActive(false); speak('訓練完成，太棒了');
        const rec = { id: Date.now(), date: new Date().toLocaleDateString('zh-TW'), duration: Math.ceil(calcTotal() / 60) };
        setHistory(h => [rec, ...h].slice(0, 20));
      }
    } else if (phase === 'REST') {
      const next = currentEx + 1;
      setCurrentEx(next); startPhase('WORK', workTime); speak(`下一個，${exerciseNames[next]}`);
    } else if (phase === 'ROUND_RESET') {
      setCurrentEx(0); setCurrentRound(r => r + 1); startPhase('WORK', workTime);
      speak(`第 ${currentRound + 1} 組開始`);
    }
  };

  useEffect(() => {
    if (!isActive) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); transition(); return 0; }
        if (t <= 4) speak(String(t - 1));
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [isActive, phase]);

  const toggle = () => {
    if (phase === 'IDLE' || phase === 'FINISHED') {
      startPhase('PREPARING', 5); setCurrentEx(0); setCurrentRound(1); setIsActive(true); speak('預備開始');
    } else { setIsActive(a => !a); }
  };
  const reset = () => {
    clearInterval(timerRef.current);
    setIsActive(false); setPhase('IDLE'); setTimeLeft(0); setPhaseDur(1); setCurrentEx(0); setCurrentRound(1);
  };

  const handleHealthExport = () => {
    if (history.length === 0) { setModal('healthGuide'); return; }
    downloadXML(history);
    setTimeout(() => setModal('healthGuide'), 600); // show guide after download starts
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
        <button onClick={() => { setEditNames([...settings.exerciseNames]); setModal('exercises'); }}
          style={{ ...ib(), padding: '10px 16px', gap: 6, fontSize: 13, fontWeight: 700, flexDirection: 'row' }}>
          <List size={16} /><span>動作清單</span>
        </button>
        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.18em', color: T.subtext }}>HIIT TIMER</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setDarkMode(d => !d)} style={ib()}>
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={() => setIsMuted(m => !m)} style={ib({ color: isMuted ? T.subtext : T.text })}>
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
      <div style={{ width: '100%', maxWidth: 420, padding: '0 20px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
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

      {/* Apple Health button */}
      <div style={{ width: '100%', maxWidth: 420, padding: '8px 20px 48px' }}>
        <button onClick={handleHealthExport} style={{
          width: '100%', padding: '15px', borderRadius: 18,
          background: darkMode ? 'rgba(255,59,48,0.12)' : 'rgba(255,59,48,0.07)',
          border: `1px solid ${darkMode ? 'rgba(255,59,48,0.28)' : 'rgba(255,59,48,0.18)'}`,
          color: '#FF3B30', fontWeight: 800, fontSize: 14, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <Heart size={17} fill="#FF3B30" />
          {history.length === 0 ? '匯出至 Apple 健康（需先完成訓練）' : `匯出 ${history.length} 筆訓練至 Apple 健康`}
        </button>
      </div>

      {/* ── Modal: Health import guide ── */}
      {modal === 'healthGuide' && (
        <Sheet T={T} onClose={() => setModal(null)} title="匯入 Apple 健康">
          {history.length === 0
            ? <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🏋️</div>
                <div style={{ fontWeight: 700, marginBottom: 8, color: T.text }}>尚無訓練紀錄</div>
                <div style={{ fontSize: 13, color: T.subtext, lineHeight: 1.7 }}>完成一次訓練後再匯出</div>
              </div>
            : <>
                <div style={{ background: darkMode ? 'rgba(255,59,48,0.1)' : 'rgba(255,59,48,0.06)',
                  borderRadius: 14, padding: '14px 16px', marginBottom: 20,
                  display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Download size={20} style={{ color: '#FF3B30', flexShrink: 0 }} />
                  <div style={{ fontSize: 13, color: T.text, lineHeight: 1.6 }}>
                    <strong>hiit-workout.xml</strong> 已開始下載<br/>
                    <span style={{ color: T.subtext }}>在「下載」或「檔案」App 中可找到</span>
                  </div>
                </div>

                {/* Steps */}
                {[
                  { icon: '📂', title: '打開「檔案」App', desc: '在 iPhone 底部工具列找到「檔案」App（藍色資料夾）' },
                  { icon: '🔍', title: '找到下載的檔案', desc: '點「最近項目」或「下載」資料夾，找到 hiit-workout.xml' },
                  { icon: '👆', title: '點選檔案', desc: '點一下 hiit-workout.xml，系統會詢問要用哪個 App 開啟' },
                  { icon: '❤️', title: '選擇「健康」App', desc: '在跳出的 App 清單中選「健康」，然後點「匯入」' },
                ].map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: 14, paddingBottom: 18,
                    borderBottom: i < 3 ? `1px solid ${T.divider}` : 'none', marginBottom: i < 3 ? 18 : 0 }}>
                    <div style={{ fontSize: 24, flexShrink: 0, width: 32, textAlign: 'center' }}>{step.icon}</div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: T.text, marginBottom: 4 }}>
                        {i + 1}. {step.title}
                      </div>
                      <div style={{ fontSize: 12, color: T.subtext, lineHeight: 1.6 }}>{step.desc}</div>
                    </div>
                  </div>
                ))}

                <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 12,
                  background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  fontSize: 11, color: T.subtext, lineHeight: 1.7 }}>
                  💡 若「檔案」App 無法直接開啟，也可以在 Safari 下載記錄（點網址列旁的下載圖示）找到檔案
                </div>

                <button onClick={() => { downloadXML(history); }} style={{
                  width: '100%', marginTop: 16, padding: 14,
                  background: '#FF3B30', border: 'none', borderRadius: 14,
                  color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Download size={16} /> 重新下載 XML
                </button>
              </>
          }
        </Sheet>
      )}

      {/* ── Modal: History ── */}
      {modal === 'history' && (
        <Sheet T={T} onClose={() => setModal(null)} title="訓練紀錄"
          footer={history.length > 0 && (
            <button onClick={handleHealthExport} style={{
              width: '100%', padding: 14, background: '#FF3B30', border: 'none',
              borderRadius: 14, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Heart size={16} fill="#fff" /> 匯出至 Apple 健康
            </button>
          )}>
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

      {/* ── Modal: Exercises ── */}
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
