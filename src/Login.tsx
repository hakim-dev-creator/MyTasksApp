import { useEffect, useMemo, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import {
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  Fingerprint,
  Loader2,
  Lock,
  Mail,
  type LucideIcon,
} from 'lucide-react';
import { auth } from './lib/firebase';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

/* -------------------------------------------------------------------------- */
/*  Copy + helpers                                                             */
/* -------------------------------------------------------------------------- */

type Mode = 'login' | 'signup' | 'reset';

const COPY: Record<Mode, { title: string; subtitle: string; cta: string }> = {
  login: {
    title: 'مرحباً بعودتك',
    subtitle: 'سجّل الدخول لمتابعة دفتر مهامك',
    cta: 'دخول',
  },
  signup: {
    title: 'إنشاء حساب جديد',
    subtitle: 'ابدأ بتنظيم مهامك وملاحظاتك الآن',
    cta: 'إنشاء الحساب',
  },
  reset: {
    title: 'استعادة كلمة المرور',
    subtitle: 'أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين',
    cta: 'إرسال الرابط',
  },
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function mapAuthError(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
      case 'auth/email-already-in-use':
        return 'البريد الإلكتروني مستخدم بالفعل.';
      case 'auth/weak-password':
        return 'كلمة المرور ضعيفة، يجب أن تكون 6 أحرف على الأقل.';
      case 'auth/invalid-email':
        return 'صيغة البريد الإلكتروني غير صحيحة.';
      case 'auth/too-many-requests':
        return 'محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.';
      case 'auth/network-request-failed':
        return 'تعذّر الاتصال بالشبكة. تحقق من الإنترنت وأعد المحاولة.';
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return '';
      case 'auth/popup-blocked':
        return 'تم حظر النافذة المنبثقة. اسمح بها في المتصفح وأعد المحاولة.';
      case 'auth/operation-not-allowed':
        return 'طريقة تسجيل الدخول هذه غير مفعّلة بعد في إعدادات Firebase.';
      case 'auth/account-exists-with-different-credential':
        return 'يوجد حساب بهذا البريد بطريقة دخول مختلفة.';
      default:
        return err.message || 'حدث خطأ أثناء العملية.';
    }
  }
  return 'حدث خطأ أثناء العملية.';
}

/* -------------------------------------------------------------------------- */
/*  Shared styling (Material 3-like tonal palette, light + dark)               */
/* -------------------------------------------------------------------------- */

const press =
  'transition-transform duration-150 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100';
const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B3FB8] dark:focus-visible:ring-[#B9BEFF] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#181C27]';
const linkText = 'text-[#3B3FB8] dark:text-[#B9BEFF] font-bold';

/* -------------------------------------------------------------------------- */
/*  Field: filled M3 input with floating label + animated inline error         */
/* -------------------------------------------------------------------------- */

type FieldProps = {
  id: string;
  label: string;
  icon: LucideIcon;
  type: 'email' | 'text' | 'password';
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  error: string | null;
  autoComplete: string;
  trailing?: React.ReactNode;
};

function Field({
  id,
  label,
  icon: Icon,
  type,
  value,
  onChange,
  onBlur,
  error,
  autoComplete,
  trailing,
}: FieldProps) {
  const hasError = !!error;
  return (
    <div>
      <div
        className={[
          'group relative flex items-center rounded-[20px] border-2 bg-[#EEEFF8] dark:bg-[#232837]',
          'transition-colors duration-200 motion-reduce:transition-none',
          hasError
            ? 'border-[#B3261E] dark:border-[#F2B8B5]'
            : 'border-transparent focus-within:border-[#3B3FB8] dark:focus-within:border-[#B9BEFF]',
        ].join(' ')}
      >
        <Icon
          size={22}
          aria-hidden
          className={[
            'pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 transition-colors',
            hasError
              ? 'text-[#B3261E] dark:text-[#F2B8B5]'
              : 'text-[#4A4D5C] group-focus-within:text-[#3B3FB8] dark:text-[#B4B8CA] dark:group-focus-within:text-[#B9BEFF]',
          ].join(' ')}
        />

        <input
          id={id}
          type={type}
          dir={type === 'text' ? 'rtl' : 'ltr'}
          value={value}
          placeholder=" "
          autoComplete={autoComplete}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={[
            'peer h-[60px] w-full bg-transparent pb-1 pt-5 text-base outline-none',
            'text-[#1B1B21] dark:text-[#E4E5EE]',
            type === 'text' ? 'text-right' : 'text-left',
            'pr-12',
            trailing ? 'pl-12' : 'pl-4',
          ].join(' ')}
        />

        <label
          htmlFor={id}
          className={[
            'pointer-events-none absolute right-12 origin-right transition-all duration-150 motion-reduce:transition-none',
            'top-2 text-xs',
            'peer-placeholder-shown:top-[19px] peer-placeholder-shown:text-base',
            'peer-focus:top-2 peer-focus:text-xs',
            hasError
              ? 'text-[#B3261E] dark:text-[#F2B8B5]'
              : 'text-[#4A4D5C] peer-focus:text-[#3B3FB8] dark:text-[#B4B8CA] dark:peer-focus:text-[#B9BEFF]',
          ].join(' ')}
        >
          {label}
        </label>

        {trailing && <div className="absolute left-2 top-1/2 -translate-y-1/2">{trailing}</div>}
      </div>

      <div
        className={[
          'grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none',
          hasError ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        ].join(' ')}
        aria-live="polite"
      >
        <div className="overflow-hidden">
          <p
            id={`${id}-error`}
            className="flex items-center gap-1.5 px-2 pt-1.5 text-[13px] font-semibold text-[#B3261E] dark:text-[#F2B8B5]"
          >
            {hasError && <AlertCircle size={15} aria-hidden className="shrink-0" />}
            <span>{error}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function Banner({ kind, text }: { kind: 'error' | 'success'; text: string }) {
  const isError = kind === 'error';
  const Icon = isError ? AlertCircle : CheckCircle2;
  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={[
        'mb-4 flex items-start gap-2.5 rounded-2xl p-3.5 text-sm font-semibold leading-relaxed',
        isError
          ? 'bg-[#FCE8E6] text-[#B3261E] dark:bg-[#4A1714] dark:text-[#F2B8B5]'
          : 'bg-[#DDF3EA] text-[#0F6B4F] dark:bg-[#0E3B2C] dark:text-[#7ADBB5]',
      ].join(' ')}
    >
      <Icon size={22} aria-hidden className="mt-px shrink-0" />
      <span>{text}</span>
    </div>
  );
}

const GoogleGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="currentColor">
    <path d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.64 4.1-5.35 4.1a5.9 5.9 0 0 1 0-11.8c1.87 0 3.12.8 3.84 1.48l2.62-2.52C17.77 3.76 15.1 2.6 12 2.6a9.4 9.4 0 1 0 0 18.8c5.43 0 9.03-3.82 9.03-9.2 0-.62-.07-1.09-.15-1.1z" />
  </svg>
);
const AppleGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="currentColor">
    <path d="M16.37 12.6c-.02-2.2 1.8-3.25 1.88-3.3-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.86-.76-1.47.02-2.83.86-3.58 2.17-1.53 2.65-.39 6.58 1.1 8.73.73 1.05 1.6 2.23 2.74 2.19 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.4 1.2-2.46-.03-.01-2.3-.88-2.32-3.5zM14.2 6.1c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.65-1.05 1.69-.92 2.68.97.08 1.96-.5 2.56-1.23z" />
  </svg>
);

/* -------------------------------------------------------------------------- */
/*  Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function Login() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);

  // Check if Native Biometric (Fingerprint/FaceID) is available on the device
  useEffect(() => {
    let active = true;
    const checkBiometric = async () => {
      try {
        const result = await NativeBiometric.isAvailable();
        if (active) setBiometricReady(result.isAvailable);
      } catch (err) {
        if (active) setBiometricReady(false);
      }
    };
    checkBiometric();
    return () => {
      active = false;
    };
  }, []);

  const emailError = useMemo(() => {
    if (!email.trim()) return 'أدخل بريدك الإلكتروني';
    if (!EMAIL_PATTERN.test(email.trim())) return 'صيغة البريد الإلكتروني غير صحيحة';
    return null;
  }, [email]);

  const passwordError = useMemo(() => {
    if (mode === 'reset') return null;
    if (!password) return 'أدخل كلمة المرور';
    if (mode === 'signup' && password.length < 6) return 'يجب أن تكون 6 أحرف على الأقل';
    return null;
  }, [password, mode]);

  const changeMode = (next: Mode) => {
    setMode(next);
    setError('');
    setMessage('');
    setPassword('');
    setShowPassword(false);
    setTouched({ email: false, password: false });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setTouched({ email: true, password: true });
    if (emailError || passwordError) return;

    setLoading(true);
    try {
      const trimmed = email.trim();
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, trimmed);
        setMessage('تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني بنجاح.');
      } else {
        // Handle both login and signup
        if (mode === 'login') {
          await signInWithEmailAndPassword(auth, trimmed, password);
        } else {
          await createUserWithEmailAndPassword(auth, trimmed, password);
        }
        
        // Save credentials securely after successful login/signup
        if (biometricReady) {
          try {
            await NativeBiometric.setCredentials({
              username: trimmed,
              password: password,
              server: 'com.mytasks.app', // Unique ID for your app
            });
          } catch (ignoredError) {
            // Silently ignore if saving credentials fails
          }
        }
      }
    } catch (err: unknown) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSocial = async (provider: 'google' | 'apple') => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const p = provider === 'google' ? new GoogleAuthProvider() : new OAuthProvider('apple.com');
      await signInWithPopup(auth, p);
    } catch (err: unknown) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleBiometric = async () => {
    setError('');
    setMessage('');
    try {
      // 1. Verify Fingerprint/Face
      await NativeBiometric.verifyIdentity({
        reason: 'الرجاء التحقق من هويتك لتسجيل الدخول',
        title: 'تسجيل الدخول بالبصمة',
        subtitle: 'استخدم البصمة للوصول إلى مهامك',
        description: 'ضع إصبعك على المستشعر',
      });

      // 2. Fetch saved credentials from device keystore
      const credentials = await NativeBiometric.getCredentials({
        server: 'com.mytasks.app',
      });

      // 3. Login to Firebase with fetched credentials
      setLoading(true);
      await signInWithEmailAndPassword(auth, credentials.username, credentials.password);

    } catch (err: any) {
      setLoading(false);
      // If user cancelled the fingerprint popup, do nothing
      if (err.code === 'user_cancel' || err.message?.includes('cancel')) {
        return;
      }
      // If no credentials found or fingerprint failed
      setError('يرجى تسجيل الدخول بالبريد وكلمة المرور يدوياً لتفعيل البصمة للمرة الأولى.');
    }
  };

  const copy = COPY[mode];
  const isLogin = mode === 'login';
  const isReset = mode === 'reset';

  return (
    <div
      dir="rtl"
      className="flex min-h-dvh items-center justify-center bg-[#F7F7FC] px-5 py-8 dark:bg-[#10131C]"
      style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
    >
      <div className="w-full max-w-[440px]">
        {/* Brand + header */}
        <header className="mb-7 flex flex-col items-center text-center">
          <div className="mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-3xl bg-[#E0E1FF] text-[#0A0C5E] dark:bg-[#2A2F8C] dark:text-[#E0E1FF]">
            <BookOpen size={34} aria-hidden />
          </div>
          <h1 className="font-['Aref_Ruqaa'] text-[32px] font-bold leading-[1.5] text-[#1B1B21] dark:text-[#E4E5EE]">
            {copy.title}
          </h1>
          <p className="mt-1 max-w-[320px] text-[15px] leading-relaxed text-[#4A4D5C] dark:text-[#B4B8CA]">
            {copy.subtitle}
          </p>
        </header>

        {/* Card */}
        <div className="rounded-[28px] bg-white p-5 shadow-[0_6px_24px_rgba(27,27,75,0.08)] dark:bg-[#181C27] dark:shadow-none">
          {error && <Banner kind="error" text={error} />}
          {message && <Banner kind="success" text={message} />}

          <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
            <Field
              id="email"
              label="البريد الإلكتروني"
              icon={Mail}
              type="email"
              value={email}
              onChange={setEmail}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              error={touched.email ? emailError : null}
              autoComplete="email"
            />

            {!isReset && (
              <Field
                id="password"
                label="كلمة المرور"
                icon={Lock}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={setPassword}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                error={touched.password ? passwordError : null}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    className={`rounded-full p-2 text-[#4A4D5C] hover:bg-black/5 dark:text-[#B4B8CA] dark:hover:bg-white/10 ${press} ${focusRing}`}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                }
              />
            )}

            {isLogin && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => changeMode('reset')}
                  className={`rounded-md px-1 py-1 text-sm ${linkText} ${press} ${focusRing}`}
                >
                  نسيت كلمة المرور؟
                </button>
              </div>
            )}

            {/* Primary action (+ biometric) */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className={[
                  'flex h-14 flex-1 items-center justify-center rounded-full text-[17px] font-extrabold',
                  'bg-[#3B3FB8] text-white shadow-[0_4px_12px_rgba(59,63,184,0.3)]',
                  'dark:bg-[#B9BEFF] dark:text-[#14176B] dark:shadow-none',
                  'disabled:opacity-80 disabled:pointer-events-none',
                  press,
                  focusRing,
                ].join(' ')}
              >
                {loading ? (
                  <Loader2 size={24} className="animate-spin" aria-label="جاري التحميل" />
                ) : (
                  copy.cta
                )}
              </button>

              {isLogin && biometricReady && (
                <button
                  type="button"
                  onClick={handleBiometric}
                  disabled={loading}
                  aria-label="تسجيل الدخول بالبصمة"
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-[#E0E1FF] text-[#0A0C5E] dark:bg-[#2A2F8C] dark:text-[#E0E1FF] ${press} ${focusRing}`}
                >
                  <Fingerprint size={30} aria-hidden />
                </button>
              )}
            </div>
          </form>

          {/* Social sign-in */}
          {isLogin && (
            <>
              <div className="my-6 flex items-center gap-3 text-[13px] text-[#4A4D5C] dark:text-[#B4B8CA]">
                <span className="h-px flex-1 bg-[#767A8C]/40" />
                <span>أو تابع باستخدام</span>
                <span className="h-px flex-1 bg-[#767A8C]/40" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { id: 'google', label: 'Google', Glyph: GoogleGlyph },
                    { id: 'apple', label: 'Apple', Glyph: AppleGlyph },
                  ] as const
                ).map(({ id, label, Glyph }) => (
                  <button
                    key={id}
                    type="button"
                    disabled={loading}
                    onClick={() => handleSocial(id)}
                    aria-label={`المتابعة عبر ${label}`}
                    className={[
                      'flex h-[52px] items-center justify-center gap-2.5 rounded-2xl border border-[#767A8C]',
                      'text-[15px] font-bold text-[#1B1B21] dark:text-[#E4E5EE]',
                      'hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-60 disabled:pointer-events-none',
                      press,
                      focusRing,
                    ].join(' ')}
                  >
                    <span dir="ltr" className="flex items-center gap-2.5">
                      <Glyph />
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-sm">
          {isReset ? (
            <button
              type="button"
              onClick={() => changeMode('login')}
              className={`rounded-md px-1 py-1 ${linkText} ${press} ${focusRing}`}
            >
              العودة لتسجيل الدخول
            </button>
          ) : (
            <p className="text-[#4A4D5C] dark:text-[#B4B8CA]">
              {isLogin ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟'}
              <button
                type="button"
                onClick={() => changeMode(isLogin ? 'signup' : 'login')}
                className={`mx-1.5 rounded-md px-1 py-1 ${linkText} ${press} ${focusRing}`}
              >
                {isLogin ? 'سجّل الآن' : 'سجّل الدخول'}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}