import { useState, useEffect } from 'react';
import type { CSSProperties, ReactNode, MouseEvent as ReactMouseEvent } from 'react';
import { collection, onSnapshot, query, addDoc, deleteDoc, doc, where, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from './lib/firebase';
import { Trash2, Plus, X, AlertCircle, Bell, BellRing, Clock, CalendarClock, Mic, Pencil, Maximize, ArrowRight, Check, Share2, MessageCircle, LogOut } from 'lucide-react';

/* ───────────────────────────────────────────────────────────────
   التصميم: صفحة دفتر مدرسي بخطوط سيْياس (Seyès)
   - الصفحة كلها ورقة واحدة مسطّرة، وكل سطر نص يجلس على سطر الدفتر.
   - الهامش الأحمر على اليمين (اتجاه الكتابة العربية) يحمل حالة الإنجاز.
   - قلم التمييز (الأصفر) = كل ما هو «معلَّم»: التبويب النشط، الأسطر المحددة، التنبيهات.
   - الحبر الأزرق الداكن للنص والأزرار الرئيسية، والأحمر للهامش والحذف فقط.
   كل الأنماط مغلّفة داخل .tv-root فلا تتأثر بأي ملف أنماط آخر.
   ─────────────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@700&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap');

.tv-root{
  --tv-paper:#FAFBFD; --tv-rule:#D9E4F4; --tv-rule-strong:#B2C3DE;
  --tv-ink:#14243F; --tv-ink-soft:#56667F; --tv-ink-faint:#7A88A1;
  --tv-margin:#D6534A; --tv-danger:#C0392F; --tv-hl:#F8DE62; --tv-hl-soft:#FDF2B5;
  --tv-lh:32px; --tv-fs:16px; --tv-gut:52px;
  font-family:'IBM Plex Sans Arabic','Noto Sans Arabic',system-ui,sans-serif;
  color:var(--tv-ink); background:var(--tv-paper);
  display:flex; flex-direction:column; flex:1; height:100%; position:relative;
  -webkit-tap-highlight-color:transparent;
}
:where(.tv-root) button{background:none;border:0;padding:0;margin:0;font:inherit;color:inherit;cursor:pointer}
:where(.tv-root) h2,:where(.tv-root) h3,:where(.tv-root) p{margin:0}
.tv-root :focus-visible{outline:2px solid var(--tv-ink);outline-offset:2px;border-radius:6px}

/* الترويسة */
.tv-head{flex:none}
.tv-headtext{padding:22px 20px 0; display:flex; justify-content:space-between; align-items:flex-start;}
.tv-title{font-family:'Aref Ruqaa',serif;font-weight:700;font-size:30px;line-height:1.35}
.tv-date{font-size:14px;color:var(--tv-ink-soft);margin-top:2px}
.tv-tabs{display:flex;margin-top:14px;border-bottom:1px solid var(--tv-rule-strong)}
.tv-tab{flex:1;height:48px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:16px;font-weight:500;color:var(--tv-ink-soft)}
.tv-tab[aria-selected="true"]{color:var(--tv-ink);font-weight:600}
.tv-tab-label{padding:0 6px}
.tv-tab[aria-selected="true"] .tv-tab-label{background-image:linear-gradient(transparent 56%,var(--tv-hl) 56%,var(--tv-hl) 92%,transparent 92%)}
.tv-count{font-size:13px;color:var(--tv-ink-soft);font-variant-numeric:tabular-nums}

/* الورقة المسطّرة */
.tv-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.tv-paper{
  background-color:var(--tv-paper);
  background-image:linear-gradient(to bottom,transparent calc(var(--tv-lh) - 4px),var(--tv-rule) calc(var(--tv-lh) - 4px),var(--tv-rule) calc(var(--tv-lh) - 3px),transparent calc(var(--tv-lh) - 3px));
  background-size:100% var(--tv-lh); background-attachment:local;
}
.tv-page{position:relative;min-height:100%;padding-bottom:120px}
.tv-page::before{content:'';position:absolute;top:0;bottom:0;inset-inline-start:var(--tv-gut);width:1.5px;background:var(--tv-margin);opacity:.55;pointer-events:none;z-index:3}

.tv-day{
  position:sticky;top:0;z-index:2;height:var(--tv-lh);display:flex;align-items:flex-end;
  padding-inline-start:calc(var(--tv-gut) + 14px);padding-inline-end:16px;
  font-family:'Aref Ruqaa',serif;font-weight:700;font-size:19px;line-height:var(--tv-lh);
  background:linear-gradient(to bottom,var(--tv-paper) calc(var(--tv-lh) - 4px),var(--tv-rule-strong) calc(var(--tv-lh) - 4px),var(--tv-rule-strong) calc(var(--tv-lh) - 3px),var(--tv-paper) calc(var(--tv-lh) - 3px));
}

.tv-item{position:relative;display:flex}
.tv-item::after{content:'';position:absolute;inset-inline:0;bottom:3px;height:1px;background:var(--tv-rule-strong);pointer-events:none}
.tv-item[data-done="true"]{opacity:.62}
.tv-gutter{flex:none;width:var(--tv-gut)}
.tv-body{flex:1;min-width:0;padding-inline:14px 16px}

.tv-done-btn{width:var(--tv-gut);height:var(--tv-lh);display:grid;place-items:center}
.tv-circle{width:26px;height:26px;border-radius:50%;border:2px solid var(--tv-ink-faint);display:grid;place-items:center;color:#fff;background:var(--tv-paper);transition:background .15s,border-color .15s}
.tv-circle[data-on="true"]{background:var(--tv-ink);border-color:var(--tv-ink);animation:tv-pop .2s ease-out}

/* الأسطر */
.tv-line{display:flex;align-items:flex-start;gap:6px}
.tv-hit{flex:none;width:28px;height:var(--tv-lh);display:grid;place-items:center}
.tv-box{width:19px;height:19px;border-radius:5px;border:1.5px solid var(--tv-ink-faint);display:grid;place-items:center;background:var(--tv-paper);color:#fff;transition:background .15s,border-color .15s}
.tv-box[data-tone="hl"]{border-color:var(--tv-rule-strong);background:transparent}
.tv-box[data-tone="hl"][data-on="true"]{background:var(--tv-hl);border-color:#CDB028;color:var(--tv-ink)}
.tv-box[data-tone="ink"][data-on="true"]{background:var(--tv-ink);border-color:var(--tv-ink)}
.tv-box[data-on="true"]{animation:tv-pop .2s ease-out}
.tv-text{flex:1;min-width:0;font-size:var(--tv-fs);font-weight:500;line-height:var(--tv-lh);overflow-wrap:anywhere;user-select:text;-webkit-user-select:text}
.tv-mark[data-sel="true"]{background-image:linear-gradient(transparent 48%,var(--tv-hl) 48%,var(--tv-hl) 94%,transparent 94%);-webkit-box-decoration-break:clone;box-decoration-break:clone}
.tv-line[data-struck="true"] .tv-text{color:var(--tv-ink-faint);text-decoration:line-through;text-decoration-thickness:2px;text-decoration-color:var(--tv-ink-soft);text-decoration-skip-ink:none}

/* شريط المعلومات والإجراءات */
.tv-meta{display:flex;flex-wrap:wrap;align-items:center;column-gap:10px}
.tv-time,.tv-slot,.tv-donelabel{display:inline-flex;align-items:center;height:var(--tv-lh)}
.tv-time{gap:5px;font-size:13px;color:var(--tv-ink-soft);font-variant-numeric:tabular-nums}
.tv-chip{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 8px;border-radius:6px;background:var(--tv-hl-soft);color:#5A4800;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums}
.tv-chip[data-fired="true"]{background:transparent;color:var(--tv-ink-faint);text-decoration:line-through}
.tv-grow{flex:1}
.tv-ico{width:36px;height:var(--tv-lh);display:grid;place-items:center;border-radius:8px;color:var(--tv-ink-soft);transition:background .12s,color .12s}
.tv-ico:active{background:rgba(20,36,63,.08)}
.tv-ico--danger:active{color:var(--tv-danger);background:#FBE3E0}
.tv-ico--round{width:44px;height:44px;border-radius:50%}
.tv-donelabel{font-size:14px;font-weight:500;color:var(--tv-ink-soft)}

/* الحالة الفارغة */
.tv-empty{padding-top:calc(var(--tv-lh)*2);padding-inline-start:calc(var(--tv-gut) + 14px);padding-inline-end:20px}
.tv-empty-title{font-family:'Aref Ruqaa',serif;font-weight:700;font-size:22px;line-height:var(--tv-lh)}
.tv-empty-sub{font-size:15px;line-height:var(--tv-lh);color:var(--tv-ink-soft)}

/* زر الإضافة وشريط التحديد */
.tv-fab{position:absolute;left:16px;bottom:24px;z-index:40;height:52px;padding:0 20px 0 18px;border-radius:16px;background:var(--tv-ink);color:#fff;display:inline-flex;align-items:center;gap:8px;font-size:16px;font-weight:600;box-shadow:0 10px 24px -8px rgba(20,36,63,.55);transition:transform .12s}
.tv-fab:active{transform:scale(.96)}
.tv-selbar{position:absolute;inset-inline:0;bottom:24px;z-index:50;display:flex;justify-content:center;padding-inline:16px;pointer-events:none;animation:tv-rise .22s ease-out}
.tv-selbar-in{pointer-events:auto;display:flex;align-items:center;gap:8px;width:100%;max-width:400px;padding:8px;border-radius:18px;background:var(--tv-ink);color:#fff;box-shadow:0 14px 34px -10px rgba(20,36,63,.6)}
.tv-selcount{flex:1;font-size:15px;font-weight:600;padding-inline:4px}
.tv-selbtn{height:44px;min-width:44px;padding:0 14px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:rgba(255,255,255,.14);color:#fff;font-weight:600;font-size:15px}
.tv-selbtn--wa{background:#1FA855}

/* التفاصيل بملء الشاشة */
.tv-full{position:fixed;inset:0;z-index:200;display:flex;flex-direction:column;background:var(--tv-paper);animation:tv-rise .26s cubic-bezier(.2,.8,.2,1)}
.tv-fullbar{display:flex;align-items:center;gap:4px;padding:10px 10px 10px 14px;border-bottom:1px solid var(--tv-rule-strong);flex:none}
.tv-fulltitle{flex:1;font-family:'Aref Ruqaa',serif;font-weight:700;font-size:22px;padding-inline-start:6px}
.tv-full .tv-page{padding-top:var(--tv-lh)}
.tv-full .tv-time,.tv-full .tv-donelabel{font-size:15px}
.tv-metatext{display:flex;align-items:center;gap:8px;font-size:14px;line-height:var(--tv-lh);color:var(--tv-ink-soft)}

/* النوافذ: ورقة سفلية للإضافة، وحوار صغير للتنبيه والحذف */
.tv-scrim{position:fixed;inset:0;z-index:300;display:flex;background:rgba(20,36,63,.48);animation:tv-fade .18s ease-out}
.tv-scrim[data-v="sheet"]{align-items:flex-end}
.tv-scrim[data-v="dialog"]{align-items:center;justify-content:center;padding:20px}
.tv-sheet{width:100%;max-width:520px;margin-inline:auto;max-height:92vh;max-height:92dvh;overflow-y:auto;background:var(--tv-paper);border-radius:24px 24px 0 0;padding:10px 20px calc(20px + env(safe-area-inset-bottom,0px));animation:tv-rise .26s cubic-bezier(.2,.8,.2,1)}
.tv-grab{width:40px;height:4px;border-radius:2px;background:var(--tv-rule-strong);margin:0 auto 6px}
.tv-sheet-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.tv-sheet-title{font-family:'Aref Ruqaa',serif;font-weight:700;font-size:23px}
.tv-dialog{width:100%;max-width:340px;background:var(--tv-paper);border-radius:22px;padding:24px 20px 20px;text-align:center;animation:tv-pop .22s ease-out}
.tv-dlg-icon{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;margin:0 auto 12px;color:var(--tv-ink)}
.tv-dlg-icon--alarm{background:var(--tv-hl)}
.tv-dlg-icon--warn{background:var(--tv-hl-soft)}
.tv-dlg-icon--danger{background:#FBE3E0;color:var(--tv-danger)}
.tv-dlg-icon--alarm svg{transform-origin:50% 10%;animation:tv-ring 1.6s ease-in-out infinite}
.tv-dlg-title{font-family:'Aref Ruqaa',serif;font-weight:700;font-size:22px;margin-bottom:6px}
.tv-dlg-msg{font-size:16px;line-height:1.7;color:var(--tv-ink-soft);white-space:pre-line;overflow-wrap:anywhere}
.tv-dlg-msg--strong{color:var(--tv-ink);font-weight:600}

/* حقول النموذج */
.tv-field{
  display:block;width:100%;box-sizing:border-box;min-height:176px;max-height:300px;resize:none;border:1px solid var(--tv-rule-strong);border-radius:14px;outline:none;
  font:500 16px/32px 'IBM Plex Sans Arabic','Noto Sans Arabic',system-ui,sans-serif;color:var(--tv-ink);padding:8px 64px 8px 14px;background-color:#fff;
  background-image:
    linear-gradient(to left,transparent 51px,var(--tv-margin) 51px,var(--tv-margin) 52.5px,transparent 52.5px),
    linear-gradient(to bottom,transparent 28px,var(--tv-rule) 28px,var(--tv-rule) 29px,transparent 29px);
  background-size:100% 100%,100% 32px; background-position:0 0,0 8px; background-repeat:no-repeat,repeat-y; background-attachment:scroll,local;
}
.tv-field:focus{border-color:var(--tv-ink)}
.tv-field::placeholder{color:var(--tv-ink-faint)}
.tv-fieldrow{display:flex;align-items:center;gap:12px;margin:8px 0 14px}
.tv-hint{flex:1;font-size:13px;line-height:1.6;color:var(--tv-ink-soft)}
.tv-mic{flex:none;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:#fff;border:1px solid var(--tv-rule-strong);color:var(--tv-ink)}
.tv-mic.is-on{background:var(--tv-danger);border-color:var(--tv-danger);color:#fff;animation:tv-beat 1.1s ease-in-out infinite}
.tv-label{display:block;font-size:13px;font-weight:500;color:var(--tv-ink-soft);margin:0 2px 6px}
.tv-input{display:block;width:100%;box-sizing:border-box;height:46px;padding:0 14px;border-radius:12px;border:1px solid var(--tv-rule-strong);background:#fff;font:500 15px 'IBM Plex Sans Arabic',system-ui,sans-serif;color:var(--tv-ink);outline:none}
.tv-input:focus{border-color:var(--tv-ink)}
.tv-alarmbox{margin-top:16px;padding:12px 14px;border-radius:14px;border:1px solid var(--tv-rule-strong);background:#fff}
.tv-alarmbox[data-on="true"]{border-color:#D9BE3A;background:var(--tv-hl-soft)}
.tv-switchrow{display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer}
.tv-switchlabel{display:inline-flex;align-items:center;gap:8px;font-size:15px;font-weight:600}
.tv-alarmbox .tv-label{margin-top:12px}
.tv-switch{appearance:none;-webkit-appearance:none;flex:none;margin:0;width:46px;height:28px;border-radius:14px;background:var(--tv-rule-strong);position:relative;cursor:pointer;transition:background .18s}
.tv-switch::after{content:'';position:absolute;top:3px;inset-inline-start:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .18s}
.tv-switch:checked{background:var(--tv-ink)}
.tv-switch:checked::after{transform:translateX(-18px)}

.tv-actions{display:flex;gap:8px;margin-top:20px}
.tv-btn{height:48px;padding:0 20px;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:16px;font-weight:600;transition:transform .12s}
.tv-btn:active{transform:scale(.97)}
.tv-btn--primary{flex:2;background:var(--tv-ink);color:#fff}
.tv-btn--danger{flex:2;background:var(--tv-danger);color:#fff}
.tv-btn--ghost{flex:1;color:var(--tv-ink-soft)}
.tv-btn--block{flex:none;width:100%;margin-top:18px}

@keyframes tv-fade{from{opacity:0}to{opacity:1}}
@keyframes tv-rise{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}
@keyframes tv-pop{0%{transform:scale(.86)}60%{transform:scale(1.08)}100%{transform:scale(1)}}
@keyframes tv-beat{0%,100%{box-shadow:0 0 0 0 rgba(192,57,47,.45)}50%{box-shadow:0 0 0 10px rgba(192,57,47,0)}}
@keyframes tv-ring{0%,70%,100%{transform:rotate(0)}10%,30%,50%{transform:rotate(-14deg)}20%,40%,60%{transform:rotate(14deg)}}
@media (prefers-reduced-motion:reduce){.tv-root *,.tv-root *::before,.tv-root *::after{animation:none!important;transition:none!important}}
`;

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  variant?: 'dialog' | 'sheet';
  children: ReactNode;
};

const CustomModal = ({ isOpen, onClose, title, variant = 'dialog', children }: ModalProps) => {
  if (!isOpen) return null;
  const isSheet = variant === 'sheet';
  return (
    <div className="tv-scrim" data-v={variant} onClick={isSheet ? undefined : onClose}>
      <div className={isSheet ? 'tv-sheet' : 'tv-dialog'} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        {isSheet && (
          <>
            <div className="tv-grab" />
            <div className="tv-sheet-head">
              <h3 className="tv-sheet-title">{title}</h3>
              <button type="button" className="tv-ico tv-ico--round" onClick={onClose} aria-label="إغلاق"><X size={22} /></button>
            </div>
          </>
        )}
        {children}
      </div>
    </div>
  );
};

const parseLine = (text: string) => {
  const regex = /^[\s\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E]*(\[\s*[xX]?\s*\][\s\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E]*)+/;
  const match = text.match(regex);
  let isDone = false;
  let cleanText = text;

  if (match) {
    isDone = /[xX]/.test(match[0]);
    cleanText = text.replace(regex, '');
  }
  
  return { isDone, cleanText };
};

const playAlarmSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1);
  } catch (err) {
    console.error('Audio play blocked or not supported', err);
  }
};

let activeAlarmInterval: any = null;
let activeAlarmTimeout: any = null;

const startRepeatingAlarm = () => {
  stopRepeatingAlarm();
  playAlarmSound(); 
  
  activeAlarmInterval = setInterval(() => {
    playAlarmSound();
  }, 2000); 
  
  activeAlarmTimeout = setTimeout(() => {
    stopRepeatingAlarm();
  }, 30000); 
};

const stopRepeatingAlarm = () => {
  if (activeAlarmInterval) clearInterval(activeAlarmInterval);
  if (activeAlarmTimeout) clearTimeout(activeAlarmTimeout);
  activeAlarmInterval = null;
  activeAlarmTimeout = null;
};

const triggerSystemNotification = (title: string, body: string) => {
  try {
    if (!("Notification" in window)) return;
    
    if (Notification.permission === "granted") {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(title, {
            body: body,
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            vibrate: [300, 100, 300, 100, 300],
            requireInteraction: true,
            renotify: true,
            tag: 'task-alarm-' + Date.now()
          } as any).catch(err => console.error("SW Notification Error", err));
        });
      } else {
        new Notification(title, { body, icon: '/pwa-192x192.png' });
      }
    }
  } catch (error) {
    console.error("System notification blocked due to environment", error);
  }
};

interface TaskItem {
  id?: string;
  title: string;
  type: 'task' | 'note';
  date: number;
  isCompleted: boolean;
  hasAlarm: boolean;
  alarmTime: number | null;
  alarmTriggered: boolean;
  userId: string;
}

const WHATSAPP_NUMBER = '213662561049';

const DAY_MS = 86400000;
const startOfDay = (ts: number) => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
const hhmm = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const dayLabel = (ts: number) => {
  const diff = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY_MS);
  if (diff === 0) return 'اليوم';
  if (diff === 1) return 'أمس';
  if (diff === -1) return 'غداً';
  const sameYear = new Date(ts).getFullYear() === new Date().getFullYear();
  return new Date(ts).toLocaleDateString('ar-DZ', { weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
};
const alarmLabel = (alarmTs: number, itemTs: number) =>
  startOfDay(alarmTs) === startOfDay(itemTs)
    ? hhmm(alarmTs)
    : `${new Date(alarmTs).toLocaleDateString('ar-DZ', { day: 'numeric', month: 'short' })} ${hhmm(alarmTs)}`;

const Box = ({ on, tone }: { on: boolean; tone: 'ink' | 'hl' }) => (
  <span className="tv-box" data-on={on} data-tone={tone}>
    {on && <Check size={13} strokeWidth={3.5} />}
  </span>
);

type LineListProps = {
  item: TaskItem;
  selectedIds: string[];
  onSelect: (id: string) => void;
  onToggleNote: (item: TaskItem, index: number, e: ReactMouseEvent) => void;
};

const LineList = ({ item, selectedIds, onSelect, onToggleNote }: LineListProps) => {
  const lines = item.title.split(/\r?\n/).map((line, idx) => {
    const { isDone, cleanText } = parseLine(line);
    return { idx, cleanText, isDone, isEmpty: cleanText.trim() === '' };
  });
  const ordered = [...lines.filter(l => !l.isEmpty && !l.isDone), ...lines.filter(l => !l.isEmpty && l.isDone)];
  const whole = item.type === 'task' && item.isCompleted;

  return (
    <div>
      {ordered.map(l => {
        const sid = `${item.type}_${item.id}_${l.idx}`;
        const sel = selectedIds.includes(sid);
        return (
          <div key={l.idx} className="tv-line" data-struck={l.isDone || whole}>
            {item.type === 'task' ? (
              <button type="button" role="checkbox" aria-checked={sel} aria-label="تحديد السطر للمشاركة" className="tv-hit" onClick={() => onSelect(sid)}>
                <Box on={sel} tone="hl" />
              </button>
            ) : (
              <button type="button" role="checkbox" aria-checked={l.isDone} aria-label={l.isDone ? 'إلغاء الشطب' : 'شطب السطر'} className="tv-hit" onClick={e => onToggleNote(item, l.idx, e)}>
                <Box on={l.isDone} tone="ink" />
              </button>
            )}
            <span className="tv-text"><span className="tv-mark" data-sel={sel}>{l.cleanText}</span></span>
          </div>
        );
      })}
    </div>
  );
};

export default function TasksView() {
  const [items, setItems] = useState<TaskItem[]>([]);
  const [activeTab, setActiveTab] = useState<'task' | 'note'>('task');
  const userId = auth.currentUser?.uid;

  const [showAddModal, setShowAddModal] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<TaskItem | null>(null);
  const [titleInput, setTitleInput] = useState('');
  
  const [isListening, setIsListening] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [customDate, setCustomDate] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });

  const [hasAlarm, setHasAlarm] = useState(false);
  const [alarmDate, setAlarmDate] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset() + 30);
    return now.toISOString().slice(0, 16);
  });

  const [alertMsg, setAlertMsg] = useState<{title: string, msg: string} | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [fullScreenItemId, setFullScreenItemId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, 'tasks'), where('userId', '==', userId));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskItem));
      data.sort((a, b) => b.date - a.date);
      setItems(data);
    });
    return () => unsub();
  }, [userId]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      items.forEach(async (item) => {
        if (item.type === 'task' && item.hasAlarm && item.alarmTime && !item.isCompleted && !item.alarmTriggered) {
          if (now >= item.alarmTime) {
            startRepeatingAlarm(); 
            triggerSystemNotification("⏰ حان وقت المهمة!", item.title);
            setAlertMsg({ title: "⏰ حان وقت المهمة!", msg: item.title });
            if (item.id) {
              await updateDoc(doc(db, 'tasks', item.id), { alarmTriggered: true });
            }
          }
        }
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [items]);

  useEffect(() => {
    setSelectedIds([]);
  }, [activeTab]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("خطأ أثناء تسجيل الخروج", err);
    }
  };

  const handleAlarmToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setHasAlarm(checked);
    try {
      if (checked && "Notification" in window) {
        if (Notification.permission !== "granted" && Notification.permission !== "denied") {
          await Notification.requestPermission();
        }
      }
    } catch (error) {
      console.warn("إشعارات النظام غير مدعومة في بيئة HTTP المحلية.");
    }
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return setAlertMsg({ title: "عذراً", msg: "متصفحك لا يدعم الإدخال الصوتي." });
    if (isListening) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'ar-SA';
    recognition.interimResults = false;
    
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setTitleInput(prev => prev ? `${prev} ${transcript}` : transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const handleOpenAddModal = () => {
    setItemToEdit(null);
    setTitleInput('');
    setHasAlarm(false);
    
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setCustomDate(now.toISOString().slice(0, 16));
    
    now.setMinutes(now.getMinutes() + 30);
    setAlarmDate(now.toISOString().slice(0, 16));
    
    setShowAddModal(true);
  };

  const handleOpenEditModal = (item: TaskItem) => {
    setItemToEdit(item);
    
    const cleanLinesForEdit = item.title.split(/\r?\n/).map(line => {
      const { isDone, cleanText } = parseLine(line);
      return isDone ? `[x] ${cleanText}` : cleanText;
    });
    
    setTitleInput(cleanLinesForEdit.join('\n'));
    
    const d = new Date(item.date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setCustomDate(d.toISOString().slice(0, 16));

    if (item.type === 'task') {
      setHasAlarm(item.hasAlarm);
      if (item.hasAlarm && item.alarmTime) {
        const ad = new Date(item.alarmTime);
        ad.setMinutes(ad.getMinutes() - ad.getTimezoneOffset());
        setAlarmDate(ad.toISOString().slice(0, 16));
      } else {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset() + 30);
        setAlarmDate(now.toISOString().slice(0, 16));
      }
    }
    setShowAddModal(true);
  };

  const handleSaveItem = async () => {
    if (!userId) return setAlertMsg({ title: "خطأ", msg: "يجب تسجيل الدخول" });
    if (!titleInput.trim()) return setAlertMsg({ title: "تنبيه", msg: "يرجى كتابة نص المهمة أو الملاحظة" });

    const itemTimestamp = new Date(customDate).getTime();
    const alarmTimestamp = hasAlarm && activeTab === 'task' ? new Date(alarmDate).getTime() : null;

    try {
      if (itemToEdit && itemToEdit.id) {
        await updateDoc(doc(db, 'tasks', itemToEdit.id), {
          title: titleInput.trim(),
          date: itemTimestamp,
          hasAlarm: activeTab === 'task' ? hasAlarm : false,
          alarmTime: alarmTimestamp,
          alarmTriggered: (itemToEdit.alarmTime !== alarmTimestamp) ? false : itemToEdit.alarmTriggered
        });
      } else {
        await addDoc(collection(db, 'tasks'), {
          title: titleInput.trim(),
          type: activeTab,
          date: itemTimestamp,
          isCompleted: false,
          hasAlarm: activeTab === 'task' ? hasAlarm : false,
          alarmTime: alarmTimestamp,
          alarmTriggered: false,
          userId,
          createdAt: Date.now()
        });
      }

      setShowAddModal(false);
      setItemToEdit(null);
      setTitleInput('');
      setHasAlarm(false);
      
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      setCustomDate(now.toISOString().slice(0, 16));
    } catch {
      setAlertMsg({ title: "خطأ", msg: "حدث خطأ أثناء الحفظ" });
    }
  };

  const handleToggleNoteLine = async (item: TaskItem, originalIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.id) return;
    
    const lines = item.title.split(/\r?\n/);
    const targetLine = lines[originalIndex] ?? "";
    const { isDone, cleanText } = parseLine(targetLine);

    lines[originalIndex] = isDone ? cleanText : `[x] ${cleanText}`;

    try {
      await updateDoc(doc(db, 'tasks', item.id), {
        title: lines.join('\n')
      });
    } catch (err) {
      console.error("Error updating note line:", err);
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      if (itemToDelete === fullScreenItemId) {
        setFullScreenItemId(null);
      }
      await deleteDoc(doc(db, 'tasks', itemToDelete));
      
      setSelectedIds(prev => prev.filter(id => !id.includes(itemToDelete)));
      setItemToDelete(null);
    } catch {
      setAlertMsg({ title: "خطأ", msg: "حدث خطأ أثناء الحذف" });
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(itemId => itemId !== id) : [...prev, id]
    );
  };

  const getFormattedSelectedTasks = () => {
    let selectedTextArray: string[] = [];
    
    items.forEach(item => {
      if (item.type === 'task' && item.id) {
        const rawLines = item.title.split(/\r?\n/);
        rawLines.forEach((line, idx) => {
          const selectionId = `task_${item.id}_${idx}`;
          if (selectedIds.includes(selectionId)) {
            const { cleanText } = parseLine(line);
            if (cleanText.trim() !== '') {
              selectedTextArray.push(`📌 ${cleanText}`);
            }
          }
        });
      }
    });

    return selectedTextArray.join('\n');
  };

  const handleShareSelectedNative = async () => {
    const textToShare = getFormattedSelectedTasks();
    if (!textToShare) return;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'مشاركة المهام المحددة',
          text: textToShare
        });
      } catch (err) {
        console.log('تم إلغاء المشاركة أو حدث خطأ', err);
      }
    } else {
      setAlertMsg({ title: "عذراً", msg: "ميزة المشاركة غير مدعومة في هذا المتصفح." });
    }
  };

  const handleShareSelectedWhatsApp = () => {
    const textToShare = getFormattedSelectedTasks();
    if (!textToShare) return;
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(textToShare)}`;
    window.open(url, '_blank');
  };

  const handleShareSingle = async (item: TaskItem) => {
    if (!item.id) return;
    const prefix = item.type === 'task' ? '📌 ' : '📝 ';
    const rawLines = item.title.split(/\r?\n/);

    const hasSelectedLines = rawLines.some((_, idx) =>
      selectedIds.includes(`${item.type}_${item.id}_${idx}`)
    );

    let linesToShare: string[] = [];

    rawLines.forEach((line, idx) => {
      const { cleanText } = parseLine(line);
      if (cleanText.trim() !== '') {
        if (!hasSelectedLines || selectedIds.includes(`${item.type}_${item.id}_${idx}`)) {
          linesToShare.push(prefix + cleanText);
        }
      }
    });

    if (linesToShare.length === 0) return;

    const text = linesToShare.join('\n');
      
    if (navigator.share) {
      try {
        await navigator.share({ title: 'مشاركة', text });
      } catch (e) {}
    } else {
      const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
    }
  };

  const filteredItems = items.filter(item => item.type === activeTab);
  const tasksCount = items.filter(item => item.type === 'task').length;
  const notesCount = items.filter(item => item.type === 'note').length;
  const fullScreenItem = items.find(item => item.id === fullScreenItemId);

  const groups: { key: string; label: string; list: TaskItem[] }[] = [];
  filteredItems.forEach(item => {
    const key = String(startOfDay(item.date));
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.list.push(item);
    else groups.push({ key, label: dayLabel(item.date), list: [item] });
  });

  const closeAlert = () => { setAlertMsg(null); stopRepeatingAlarm(); };
  const isAlarmAlert = !!alertMsg?.title?.includes('وقت');
  const todayText = new Date().toLocaleDateString('ar-DZ', { weekday: 'long', day: 'numeric', month: 'long' });
  const showSelection = activeTab === 'task' && selectedIds.length > 0;
  const fullScreenVars = { '--tv-lh': '40px', '--tv-fs': '19px' } as CSSProperties;

  return (
    <div className="tv-root" dir="rtl">
      <style>{CSS}</style>

      {fullScreenItem && (
        <div className="tv-full" style={fullScreenVars}>
          <div className="tv-fullbar">
            <button type="button" className="tv-ico tv-ico--round" onClick={() => setFullScreenItemId(null)} aria-label="رجوع"><ArrowRight size={24} /></button>
            <h2 className="tv-fulltitle">{fullScreenItem.type === 'task' ? 'تفاصيل المهمة' : 'تفاصيل الملاحظة'}</h2>
            <button type="button" className="tv-ico tv-ico--round" onClick={() => handleShareSingle(fullScreenItem)} aria-label="مشاركة"><Share2 size={21} /></button>
            <button type="button" className="tv-ico tv-ico--round" onClick={() => { setFullScreenItemId(null); handleOpenEditModal(fullScreenItem); }} aria-label="تعديل"><Pencil size={21} /></button>
            <button type="button" className="tv-ico tv-ico--round tv-ico--danger" onClick={() => setItemToDelete(fullScreenItem.id!)} aria-label="حذف"><Trash2 size={21} /></button>
          </div>

          <div className="tv-scroll tv-paper">
            <div className="tv-page">
              <div className="tv-item" data-done={fullScreenItem.type === 'task' && fullScreenItem.isCompleted}>
                <div className="tv-gutter">
                  {/* تم إزالة زر إنجاز المهمة بالكامل بناءً على طلبك */}
                </div>
                <div className="tv-body">
                  <LineList item={fullScreenItem} selectedIds={selectedIds} onSelect={toggleSelection} onToggleNote={handleToggleNoteLine} />
                  <div className="tv-metatext">
                    <CalendarClock size={16} />
                    <span>{new Date(fullScreenItem.date).toLocaleString('ar-DZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {fullScreenItem.hasAlarm && fullScreenItem.alarmTime && (
                    <div className="tv-slot">
                      <span className="tv-chip" data-fired={fullScreenItem.alarmTriggered}><Bell size={14} /> تنبيه {alarmLabel(fullScreenItem.alarmTime, fullScreenItem.date)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <CustomModal isOpen={!!alertMsg} onClose={closeAlert} title={alertMsg?.title}>
        <div className={`tv-dlg-icon ${isAlarmAlert ? 'tv-dlg-icon--alarm' : 'tv-dlg-icon--warn'}`}>
          {isAlarmAlert ? <BellRing size={30} /> : <AlertCircle size={30} />}
        </div>
        <h3 className="tv-dlg-title">{alertMsg?.title?.replace('⏰', '').trim()}</h3>
        <p className={`tv-dlg-msg ${isAlarmAlert ? 'tv-dlg-msg--strong' : ''}`}>{alertMsg?.msg}</p>
        <button type="button" className="tv-btn tv-btn--primary tv-btn--block" onClick={closeAlert}>
          {isAlarmAlert ? 'إيقاف التنبيه' : 'حسناً'}
        </button>
      </CustomModal>

      <CustomModal isOpen={!!itemToDelete} onClose={() => setItemToDelete(null)} title="تأكيد الحذف">
        <div className="tv-dlg-icon tv-dlg-icon--danger"><Trash2 size={28} /></div>
        <h3 className="tv-dlg-title">حذف هذا العنصر؟</h3>
        <p className="tv-dlg-msg">سيُحذف نهائياً ولا يمكن استرجاعه.</p>
        <div className="tv-actions">
          <button type="button" className="tv-btn tv-btn--danger" onClick={confirmDelete}>حذف</button>
          <button type="button" className="tv-btn tv-btn--ghost" onClick={() => setItemToDelete(null)}>إلغاء</button>
        </div>
      </CustomModal>

      <CustomModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        variant="sheet"
        title={itemToEdit ? `تعديل ${activeTab === 'task' ? 'المهمة' : 'الملاحظة'}` : `إضافة ${activeTab === 'task' ? 'مهمة جديدة' : 'ملاحظة جديدة'}`}
      >
        <textarea
          className="tv-field"
          rows={5}
          placeholder={activeTab === 'task' ? 'ما الذي تريد إنجازه؟' : 'اكتب ملاحظتك. كل سطر عنصر مستقل.'}
          value={titleInput}
          onChange={e => setTitleInput(e.target.value)}
          autoFocus
        />
        <div className="tv-fieldrow">
          <p className="tv-hint">ابدأ السطر بـ <bdi dir="ltr">[x]</bdi> ليظهر منجزاً. يمكنك أيضاً الإملاء بصوتك.</p>
          <button type="button" className={`tv-mic ${isListening ? 'is-on' : ''}`} onClick={handleVoiceInput} aria-label="إملاء صوتي" aria-pressed={isListening}>
            <Mic size={21} />
          </button>
        </div>

        <label className="tv-label" htmlFor="tv-date">التاريخ والوقت</label>
        <input id="tv-date" type="datetime-local" className="tv-input" dir="ltr" value={customDate} onChange={e => setCustomDate(e.target.value)} />

        {activeTab === 'task' && (
          <div className="tv-alarmbox" data-on={hasAlarm}>
            <label className="tv-switchrow">
              <span className="tv-switchlabel"><BellRing size={18} /> تنبيه عند الموعد</span>
              <input type="checkbox" className="tv-switch" checked={hasAlarm} onChange={handleAlarmToggle} />
            </label>
            {hasAlarm && (
              <>
                <label className="tv-label" htmlFor="tv-alarm">وقت التنبيه</label>
                <input id="tv-alarm" type="datetime-local" className="tv-input" dir="ltr" value={alarmDate} onChange={e => setAlarmDate(e.target.value)} />
              </>
            )}
          </div>
        )}

        <div className="tv-actions">
          <button type="button" className="tv-btn tv-btn--primary" onClick={handleSaveItem}>{itemToEdit ? 'حفظ التعديلات' : 'حفظ'}</button>
          <button type="button" className="tv-btn tv-btn--ghost" onClick={() => setShowAddModal(false)}>إلغاء</button>
        </div>
      </CustomModal>

      <header className="tv-head">
        <div className="tv-headtext flex justify-between items-start">
          <div>
            <h2 className="tv-title">المهام والملاحظات</h2>
            <p className="tv-date">{todayText}</p>
          </div>
          <button 
            type="button" 
            onClick={handleLogout} 
            className="tv-ico tv-ico--round text-[var(--tv-ink-soft)] hover:bg-slate-200" 
            aria-label="تسجيل الخروج"
          >
            <LogOut size={22} />
          </button>
        </div>
        <div className="tv-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={activeTab === 'task'} className="tv-tab" onClick={() => setActiveTab('task')}>
            <span className="tv-tab-label">مطالب العائلة</span><span className="tv-count">{tasksCount}</span>
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'note'} className="tv-tab" onClick={() => setActiveTab('note')}>
            <span className="tv-tab-label">الملاحظات</span><span className="tv-count">{notesCount}</span>
          </button>
        </div>
      </header>

      <div className="tv-scroll tv-paper">
        <div className="tv-page">
          {filteredItems.length === 0 && (
            <div className="tv-empty">
              <p className="tv-empty-title">{activeTab === 'task' ? 'لا توجد مطالب بعد' : 'لا توجد ملاحظات بعد'}</p>
              <p className="tv-empty-sub">اكتب {activeTab === 'task' ? 'مطلبك' : 'ملاحظتك'} أو أملِه بصوتك.</p>
            </div>
          )}

          {groups.map(g => (
            <section key={g.key}>
              <h3 className="tv-day">{g.label}</h3>
              {g.list.map(item => (
                <article key={item.id} className="tv-item" data-done={item.type === 'task' && item.isCompleted}>
                  <div className="tv-gutter">
                    {/* تم إزالة زر إنجاز المهمة بالكامل بناءً على طلبك */}
                  </div>

                  <div className="tv-body">
                    <LineList item={item} selectedIds={selectedIds} onSelect={toggleSelection} onToggleNote={handleToggleNoteLine} />
                    <div className="tv-meta">
                      <span className="tv-time"><Clock size={14} /> {hhmm(item.date)}</span>
                      {item.hasAlarm && item.alarmTime && (
                        <span className="tv-slot">
                          <span className="tv-chip" data-fired={item.alarmTriggered}><Bell size={13} /> تنبيه {alarmLabel(item.alarmTime, item.date)}</span>
                        </span>
                      )}
                      <span className="tv-grow" />
                      <button type="button" className="tv-ico" onClick={() => handleOpenEditModal(item)} aria-label="تعديل"><Pencil size={18} /></button>
                      <button type="button" className="tv-ico tv-ico--danger" onClick={() => setItemToDelete(item.id!)} aria-label="حذف"><Trash2 size={18} /></button>
                      <button type="button" className="tv-ico" onClick={() => setFullScreenItemId(item.id!)} aria-label="عرض التفاصيل"><Maximize size={18} /></button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
      </div>

      {!showSelection && (
        <button type="button" className="tv-fab" onClick={handleOpenAddModal}>
          <Plus size={22} /> {activeTab === 'task' ? 'مطلب جديد' : 'ملاحظة جديدة'}
        </button>
      )}

      {showSelection && (
        <div className="tv-selbar">
          <div className="tv-selbar-in">
            <button type="button" className="tv-selbtn" onClick={() => setSelectedIds([])} aria-label="إلغاء التحديد"><X size={20} /></button>
            <span className="tv-selcount">المحدد: {selectedIds.length}</span>
            <button type="button" className="tv-selbtn" onClick={handleShareSelectedNative} aria-label="مشاركة عبر التطبيقات"><Share2 size={20} /></button>
            <button type="button" className="tv-selbtn tv-selbtn--wa" onClick={handleShareSelectedWhatsApp}><MessageCircle size={20} /> واتساب</button>
          </div>
        </div>
      )}
    </div>
  );
}