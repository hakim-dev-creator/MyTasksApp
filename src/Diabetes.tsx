import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Droplet,
  FlaskConical,
  Info,
  MapPin,
  Pencil,
  Plus,
  Settings as SettingsIcon,
  Stethoscope,
  Trash2,
  X,
} from 'lucide-react';
import { auth } from './lib/firebase';
import {
  A1C_TARGETS,
  CHECKUPS,
  CONTEXTS,
  CONTEXT_LABEL,
  CONTEXT_TARGET,
  DAY_MS,
  DEFAULT_A1C_TARGET,
  RANGE_HIGH,
  RANGE_LOW,
  UNITS,
  a1cStatus,
  a1cToEag,
  a1cToMmolMol,
  classify,
  dueState,
  formatGlucose,
  inLastDays,
  isPlausible,
  parseNumber,
  summarize,
  toMgdl,
  type CheckupDef,
  type CheckupId,
  type Classification,
  type Context,
  type DueState,
  type Reading,
  type Tone,
  type Unit,
} from './lib/diabetesRules';

/* -------------------------------------------------------------------------- */
/*  Types + Firestore                                                          */
/* -------------------------------------------------------------------------- */

interface A1cRecord {
  id: string;
  a1c: number;
  at: number;
  note?: string | null;
}
interface CheckupRecord {
  id: string;
  type: CheckupId;
  at: number;
  intervalMonths: number;
  result?: string | null;
  note?: string | null;
}
interface Appointment {
  id: string;
  doctor: string;
  specialty?: string | null;
  place?: string | null;
  at: number;
  note?: string | null;
  done: boolean;
}
type DiabetesType = 'type1' | 'type2' | 'other';
interface DiabetesSettings {
  unit: Unit;
  a1cTarget: number;
  type: DiabetesType;
}
const DEFAULT_SETTINGS: DiabetesSettings = { unit: 'mg/dL', a1cTarget: DEFAULT_A1C_TARGET, type: 'type2' };

const db = getFirestore(auth.app);

function useUid(): string | null {
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null)), []);
  return uid;
}

function useCollection<T extends { id: string }>(
  uid: string | null,
  name: string,
  orderField: string,
  max = 1000,
): T[] {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    if (!uid) {
      setItems([]);
      return;
    }
    const q = query(collection(db, 'users', uid, name), orderBy(orderField, 'desc'), limit(max));
    return onSnapshot(
      q,
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as T)),
      (err) => console.error(`[diabetes] ${name}:`, err),
    );
  }, [uid, name, orderField, max]);
  return items;
}

function useSettings(uid: string | null): DiabetesSettings {
  const [s, setS] = useState<DiabetesSettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, 'users', uid, 'settings', 'diabetes'), (snap) =>
      setS({ ...DEFAULT_SETTINGS, ...(snap.data() as Partial<DiabetesSettings> | undefined) }),
    );
  }, [uid]);
  return s;
}

/* -------------------------------------------------------------------------- */
/*  Formatting + styles                                                        */
/* -------------------------------------------------------------------------- */

const LOCALE = 'ar-u-nu-latn';
const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
const fmtDateTime = (ms: number) =>
  new Date(ms).toLocaleString(LOCALE, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toDateInput = (ms: number) => toLocalInput(ms).slice(0, 10);
const fromDateInput = (s: string) => new Date(`${s}T12:00:00`).getTime();

const txt = 'text-[#1B1B21] dark:text-[#E4E5EE]';
const muted = 'text-[#4A4D5C] dark:text-[#B4B8CA]';
const card =
  'rounded-[24px] bg-white p-4 shadow-[0_4px_18px_rgba(27,27,75,0.07)] dark:bg-[#181C27] dark:shadow-none';
const inputCls =
  'h-12 w-full rounded-2xl border-2 border-transparent bg-[#EEEFF8] px-4 text-base text-[#1B1B21] outline-none transition-colors focus:border-[#3B3FB8] dark:bg-[#232837] dark:text-[#E4E5EE] dark:focus:border-[#B9BEFF]';
const press =
  'transition-transform duration-150 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100';
const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B3FB8] dark:focus-visible:ring-[#B9BEFF]';
const primaryBtn = `inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#3B3FB8] px-6 text-base font-extrabold text-white disabled:opacity-70 dark:bg-[#B9BEFF] dark:text-[#14176B] ${press} ${focusRing}`;
const tonalBtn = `inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-[#E0E1FF] px-4 text-sm font-bold text-[#0A0C5E] dark:bg-[#2A2F8C] dark:text-[#E0E1FF] ${press} ${focusRing}`;

const TONE: Record<Tone | 'neutral', string> = {
  green: 'bg-[#DDF3EA] text-[#0F6B4F] dark:bg-[#0E3B2C] dark:text-[#7ADBB5]',
  amber: 'bg-[#FFF0D1] text-[#7A4B00] dark:bg-[#3D2C0A] dark:text-[#FFCB6B]',
  red: 'bg-[#FCE8E6] text-[#B3261E] dark:bg-[#4A1714] dark:text-[#F2B8B5]',
  neutral: 'bg-[#EEEFF8] text-[#4A4D5C] dark:bg-[#232837] dark:text-[#B4B8CA]',
};
const DOT: Record<Tone, string> = {
  green: 'fill-[#1E8E6A]',
  amber: 'fill-[#D98A00]',
  red: 'fill-[#C8372D]',
};

function Badge({ tone, children }: { tone: Tone | 'neutral'; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE[tone]}`}>
      {children}
    </span>
  );
}

const Glucose = ({ mgdl, unit }: { mgdl: number; unit: Unit }) => (
  <span dir="ltr" className="whitespace-nowrap">
    {formatGlucose(mgdl, unit, true)}
  </span>
);

/* -------------------------------------------------------------------------- */
/*  Generic UI                                                                 */
/* -------------------------------------------------------------------------- */

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[28px] bg-white p-5 dark:bg-[#181C27] sm:rounded-[28px]"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className={`text-xl font-extrabold ${txt}`}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className={`rounded-full p-2 ${muted} hover:bg-black/5 dark:hover:bg-white/10 ${focusRing}`}
          >
            <X size={22} />
          </button>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={`mb-1.5 block text-sm font-semibold ${muted}`}>{label}</span>
      {children}
      {hint && <span className={`mt-1 block text-xs ${muted}`}>{hint}</span>}
    </label>
  );
}

function Chips<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={[
              'rounded-full border px-3.5 py-2 text-sm font-bold',
              on
                ? 'border-transparent bg-[#3B3FB8] text-white dark:bg-[#B9BEFF] dark:text-[#14176B]'
                : `border-[#767A8C]/50 ${txt}`,
              press,
              focusRing,
            ].join(' ')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p role="alert" className={`rounded-2xl p-3 text-sm font-semibold ${TONE.red}`}>
      {text}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/*  Chart                                                                      */
/* -------------------------------------------------------------------------- */

function GlucoseChart({ readings, days, unit }: { readings: Reading[]; days: number; unit: Unit }) {
  const W = 600;
  const H = 220;
  const pad = { l: 44, r: 10, t: 12, b: 26 };
  const now = Date.now();
  const start = now - days * DAY_MS;
  const sorted = [...readings].sort((a, b) => a.at - b.at);
  const top = Math.min(400, Math.max(260, ...sorted.map((r) => r.mgdl + 20)));
  const bottom = 40;
  const x = (ms: number) => pad.l + ((ms - start) / (now - start)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - bottom) / (top - bottom)) * (H - pad.t - pad.b);
  const pts = sorted.map((r) => `${x(r.at).toFixed(1)},${y(r.mgdl).toFixed(1)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`رسم بياني لقياسات السكر خلال آخر ${days} يوماً`}
      className="h-auto w-full"
      style={{ direction: 'ltr' }}
    >
      <rect
        x={pad.l}
        y={y(RANGE_HIGH)}
        width={W - pad.l - pad.r}
        height={y(RANGE_LOW) - y(RANGE_HIGH)}
        className="fill-[#1E8E6A]/10"
      />
      {[RANGE_LOW, RANGE_HIGH].map((v) => (
        <g key={v}>
          <line
            x1={pad.l}
            x2={W - pad.r}
            y1={y(v)}
            y2={y(v)}
            strokeDasharray="4 4"
            className="stroke-[#767A8C]/60"
          />
          <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" className="fill-[#4A4D5C] dark:fill-[#B4B8CA]">
            {formatGlucose(v, unit)}
          </text>
        </g>
      ))}
      {sorted.length > 1 && (
        <polyline points={pts} fill="none" strokeWidth="1.5" className="stroke-[#767A8C]/50" />
      )}
      {sorted.map((r) => (
        <circle
          key={r.id}
          cx={x(r.at)}
          cy={y(r.mgdl)}
          r="4.5"
          className={DOT[classify(r.mgdl, r.context).tone]}
        >
          <title>{`${formatGlucose(r.mgdl, unit, true)} — ${fmtDateTime(r.at)}`}</title>
        </circle>
      ))}
      <text x={pad.l} y={H - 6} fontSize="11" textAnchor="start" className="fill-[#4A4D5C] dark:fill-[#B4B8CA]">
        {new Date(start).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}
      </text>
      <text x={W - pad.r} y={H - 6} fontSize="11" textAnchor="end" className="fill-[#4A4D5C] dark:fill-[#B4B8CA]">
        {new Date(now).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}
      </text>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sheets (forms)                                                             */
/* -------------------------------------------------------------------------- */

function GlucoseSheet({
  uid,
  unit,
  editItem,
  onClose,
  onSaved,
}: {
  uid: string;
  unit: Unit;
  editItem?: Reading;
  onClose: () => void;
  onSaved: (c: Classification, mgdl: number) => void;
}) {
  const [value, setValue] = useState(editItem ? formatGlucose(editItem.mgdl, unit) : '');
  const [context, setContext] = useState<Context>(editItem?.context || 'fasting');
  const [when, setWhen] = useState(toLocalInput(editItem?.at || Date.now()));
  const [note, setNote] = useState(editItem?.note || '');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    const n = parseNumber(value);
    if (!Number.isFinite(n) || n <= 0) return setErr('أدخل قيمة صحيحة.');
    const mgdl = toMgdl(n, unit);
    if (!isPlausible(mgdl)) {
      return setErr(
        `القيمة غير معقولة بوحدة ${unit}. تأكد من الوحدة (مثلاً 1.26 g/L تساوي 126 mg/dL) وغيّرها من الإعدادات إن لزم.`,
      );
    }
    const at = new Date(when).getTime();
    if (!Number.isFinite(at)) return setErr('حدد التاريخ والوقت.');
    if (at > Date.now() + 5 * 60_000) return setErr('لا يمكن تسجيل قياس في المستقبل.');

    setSaving(true);
    try {
      const payload = {
        mgdl: Math.round(mgdl * 10) / 10,
        context,
        at,
        note: note.trim() || null,
      };
      
      if (editItem?.id) {
        await updateDoc(doc(db, 'users', uid, 'glucose', editItem.id), payload);
      } else {
        await addDoc(collection(db, 'users', uid, 'glucose'), payload);
      }
      
      onSaved(classify(mgdl, context), mgdl);
      onClose();
    } catch {
      setErr('تعذّر الحفظ. تحقق من الاتصال وصلاحيات Firestore.');
      setSaving(false);
    }
  };

  return (
    <Sheet title={editItem ? "تعديل القياس" : "تسجيل قياس السكر"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Labeled label={`النتيجة (${unit})`} hint={`الهدف لهذا الوقت: ${CONTEXT_TARGET[context].text}`}>
          <input
            dir="ltr"
            inputMode="decimal"
            autoFocus
            className={`${inputCls} text-left text-2xl font-extrabold`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={unit === 'mg/dL' ? '110' : unit === 'g/L' ? '1.10' : '6.1'}
          />
        </Labeled>
        <div>
          <span className={`mb-1.5 block text-sm font-semibold ${muted}`}>وقت القياس</span>
          <Chips
            label="وقت القياس"
            value={context}
            onChange={setContext}
            options={CONTEXTS.map((c) => ({ value: c, label: CONTEXT_LABEL[c] }))}
          />
        </div>
        <Labeled label="التاريخ والوقت">
          <input
            type="datetime-local"
            dir="ltr"
            className={inputCls}
            value={when}
            max={toLocalInput(Date.now())}
            onChange={(e) => setWhen(e.target.value)}
          />
        </Labeled>
        <Labeled label="ملاحظة (اختياري)" hint="مثلاً: ما أكلته، نشاط بدني، الجرعة…">
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Labeled>
        <ErrorLine text={err} />
        <button type="submit" disabled={saving} className={`${primaryBtn} w-full`}>
          {editItem ? 'حفظ التعديلات' : 'حفظ القياس'}
        </button>
      </form>
    </Sheet>
  );
}

function A1cSheet({ uid, editItem, onClose }: { uid: string; editItem?: A1cRecord; onClose: () => void }) {
  const [value, setValue] = useState(editItem ? String(editItem.a1c) : '');
  const [date, setDate] = useState(toDateInput(editItem?.at || Date.now()));
  const [note, setNote] = useState(editItem?.note || '');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseNumber(value);
    if (!Number.isFinite(n) || n < 3 || n > 20) return setErr('أدخل نسبة A1C بين 3 و20 %.');
    if (!date) return setErr('حدد تاريخ التحليل.');
    setSaving(true);
    try {
      const payload = {
        a1c: Math.round(n * 10) / 10,
        at: fromDateInput(date),
        note: note.trim() || null,
      };

      if (editItem?.id) {
        await updateDoc(doc(db, 'users', uid, 'a1c', editItem.id), payload);
      } else {
        await addDoc(collection(db, 'users', uid, 'a1c'), payload);
      }
      onClose();
    } catch {
      setErr('تعذّر الحفظ. تحقق من الاتصال وصلاحيات Firestore.');
      setSaving(false);
    }
  };

  return (
    <Sheet title={editItem ? "تعديل النتيجة" : "تسجيل نتيجة السكر التراكمي (A1C)"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Labeled label="النتيجة (%)">
          <input
            dir="ltr"
            inputMode="decimal"
            autoFocus
            className={`${inputCls} text-left text-2xl font-extrabold`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="6.8"
          />
        </Labeled>
        <Labeled label="تاريخ التحليل">
          <input
            type="date"
            dir="ltr"
            className={inputCls}
            value={date}
            max={toDateInput(Date.now())}
            onChange={(e) => setDate(e.target.value)}
          />
        </Labeled>
        <Labeled label="ملاحظة (اختياري)">
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Labeled>
        <ErrorLine text={err} />
        <button type="submit" disabled={saving} className={`${primaryBtn} w-full`}>
          {editItem ? 'حفظ التعديلات' : 'حفظ النتيجة'}
        </button>
      </form>
    </Sheet>
  );
}

function CheckupSheet({ uid, def, editItem, onClose }: { uid: string; def: CheckupDef; editItem?: CheckupRecord; onClose: () => void }) {
  const [date, setDate] = useState(toDateInput(editItem?.at || Date.now()));
  const [interval, setIntervalMonths] = useState(editItem?.intervalMonths || def.intervalMonths);
  const [result, setResult] = useState(editItem?.result || '');
  const [note, setNote] = useState(editItem?.note || '');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) return setErr('حدد تاريخ الإجراء.');
    setSaving(true);
    try {
      const payload = {
        type: def.id,
        at: fromDateInput(date),
        intervalMonths: interval,
        result: result.trim() || null,
        note: note.trim() || null,
      };

      if (editItem?.id) {
        await updateDoc(doc(db, 'users', uid, 'checkups', editItem.id), payload);
      } else {
        await addDoc(collection(db, 'users', uid, 'checkups'), payload);
      }
      onClose();
    } catch {
      setErr('تعذّر الحفظ. تحقق من الاتصال وصلاحيات Firestore.');
      setSaving(false);
    }
  };

  return (
    <Sheet title={def.label} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Labeled label="تاريخ الإجراء">
          <input
            type="date"
            dir="ltr"
            className={inputCls}
            value={date}
            max={toDateInput(Date.now())}
            onChange={(e) => setDate(e.target.value)}
          />
        </Labeled>
        <div>
          <span className={`mb-1.5 block text-sm font-semibold ${muted}`}>موعد التكرار القادم بعد</span>
          <Chips
            label="موعد التكرار"
            value={interval}
            onChange={setIntervalMonths}
            options={[3, 6, 12, 24].map((m) => ({ value: m, label: m === 12 ? 'سنة' : m === 24 ? 'سنتين' : `${m} أشهر` }))}
          />
          <p className={`mt-1.5 text-xs ${muted}`}>اتبع الفاصل الذي حدده طبيبك إن اختلف عن الافتراضي.</p>
        </div>
        <Labeled label="النتيجة (اختياري)" hint="مثلاً: LDL 95، سليم، eGFR 90…">
          <input className={inputCls} value={result} onChange={(e) => setResult(e.target.value)} maxLength={120} />
        </Labeled>
        <Labeled label="ملاحظة (اختياري)">
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Labeled>
        <ErrorLine text={err} />
        <button type="submit" disabled={saving} className={`${primaryBtn} w-full`}>
          {editItem ? 'حفظ التعديلات' : 'حفظ'}
        </button>
      </form>
    </Sheet>
  );
}

const REMINDER_OPTIONS = [
  { value: 0, label: 'بدون تذكير' },
  { value: 60, label: 'قبل ساعة' },
  { value: 180, label: 'قبل 3 ساعات' },
  { value: 1440, label: 'قبل يوم' },
  { value: 2880, label: 'قبل يومين' },
];

function ApptSheet({
  uid,
  canRemind,
  editItem,
  onScheduleReminder,
  onClose,
}: {
  uid: string;
  canRemind: boolean;
  editItem?: Appointment;
  onScheduleReminder?: (id: string, title: string, at: Date) => void;
  onClose: () => void;
}) {
  const [doctor, setDoctor] = useState(editItem?.doctor || '');
  const [specialty, setSpecialty] = useState(editItem?.specialty || '');
  const [place, setPlace] = useState(editItem?.place || '');
  const [when, setWhen] = useState(toLocalInput(editItem?.at || (Date.now() + DAY_MS)));
  const [note, setNote] = useState(editItem?.note || '');
  const [remind, setRemind] = useState(1440);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctor.trim()) return setErr('أدخل اسم الطبيب أو المركز.');
    const at = new Date(when).getTime();
    if (!Number.isFinite(at)) return setErr('حدد تاريخ الموعد ووقته.');
    setSaving(true);
    try {
      const payload = {
        doctor: doctor.trim(),
        specialty: specialty.trim() || null,
        place: place.trim() || null,
        at,
        note: note.trim() || null,
        done: editItem ? editItem.done : false,
      };

      let refId = editItem?.id;
      if (editItem?.id) {
        await updateDoc(doc(db, 'users', uid, 'appointments', editItem.id), payload);
      } else {
        const ref = await addDoc(collection(db, 'users', uid, 'appointments'), payload);
        refId = ref.id;
      }

      const remindAt = at - remind * 60_000;
      if (canRemind && remind > 0 && remindAt > Date.now() && refId) {
        onScheduleReminder?.(refId, `موعد طبي: ${doctor.trim()}`, new Date(remindAt));
      }
      onClose();
    } catch {
      setErr('تعذّر الحفظ. تحقق من الاتصال وصلاحيات Firestore.');
      setSaving(false);
    }
  };

  return (
    <Sheet title={editItem ? "تعديل الموعد" : "بطاقة موعد طبي"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Labeled label="اسم الطبيب أو المركز">
          <input className={inputCls} autoFocus value={doctor} onChange={(e) => setDoctor(e.target.value)} maxLength={80} />
        </Labeled>
        <Labeled label="التخصص (اختياري)" hint="غدد صماء، عيون، كلى، قدم سكري، تغذية…">
          <input className={inputCls} value={specialty} onChange={(e) => setSpecialty(e.target.value)} maxLength={60} />
        </Labeled>
        <Labeled label="المكان (اختياري)">
          <input className={inputCls} value={place} onChange={(e) => setPlace(e.target.value)} maxLength={100} />
        </Labeled>
        <Labeled label="التاريخ والوقت">
          <input type="datetime-local" dir="ltr" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} />
        </Labeled>
        <Labeled label="ملاحظات (اختياري)" hint="مثلاً: أحضر دفتر القياسات ونتائج التحاليل.">
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Labeled>
        {canRemind && !editItem && (
          <div>
            <span className={`mb-1.5 block text-sm font-semibold ${muted}`}>تذكير بصوت</span>
            <Chips label="التذكير" value={remind} onChange={setRemind} options={REMINDER_OPTIONS} />
          </div>
        )}
        <ErrorLine text={err} />
        <button type="submit" disabled={saving} className={`${primaryBtn} w-full`}>
          {editItem ? 'حفظ التعديلات' : 'حفظ الموعد'}
        </button>
      </form>
    </Sheet>
  );
}

function SettingsSheet({ uid, settings, onClose }: { uid: string; settings: DiabetesSettings; onClose: () => void }) {
  const save = (patch: Partial<DiabetesSettings>) =>
    setDoc(doc(db, 'users', uid, 'settings', 'diabetes'), patch, { merge: true }).catch((e) =>
      console.error('[diabetes] settings', e),
    );

  return (
    <Sheet title="إعداداتي" onClose={onClose}>
      <div>
        <span className={`mb-1.5 block text-sm font-semibold ${muted}`}>وحدة قياس السكر</span>
        <Chips
          label="وحدة القياس"
          value={settings.unit}
          onChange={(unit) => save({ unit })}
          options={UNITS.map((u) => ({ value: u, label: u }))}
        />
        <p className={`mt-1.5 text-xs ${muted}`}>
          مختبرات كثيرة تكتب النتيجة بـ g/L (مثلاً 1.10 g/L = 110 mg/dL). تُحفظ القياسات داخلياً بـ mg/dL وتتحول تلقائياً.
        </p>
      </div>
      <div>
        <span className={`mb-1.5 block text-sm font-semibold ${muted}`}>نوع السكري</span>
        <Chips
          label="نوع السكري"
          value={settings.type}
          onChange={(type) => save({ type })}
          options={[
            { value: 'type1', label: 'النوع 1' },
            { value: 'type2', label: 'النوع 2' },
            { value: 'other', label: 'آخر' },
          ]}
        />
      </div>
      <div>
        <span className={`mb-1.5 block text-sm font-semibold ${muted}`}>هدف السكر التراكمي (A1C)</span>
        <Chips
          label="هدف A1C"
          value={settings.a1cTarget}
          onChange={(a1cTarget) => save({ a1cTarget })}
          options={A1C_TARGETS.map((t) => ({ value: t, label: `أقل من ${t}%` }))}
        />
        <p className={`mt-1.5 text-xs ${muted}`}>
          الهدف العام لمعظم البالغين غير الحوامل أقل من 7%. قد يضع الطبيب هدفاً أخف (مثل أقل من 8%) عند خطر الهبوط أو كبر السن أو وجود مضاعفات. اتفق عليه مع طبيبك.
        </p>
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/*  Small display pieces                                                       */
/* -------------------------------------------------------------------------- */

function Stat({ label, value, sub, tone = 'neutral' }: { label: string; value: React.ReactNode; sub?: string; tone?: Tone | 'neutral' }) {
  return (
    <div className={`rounded-2xl p-3.5 ${TONE[tone]}`}>
      <div className="text-xs font-bold opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-extrabold leading-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs opacity-80">{sub}</div>}
    </div>
  );
}

const DUE_BADGE: Record<DueState, { tone: Tone | 'neutral'; label: string }> = {
  never: { tone: 'neutral', label: 'لم يُسجَّل بعد' },
  overdue: { tone: 'red', label: 'متأخر' },
  soon: { tone: 'amber', label: 'قريباً' },
  ok: { tone: 'green', label: 'في موعده' },
};

function relativeDays(ms: number, now: number): string {
  const days = Math.ceil((ms - now) / DAY_MS);
  if (days <= 0) return 'اليوم';
  if (days === 1) return 'غداً';
  return `بعد ${days} يوماً`;
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

type Tab = 'overview' | 'daily' | 'labs' | 'appts';
const TABS: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: 'overview', label: 'نظرة عامة', icon: Activity },
  { id: 'daily', label: 'السكر اليومي', icon: Droplet },
  { id: 'labs', label: 'التحاليل', icon: FlaskConical },
  { id: 'appts', label: 'المواعيد', icon: CalendarClock },
];

type SheetState =
  | null
  | { kind: 'glucose'; editItem?: Reading }
  | { kind: 'a1c'; editItem?: A1cRecord }
  | { kind: 'checkup'; def: CheckupDef; editItem?: CheckupRecord }
  | { kind: 'appt'; editItem?: Appointment }
  | { kind: 'settings' };

interface DiabetesProps {
  onScheduleReminder?: (id: string, title: string, at: Date) => void;
  onCancelReminder?: (id: string) => void;
}

export default function Diabetes({ onScheduleReminder, onCancelReminder }: DiabetesProps) {
  const uid = useUid();
  const settings = useSettings(uid);
  const readings = useCollection<Reading>(uid, 'glucose', 'at');
  const a1cs = useCollection<A1cRecord>(uid, 'a1c', 'at');
  const checkups = useCollection<CheckupRecord>(uid, 'checkups', 'at');
  const appts = useCollection<Appointment>(uid, 'appointments', 'at');

  const [tab, setTab] = useState<Tab>('overview');
  const [sheet, setSheet] = useState<SheetState>(null);
  const [days, setDays] = useState(30);
  const [showAll, setShowAll] = useState(false);
  const [alertInfo, setAlertInfo] = useState<{ c: Classification; mgdl: number } | null>(null);

  const unit = settings.unit;
  const now = Date.now();

  const ranged = useMemo(() => inLastDays(readings, days, now), [readings, days, now]);
  const summary = useMemo(() => summarize(ranged), [ranged]);
  const lowCount = ranged.filter((r) => r.mgdl < RANGE_LOW).length;

  const latestByType = useMemo(() => {
    const m = new Map<CheckupId, CheckupRecord>();
    for (const c of checkups) if (!m.has(c.type)) m.set(c.type, c);
    return m;
  }, [checkups]);

  const lastA1c = a1cs[0];
  const a1cInfo = lastA1c ? a1cStatus(lastA1c.a1c, lastA1c.at, settings.a1cTarget) : null;
  const a1cDue = lastA1c && a1cInfo ? dueState(lastA1c.at, a1cInfo.intervalMonths, now) : null;

  const checkupRows = CHECKUPS.map((def) => {
    const last = latestByType.get(def.id);
    const interval = last?.intervalMonths ?? def.intervalMonths;
    return { def, last, due: dueState(last?.at, interval, now) };
  });
  const attention = checkupRows.filter((r) => (r.due.state === 'overdue' || r.due.state === 'soon') && (!r.def.optional || r.last));
  const neverDone = checkupRows.filter((r) => r.due.state === 'never' && !r.def.optional);

  const upcoming = appts.filter((a) => !a.done && a.at >= now).sort((a, b) => a.at - b.at);
  const past = appts.filter((a) => a.done || a.at < now);

  const latest = readings[0];
  const latestClass = latest ? classify(latest.mgdl, latest.context) : null;
  const freshAdvice =
    latest && latestClass?.advice && now - latest.at < 3 * 60 * 60 * 1000 ? { c: latestClass, mgdl: latest.mgdl } : null;
  const banner = alertInfo?.c.advice ? alertInfo : freshAdvice;

  const close = () => setSheet(null);

  const remove = async (name: string, id: string, question: string) => {
    if (!uid || !window.confirm(question)) return;
    await deleteDoc(doc(db, 'users', uid, name, id));
  };

  const markDone = async (a: Appointment) => {
    if (!uid) return;
    await updateDoc(doc(db, 'users', uid, 'appointments', a.id), { done: true });
    onCancelReminder?.(a.id);
  };

  if (!uid) {
    return (
      <div dir="rtl" className={`p-8 text-center ${muted} flex-1`}>
        سجّل الدخول لعرض صفحة السكري.
      </div>
    );
  }

  return (
    <div dir="rtl" className="flex-1 w-full bg-[#F7F7FC] pb-10 dark:bg-[#10131C]">
      <div className="mx-auto w-full max-w-[560px] px-4 pt-5">
        {/* Header */}
        <header className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className={`font-['Aref_Ruqaa'] text-3xl font-bold leading-snug ${txt}`}>متابعة السكري</h1>
            <p className={`text-sm ${muted}`}>قياساتك، تحاليلك، ومواعيدك في مكان واحد</p>
          </div>
          <button
            type="button"
            onClick={() => setSheet({ kind: 'settings' })}
            aria-label="الإعدادات"
            className={`rounded-full bg-white p-3 ${muted} shadow-sm dark:bg-[#181C27] ${press} ${focusRing}`}
          >
            <SettingsIcon size={22} />
          </button>
        </header>

        {/* Treatment advice banner */}
        {banner && banner.c.advice && (
          <div
            role="alert"
            className={`mb-4 rounded-[24px] p-4 ${TONE[banner.c.tone]}`}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-extrabold">
                <AlertTriangle size={20} aria-hidden />
                <span>
                  {banner.c.label}: <Glucose mgdl={banner.mgdl} unit={unit} />
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAlertInfo(null)}
                aria-label="إخفاء"
                className={`rounded-full p-1 ${focusRing}`}
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm font-semibold leading-relaxed">{banner.c.advice}</p>
          </div>
        )}

        {/* Tabs */}
        <nav role="tablist" aria-label="أقسام الصفحة" className="sticky top-0 z-10 -mx-4 mb-4 flex gap-2 overflow-x-auto bg-[#F7F7FC]/95 px-4 py-2 backdrop-blur dark:bg-[#10131C]/95">
          {TABS.map(({ id, label, icon: Icon }) => {
            const on = tab === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={on}
                type="button"
                onClick={() => setTab(id)}
                className={[
                  'flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold',
                  on
                    ? 'bg-[#3B3FB8] text-white dark:bg-[#B9BEFF] dark:text-[#14176B]'
                    : `bg-white ${txt} dark:bg-[#181C27]`,
                  press,
                  focusRing,
                ].join(' ')}
              >
                <Icon size={18} aria-hidden />
                {label}
              </button>
            );
          })}
        </nav>

        {/* ------------------------------ Overview ------------------------------ */}
        {tab === 'overview' && (
          <div className="space-y-4">
            <section className={card}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className={`text-lg font-extrabold ${txt}`}>ملخص القياسات</h2>
                <Chips
                  label="الفترة"
                  value={days}
                  onChange={setDays}
                  options={[7, 14, 30, 90].map((d) => ({ value: d, label: `${d} يوماً` }))}
                />
              </div>

              {summary ? (
                <>
                  <GlucoseChart readings={ranged} days={days} unit={unit} />
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    <Stat label="المتوسط" value={<Glucose mgdl={summary.avg} unit={unit} />} sub={`${summary.count} قياساً`} />
                    <Stat
                      label="ضمن 70–180"
                      value={`${Math.round(summary.pctInRange)}%`}
                      tone={summary.pctInRange >= 70 ? 'green' : 'amber'}
                      sub="نسبة القياسات"
                    />
                    <Stat
                      label="أقل من 70"
                      value={`${Math.round(summary.pctLow)}%`}
                      tone={summary.pctLow === 0 ? 'green' : 'red'}
                      sub={summary.pctVeryLow > 0 ? `منها دون 54: ${Math.round(summary.pctVeryLow)}%` : undefined}
                    />
                    <Stat
                      label="أعلى من 180"
                      value={`${Math.round(summary.pctHigh)}%`}
                      tone={summary.pctHigh <= 25 ? 'green' : 'amber'}
                    />
                  </div>
                  <p className={`mt-3 text-xs leading-relaxed ${muted}`}>
                    {summary.count >= 10 ? (
                      <>
                        السكر التراكمي المقدَّر من المتوسط ≈ <b dir="ltr">{summary.estA1c.toFixed(1)}%</b>. تقدير تقريبي من قياسات متفرقة ولا يغني عن تحليل المختبر.
                      </>
                    ) : (
                      'سجّل 10 قياسات أو أكثر ليظهر تقدير السكر التراكمي.'
                    )}
                    {' '}نسبة «ضمن المدى» هنا محسوبة من قياساتك المسجلة، وليست «الوقت في المدى» الذي يقيسه جهاز المراقبة المستمرة.
                  </p>
                  {lowCount >= 2 && (
                    <p className={`mt-3 rounded-2xl p-3 text-sm font-semibold ${TONE.amber}`}>
                      تكرر الانخفاض دون 70 ({lowCount} مرات في هذه الفترة). أبلغ طبيبك فقد يحتاج العلاج إلى تعديل.
                    </p>
                  )}
                </>
              ) : (
                <p className={`py-6 text-center text-sm ${muted}`}>لا قياسات في هذه الفترة. سجّل أول قياس من تبويب «السكر اليومي».</p>
              )}
            </section>

            <section className={card}>
              <h2 className={`mb-3 text-lg font-extrabold ${txt}`}>ما يحتاج انتباهك</h2>
              <ul className="space-y-2.5">
                {a1cDue && (a1cDue.state === 'overdue' || a1cDue.state === 'soon') && (
                  <li className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-semibold ${txt}`}>تحليل السكر التراكمي (A1C)</span>
                    <Badge tone={DUE_BADGE[a1cDue.state].tone}>{DUE_BADGE[a1cDue.state].label}</Badge>
                  </li>
                )}
                {!lastA1c && (
                  <li className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-semibold ${txt}`}>تحليل السكر التراكمي (A1C)</span>
                    <Badge tone="neutral">لم يُسجَّل بعد</Badge>
                  </li>
                )}
                {attention.map(({ def, due }) => (
                  <li key={def.id} className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-semibold ${txt}`}>{def.label}</span>
                    <Badge tone={DUE_BADGE[due.state].tone}>{DUE_BADGE[due.state].label}</Badge>
                  </li>
                ))}
                {neverDone.length > 0 && (
                  <li className={`text-sm ${muted}`}>
                    لم تسجّل بعد: {neverDone.map((r) => r.def.label.split(' (')[0].split(':')[0]).join('، ')}.
                  </li>
                )}
                {upcoming[0] && (
                  <li className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-semibold ${txt}`}>موعدك القادم: {upcoming[0].doctor}</span>
                    <Badge tone="neutral">{relativeDays(upcoming[0].at, now)}</Badge>
                  </li>
                )}
              </ul>
            </section>

            <section className={`${card} text-sm leading-relaxed ${muted}`}>
              <h2 className={`mb-2 flex items-center gap-2 text-lg font-extrabold ${txt}`}>
                <Info size={18} aria-hidden /> أهدافك العامة
              </h2>
              <ul className="list-disc space-y-1 pr-5">
                <li>قبل الوجبات: 80–130 mg/dL (≈ 0.80–1.30 g/L)</li>
                <li>بعد الوجبة بساعة إلى ساعتين: أقل من 180 mg/dL</li>
                <li>السكر التراكمي: أقل من {settings.a1cTarget}% (حسب هدفك)</li>
                <li>ضغط الدم: أقل من 130/80 mmHg</li>
              </ul>
            </section>
          </div>
        )}

        {/* -------------------------------- Daily -------------------------------- */}
        {tab === 'daily' && (
          <div className="space-y-4">
            <button type="button" onClick={() => setSheet({ kind: 'glucose' })} className={`${primaryBtn} w-full`}>
              <Plus size={20} aria-hidden /> تسجيل قياس
            </button>
            <section className={card}>
              <h2 className={`mb-3 text-lg font-extrabold ${txt}`}>آخر القياسات</h2>
              {readings.length === 0 ? (
                <p className={`py-6 text-center text-sm ${muted}`}>لا قياسات بعد.</p>
              ) : (
                <ul className="divide-y divide-[#767A8C]/20">
                  {(showAll ? readings : readings.slice(0, 20)).map((r) => {
                    const c = classify(r.mgdl, r.context);
                    return (
                      <li key={r.id} className="flex items-center gap-3 py-3">
                        <div className="min-w-[88px]">
                          <div className={`text-xl font-extrabold ${txt}`}>
                            <Glucose mgdl={r.mgdl} unit={unit} />
                          </div>
                          <Badge tone={c.tone}>{c.label}</Badge>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className={`text-sm font-semibold ${txt}`}>{CONTEXT_LABEL[r.context]}</div>
                          <div className={`text-xs ${muted}`}>{fmtDateTime(r.at)}</div>
                          {r.note && <div className={`truncate text-xs ${muted}`}>{r.note}</div>}
                        </div>
                        <button
                          type="button"
                          aria-label="تعديل القياس"
                          onClick={() => setSheet({ kind: 'glucose', editItem: r })}
                          className={`rounded-full p-2 ${muted} hover:bg-black/5 dark:hover:bg-white/10 ${focusRing}`}
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          type="button"
                          aria-label="حذف القياس"
                          onClick={() => remove('glucose', r.id, 'حذف هذا القياس؟')}
                          className={`rounded-full p-2 ${muted} hover:bg-black/5 dark:hover:bg-white/10 ${focusRing}`}
                        >
                          <Trash2 size={18} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {readings.length > 20 && (
                <button type="button" onClick={() => setShowAll((s) => !s)} className={`${tonalBtn} mt-3 w-full`}>
                  {showAll ? 'عرض الأحدث فقط' : `عرض الكل (${readings.length})`}
                </button>
              )}
            </section>
          </div>
        )}

        {/* --------------------------------- Labs --------------------------------- */}
        {tab === 'labs' && (
          <div className="space-y-4">
            <section className={card}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className={`text-lg font-extrabold ${txt}`}>السكر التراكمي (A1C)</h2>
                <button type="button" onClick={() => setSheet({ kind: 'a1c' })} className={tonalBtn}>
                  <Plus size={16} aria-hidden /> تسجيل
                </button>
              </div>

              {lastA1c && a1cInfo && a1cDue ? (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Stat
                      label="آخر نتيجة"
                      value={<span dir="ltr">{lastA1c.a1c.toFixed(1)}%</span>}
                      tone={a1cInfo.atGoal ? 'green' : 'amber'}
                      sub={`${fmtDate(lastA1c.at)} · الهدف أقل من ${settings.a1cTarget}%`}
                    />
                    <Stat
                      label="التحليل القادم"
                      value={<span className="text-lg">{fmtDate(a1cInfo.nextDueMs)}</span>}
                      tone={a1cDue.state === 'overdue' ? 'red' : a1cDue.state === 'soon' ? 'amber' : 'neutral'}
                      sub={a1cInfo.atGoal ? 'مرتان في السنة على الأقل' : 'كل 3 أشهر حتى بلوغ الهدف'}
                    />
                  </div>
                  <p className={`mt-3 text-xs ${muted}`} dir="rtl">
                    يعادل متوسط سكر ≈ <b dir="ltr">{formatGlucose(a1cToEag(lastA1c.a1c), unit, true)}</b> أو{' '}
                    <b dir="ltr">{Math.round(a1cToMmolMol(lastA1c.a1c))} mmol/mol</b>.
                  </p>
                  {a1cs.length > 1 && (
                    <ul className="mt-3 divide-y divide-[#767A8C]/20">
                      {a1cs.slice(0, 6).map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                          <span className={`text-sm ${muted}`}>{fmtDate(r.at)}</span>
                          <span className="flex items-center gap-2">
                            <b dir="ltr" className={txt}>
                              {r.a1c.toFixed(1)}%
                            </b>
                            <button
                              type="button"
                              aria-label="تعديل النتيجة"
                              onClick={() => setSheet({ kind: 'a1c', editItem: r })}
                              className={`rounded-full p-1.5 ${muted} ${focusRing}`}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              aria-label="حذف النتيجة"
                              onClick={() => remove('a1c', r.id, 'حذف هذه النتيجة؟')}
                              className={`rounded-full p-1.5 ${muted} ${focusRing}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className={`py-4 text-center text-sm ${muted}`}>لم تسجّل نتيجة بعد.</p>
              )}
            </section>

            <section className={card}>
              <h2 className={`mb-1 text-lg font-extrabold ${txt}`}>التحاليل والفحوص الدورية</h2>
              <p className={`mb-3 text-xs ${muted}`}>الفواصل الافتراضية وفق معايير الجمعية الأمريكية للسكري. يغلب عليها ما يحدده طبيبك.</p>
              <ul className="space-y-3">
                {checkupRows.map(({ def, last, due }) => (
                  <li key={def.id} className="rounded-2xl bg-[#F7F7FC] p-3.5 dark:bg-[#10131C]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className={`font-bold ${txt}`}>
                          {def.label}
                          {def.optional && <span className={`mr-1 text-xs font-normal ${muted}`}>(حسب الحالة)</span>}
                        </div>
                        <div className={`mt-0.5 text-xs ${muted}`}>
                          {last ? `آخر مرة: ${fmtDate(last.at)}` : 'لم يُسجَّل بعد'}
                          {due.dueMs !== undefined && ` · القادم: ${fmtDate(due.dueMs)}`}
                        </div>
                        {last?.result && <div className={`mt-0.5 text-xs font-semibold ${txt}`}>النتيجة: {last.result}</div>}
                      </div>
                      <Badge tone={DUE_BADGE[due.state].tone}>{DUE_BADGE[due.state].label}</Badge>
                    </div>
                    <details className="mt-2">
                      <summary className={`cursor-pointer text-xs font-bold text-[#3B3FB8] dark:text-[#B9BEFF] ${focusRing}`}>لماذا هذا الفحص؟</summary>
                      <p className={`mt-1.5 text-xs leading-relaxed ${muted}`}>{def.why}</p>
                    </details>
                    <div className="mt-2.5 flex items-center gap-2">
                      <button type="button" onClick={() => setSheet({ kind: 'checkup', def })} className={tonalBtn}>
                        <Check size={16} aria-hidden /> سجّلت إجراءه
                      </button>
                      {last && (
                        <>
                          <button
                            type="button"
                            aria-label="تعديل آخر تسجيل"
                            onClick={() => setSheet({ kind: 'checkup', def, editItem: last })}
                            className={`rounded-full p-2 ${muted} ${focusRing}`}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label="حذف آخر تسجيل"
                            onClick={() => remove('checkups', last.id, 'حذف آخر تسجيل لهذا الفحص؟')}
                            className={`rounded-full p-2 ${muted} ${focusRing}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {/* ------------------------------ Appointments ----------------------------- */}
        {tab === 'appts' && (
          <div className="space-y-4">
            <button type="button" onClick={() => setSheet({ kind: 'appt' })} className={`${primaryBtn} w-full`}>
              <Plus size={20} aria-hidden /> إضافة موعد طبي
            </button>

            <section aria-label="المواعيد القادمة" className="space-y-3">
              {upcoming.length === 0 && (
                <p className={`${card} py-8 text-center text-sm ${muted}`}>لا مواعيد قادمة.</p>
              )}
              {upcoming.map((a) => (
                <ApptCard 
                  key={a.id} 
                  a={a} 
                  now={now} 
                  onDone={() => markDone(a)} 
                  onEdit={() => setSheet({ kind: 'appt', editItem: a })}
                  onDelete={() => remove('appointments', a.id, 'حذف هذا الموعد؟').then(() => onCancelReminder?.(a.id))} 
                />
              ))}
            </section>

            {past.length > 0 && (
              <details className={card}>
                <summary className={`cursor-pointer text-base font-extrabold ${txt} ${focusRing}`}>المواعيد السابقة ({past.length})</summary>
                <div className="mt-3 space-y-3">
                  {past.map((a) => (
                    <ApptCard 
                      key={a.id} 
                      a={a} 
                      now={now} 
                      past 
                      onEdit={() => setSheet({ kind: 'appt', editItem: a })}
                      onDelete={() => remove('appointments', a.id, 'حذف هذا الموعد؟')} 
                      onDone={() => markDone(a)} 
                    />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        <p className={`mt-6 rounded-2xl p-3 text-xs leading-relaxed ${TONE.neutral}`}>
          هذه الأداة للمتابعة الشخصية وليست بديلاً عن الطبيب. الأهداف المذكورة عامة للبالغين غير الحوامل وفق معايير الجمعية الأمريكية للسكري (ADA 2026)، ويحدد طبيبك أهدافك. عند الهبوط الشديد أو أعراض الارتفاع الخطيرة اطلب الرعاية الطبية فوراً.
        </p>
      </div>

      {/* Sheets */}
      {sheet?.kind === 'glucose' && (
        <GlucoseSheet uid={uid} unit={unit} editItem={sheet.editItem} onClose={close} onSaved={(c, mgdl) => setAlertInfo({ c, mgdl })} />
      )}
      {sheet?.kind === 'a1c' && <A1cSheet uid={uid} editItem={sheet.editItem} onClose={close} />}
      {sheet?.kind === 'checkup' && <CheckupSheet uid={uid} def={sheet.def} editItem={sheet.editItem} onClose={close} />}
      {sheet?.kind === 'appt' && (
        <ApptSheet uid={uid} canRemind={!!onScheduleReminder} editItem={sheet.editItem} onScheduleReminder={onScheduleReminder} onClose={close} />
      )}
      {sheet?.kind === 'settings' && <SettingsSheet uid={uid} settings={settings} onClose={close} />}
    </div>
  );
}

function ApptCard({
  a,
  now,
  past = false,
  onDone,
  onEdit,
  onDelete,
}: {
  a: Appointment;
  now: number;
  past?: boolean;
  onDone: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const d = new Date(a.at);
  const missed = !a.done && a.at < now;
  return (
    <article className={`${card} flex gap-3.5 ${past ? 'opacity-90' : ''}`}>
      <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-[#E0E1FF] text-[#0A0C5E] dark:bg-[#2A2F8C] dark:text-[#E0E1FF]">
        <span className="text-2xl font-extrabold leading-none">{d.toLocaleDateString(LOCALE, { day: 'numeric' })}</span>
        <span className="mt-1 text-xs font-bold">{d.toLocaleDateString(LOCALE, { month: 'short' })}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className={`flex items-center gap-1.5 font-extrabold ${txt}`}>
            <Stethoscope size={16} aria-hidden className="shrink-0" />
            <span className="truncate">{a.doctor}</span>
          </h3>
          {a.done ? (
            <Badge tone="green">
              <CheckCircle2 size={12} className="ml-1" aria-hidden /> تم
            </Badge>
          ) : missed ? (
            <Badge tone="amber">مضى موعده</Badge>
          ) : (
            <Badge tone="neutral">{relativeDays(a.at, now)}</Badge>
          )}
        </div>
        {a.specialty && <div className={`text-sm ${muted}`}>{a.specialty}</div>}
        <div className={`mt-1 text-sm font-semibold ${txt}`}>
          {d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}
        </div>
        {a.place && (
          <div className={`mt-0.5 flex items-center gap-1 text-xs ${muted}`}>
            <MapPin size={13} aria-hidden /> {a.place}
          </div>
        )}
        {a.note && <p className={`mt-1 text-xs ${muted}`}>{a.note}</p>}
        <div className="mt-2.5 flex items-center gap-2">
          {!a.done && (
            <button type="button" onClick={onDone} className={tonalBtn}>
              <Check size={16} aria-hidden /> تمّ الموعد
            </button>
          )}
          <button
            type="button"
            aria-label="تعديل الموعد"
            onClick={onEdit}
            className={`rounded-full p-2 ${muted} hover:bg-black/5 dark:hover:bg-white/10 ${focusRing}`}
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            aria-label="حذف الموعد"
            onClick={onDelete}
            className={`rounded-full p-2 ${muted} hover:bg-black/5 dark:hover:bg-white/10 ${focusRing}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}