/**
 * Diabetes rules: pure functions, no UI and no Firebase.
 * Targets follow the ADA Standards of Care in Diabetes (2026) for non-pregnant
 * adults. They are general defaults — the user's doctor sets personal targets.
 */

/* -------------------------------------------------------------------------- */
/*  Units                                                                      */
/* -------------------------------------------------------------------------- */

export type Unit = 'mg/dL' | 'mmol/L' | 'g/L';
export const UNITS: Unit[] = ['mg/dL', 'mmol/L', 'g/L'];

/** Glucose molar mass 180.16 g/mol → 1 mmol/L = 18.016 mg/dL. */
export const MGDL_PER_MMOL = 18.016;

/** Everything is stored in mg/dL and converted only for display/input. */
export function toMgdl(value: number, unit: Unit): number {
  switch (unit) {
    case 'mg/dL':
      return value;
    case 'mmol/L':
      return value * MGDL_PER_MMOL;
    case 'g/L':
      return value * 100;
  }
}

export function fromMgdl(mgdl: number, unit: Unit): number {
  switch (unit) {
    case 'mg/dL':
      return mgdl;
    case 'mmol/L':
      return mgdl / MGDL_PER_MMOL;
    case 'g/L':
      return mgdl / 100;
  }
}

export function formatGlucose(mgdl: number, unit: Unit, withUnit = false): string {
  const v = fromMgdl(mgdl, unit);
  const text = unit === 'mg/dL' ? Math.round(v).toString() : unit === 'mmol/L' ? v.toFixed(1) : v.toFixed(2);
  return withUnit ? `${text} ${unit}` : text;
}

/** Parses "1,26" or "126" typed by the user. Returns NaN when invalid. */
export function parseNumber(input: string): number {
  return Number(input.trim().replace(',', '.').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)));
}

/** Meters read roughly 20–600 mg/dL. Anything outside is almost surely a unit mix-up. */
export const MIN_PLAUSIBLE_MGDL = 20;
export const MAX_PLAUSIBLE_MGDL = 800;
export const isPlausible = (mgdl: number) =>
  Number.isFinite(mgdl) && mgdl >= MIN_PLAUSIBLE_MGDL && mgdl <= MAX_PLAUSIBLE_MGDL;

/* -------------------------------------------------------------------------- */
/*  Reading context + classification                                           */
/* -------------------------------------------------------------------------- */

export type Context = 'fasting' | 'before_meal' | 'after_meal' | 'bedtime' | 'random';

export const CONTEXTS: Context[] = ['fasting', 'before_meal', 'after_meal', 'bedtime', 'random'];

export const CONTEXT_LABEL: Record<Context, string> = {
  fasting: 'صائم (صباحاً)',
  before_meal: 'قبل الوجبة',
  after_meal: 'بعد الوجبة (1–2 ساعة)',
  bedtime: 'قبل النوم',
  random: 'في أي وقت',
};

/** ADA: pre-meal 80–130; peak post-meal <180. Other times use the general 70–180 band. */
export const CONTEXT_TARGET: Record<Context, { min: number; max: number; text: string }> = {
  fasting: { min: 80, max: 130, text: '80–130 mg/dL' },
  before_meal: { min: 80, max: 130, text: '80–130 mg/dL' },
  after_meal: { min: 70, max: 179, text: 'أقل من 180 mg/dL' },
  bedtime: { min: 70, max: 180, text: '70–180 mg/dL' },
  random: { min: 70, max: 180, text: '70–180 mg/dL' },
};

export const RANGE_LOW = 70; // below = hypoglycemia (level 1)
export const RANGE_VERY_LOW = 54; // below = clinically significant hypoglycemia (level 2)
export const RANGE_HIGH = 180; // above = out of general range
export const RANGE_VERY_HIGH = 250; // above = needs attention

export type Level = 'hypo2' | 'hypo1' | 'below' | 'in' | 'above' | 'high';
export type Tone = 'red' | 'amber' | 'green';

export interface Classification {
  level: Level;
  tone: Tone;
  label: string;
  /** Shown to the user right after saving a reading in this level (if any). */
  advice?: string;
}

const HYPO_TREAT =
  'تناول 15 غ من السكريات السريعة فوراً (نصف كوب ≈120 مل عصير، أو ملعقة كبيرة سكر/عسل، أو 4 أقراص جلوكوز)، ثم أعد القياس بعد 15 دقيقة وكرر إن بقي أقل من 70. بعد الارتفاع تناول وجبة خفيفة.';

export function classify(mgdl: number, context: Context): Classification {
  if (mgdl < RANGE_VERY_LOW) {
    return {
      level: 'hypo2',
      tone: 'red',
      label: 'انخفاض شديد',
      advice: `${HYPO_TREAT} إن شعرت بتشوش أو إغماء أو لم يتحسن القياس فاطلب الإسعاف فوراً.`,
    };
  }
  if (mgdl < RANGE_LOW) {
    return { level: 'hypo1', tone: 'red', label: 'انخفاض', advice: HYPO_TREAT };
  }
  const t = CONTEXT_TARGET[context];
  if (mgdl < t.min) return { level: 'below', tone: 'amber', label: 'أقل من الهدف' };
  if (mgdl > RANGE_VERY_HIGH) {
    return {
      level: 'high',
      tone: 'red',
      label: 'مرتفع جداً',
      advice:
        'اشرب الماء وراجع خطة علاجك. إن ظهرت أعراض (عطش شديد، قيء، ألم بطن، تنفس سريع، نعاس شديد) أو كانت الكيتونات موجبة فاطلب رعاية طبية عاجلة. وإن تكرر الارتفاع فتواصل مع طبيبك.',
    };
  }
  if (mgdl > t.max) return { level: 'above', tone: 'amber', label: 'أعلى من الهدف' };
  return { level: 'in', tone: 'green', label: 'ضمن الهدف' };
}

/* -------------------------------------------------------------------------- */
/*  Statistics                                                                 */
/* -------------------------------------------------------------------------- */

export interface Reading {
  id: string;
  mgdl: number;
  context: Context;
  at: number; // epoch ms
  note?: string;
}

export interface Summary {
  count: number;
  avg: number;
  min: number;
  max: number;
  /** Share of readings between 70 and 180 mg/dL, 0–100. */
  pctInRange: number;
  pctLow: number; // < 70
  pctVeryLow: number; // < 54
  pctHigh: number; // > 180
  /** Rough A1C implied by the average. Finger-stick data only approximates it. */
  estA1c: number;
}

export function summarize(readings: Reading[]): Summary | null {
  if (readings.length === 0) return null;
  const values = readings.map((r) => r.mgdl);
  const n = values.length;
  const avg = values.reduce((a, b) => a + b, 0) / n;
  const pct = (pred: (v: number) => boolean) => (values.filter(pred).length / n) * 100;
  return {
    count: n,
    avg,
    min: Math.min(...values),
    max: Math.max(...values),
    pctInRange: pct((v) => v >= RANGE_LOW && v <= RANGE_HIGH),
    pctLow: pct((v) => v < RANGE_LOW),
    pctVeryLow: pct((v) => v < RANGE_VERY_LOW),
    pctHigh: pct((v) => v > RANGE_HIGH),
    estA1c: eagToA1c(avg),
  };
}

export const DAY_MS = 24 * 60 * 60 * 1000;
export const inLastDays = (readings: Reading[], days: number, now = Date.now()) =>
  readings.filter((r) => r.at >= now - days * DAY_MS && r.at <= now + 60_000);

/* -------------------------------------------------------------------------- */
/*  A1C                                                                        */
/* -------------------------------------------------------------------------- */

/** ADA/ADAG: eAG (mg/dL) = 28.7 × A1C − 46.7 */
export const a1cToEag = (a1c: number) => 28.7 * a1c - 46.7;
export const eagToA1c = (eag: number) => (eag + 46.7) / 28.7;
/** NGSP % → IFCC mmol/mol */
export const a1cToMmolMol = (a1c: number) => (a1c - 2.15) * 10.929;

export const DEFAULT_A1C_TARGET = 7;
export const A1C_TARGETS = [6.5, 7, 7.5, 8];

export interface A1cStatus {
  atGoal: boolean;
  nextDueMs: number;
  intervalMonths: 3 | 6;
}

/** ADA: at least twice a year when at goal and stable; quarterly when not at goal. */
export function a1cStatus(lastA1c: number, lastAtMs: number, target: number): A1cStatus {
  const atGoal = lastA1c < target; // ADA phrases targets as "<7%", "<8%"
  const months: 3 | 6 = atGoal ? 6 : 3;
  return { atGoal, nextDueMs: addMonths(lastAtMs, months), intervalMonths: months };
}

/* -------------------------------------------------------------------------- */
/*  Periodic checkups                                                          */
/* -------------------------------------------------------------------------- */

export type CheckupId = 'eye' | 'kidney' | 'foot' | 'lipids' | 'dental' | 'flu' | 'b12';

export interface CheckupDef {
  id: CheckupId;
  label: string;
  intervalMonths: number;
  /** What it detects and when the interval can differ. */
  why: string;
  optional?: boolean;
}

export const CHECKUPS: CheckupDef[] = [
  {
    id: 'eye',
    label: 'فحص قاع العين (الشبكية)',
    intervalMonths: 12,
    why: 'يكشف اعتلال الشبكية مبكراً. إن كانت العين سليمة في فحوص سابقة والسكر منضبط فقد يوصي الطبيب بكل 1–2 سنة، ويقصر الفاصل عند وجود اعتلال.',
  },
  {
    id: 'kidney',
    label: 'الكلى: eGFR + نسبة الألبومين/الكرياتينين (UACR)',
    intervalMonths: 12,
    why: 'مرة سنوياً على الأقل منذ التشخيص في النوع 2، وبعد 5 سنوات من التشخيص في النوع 1. أكثر تكراراً إن وُجد خلل في الكلى.',
  },
  {
    id: 'foot',
    label: 'فحص القدمين والأعصاب',
    intervalMonths: 12,
    why: 'فحص شامل سنوياً (الإحساس، النبض، الجلد). افحص قدميك بنفسك يومياً، وأري طبيبك قدميك في كل زيارة.',
  },
  {
    id: 'lipids',
    label: 'تحليل الدهون (LDL, HDL, الدهون الثلاثية)',
    intervalMonths: 12,
    why: 'لتقدير خطر القلب والشرايين. تُحدَّد وتيرة المتابعة حسب علاجك (الستاتين) وهدف LDL الذي يضعه الطبيب.',
  },
  {
    id: 'dental',
    label: 'فحص الأسنان واللثة',
    intervalMonths: 12,
    why: 'أمراض اللثة والسكري يؤثر كل منهما في الآخر. تقييم شامل سنوياً على الأقل.',
  },
  {
    id: 'flu',
    label: 'لقاح الإنفلونزا',
    intervalMonths: 12,
    why: 'سنوياً قبل الموسم. اسأل طبيبك أيضاً عن لقاحات المكورات الرئوية والكبد B وكورونا.',
  },
  {
    id: 'b12',
    label: 'فيتامين B12 (عند استخدام الميتفورمين)',
    intervalMonths: 12,
    optional: true,
    why: 'يُنصح بقياسه دورياً مع الميتفورمين، خصوصاً عند وجود فقر دم أو تنميل في الأطراف. حسب توجيه الطبيب.',
  },
];

export const CHECKUP_BY_ID = Object.fromEntries(CHECKUPS.map((c) => [c.id, c])) as Record<CheckupId, CheckupDef>;

export type DueState = 'never' | 'overdue' | 'soon' | 'ok';

export interface Due {
  state: DueState;
  dueMs?: number;
}

/** "soon" = due within the next 30 days. */
export function dueState(lastMs: number | undefined, intervalMonths: number, now = Date.now()): Due {
  if (lastMs === undefined) return { state: 'never' };
  const dueMs = addMonths(lastMs, intervalMonths);
  if (dueMs < now) return { state: 'overdue', dueMs };
  if (dueMs - now <= 30 * DAY_MS) return { state: 'soon', dueMs };
  return { state: 'ok', dueMs };
}

export function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}
