"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, FlaskConical, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { loginWithEmail, loginWithGoogle, registerWithEmail, resetPassword } from "@/lib/auth";
import { friendlyAuthError } from "@/lib/errors";
import { validateEmail, validatePassword } from "@/lib/validation";
import { Alert } from "./Alert";
import { GoogleIcon } from "./AuthCard";

/** Only allow redirects to our own pages. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

function useRedirectWhenSignedIn() {
  const { status } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, router, next]);
}

function NotConfiguredNotice() {
  const { firebaseReady, demoAllowed } = useAuth();
  if (firebaseReady) return null;
  return (
    <Alert tone="warning" className="mb-4">
      Accounts are not set up on this server yet (Firebase is not configured).
      {demoAllowed ? " You can explore the app with demo data instead." : ""}
    </Alert>
  );
}

function DemoButton() {
  const { demoAllowed, enterDemo } = useAuth();
  const router = useRouter();
  if (!demoAllowed) return null;
  return (
    <div className="text-center">
      <button
        type="button"
        className="btn-ghost w-full"
        aria-describedby="demo-hint"
        onClick={() => {
          enterDemo();
          router.replace("/dashboard");
        }}
      >
        <FlaskConical aria-hidden className="size-4" />
        Try demo mode
      </button>
      <p id="demo-hint" className="text-xs muted">Sample data, saved on this device only.</p>
    </div>
  );
}

function GoogleButton({ disabled, onError }: { disabled: boolean; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary w-full"
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true);
        try {
          await loginWithGoogle();
        } catch (e) {
          onError(friendlyAuthError(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <GoogleIcon />}
      Continue with Google
    </button>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  describedBy,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  describedBy?: string;
  invalid?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        className="input pr-12"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        required
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center muted"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
      </button>
    </div>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider muted">
      <span className="h-px flex-1 bg-[var(--border)]" />
      or
      <span className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );
}

export function LoginForm() {
  useRedirectWhenSignedIn();
  const { firebaseReady } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!validateEmail(email)) return setError("Please enter a valid email address.");
    if (!password) return setError("Please enter your password.");
    setBusy(true);
    try {
      await loginWithEmail(email, password);
      // AuthProvider picks up the session; useRedirectWhenSignedIn navigates to the dashboard.
    } catch (err) {
      setError(friendlyAuthError(err));
      setBusy(false);
    }
  }

  async function onReset() {
    setError(null);
    if (!validateEmail(email)) return setError("Enter your email above, then choose \"Forgot password\".");
    try {
      await resetPassword(email);
      setInfo("If an account exists for this email, a password reset link has been sent.");
    } catch (err) {
      setError(friendlyAuthError(err));
    }
  }

  return (
    <>
      <NotConfiguredNotice />
      <form onSubmit={onSubmit} method="post" noValidate className="space-y-4">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="label">Password</label>
            <button type="button" onClick={onReset} className="mb-1.5 text-sm font-medium text-brand-700 hover:underline dark:text-brand-200" disabled={!firebaseReady}>
              Forgot password?
            </button>
          </div>
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" />
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        {info && <Alert tone="success">{info}</Alert>}
        <button type="submit" className="btn-primary w-full" disabled={busy || !firebaseReady}>
          {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {busy ? "Logging in..." : "Login"}
        </button>
      </form>
      <Divider />
      <div className="space-y-2">
        <GoogleButton disabled={!firebaseReady} onError={setError} />
        <DemoButton />
      </div>
    </>
  );
}

export function RegisterForm() {
  useRedirectWhenSignedIn();
  const { firebaseReady } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Please enter your name.";
    if (!validateEmail(email)) next.email = "Please enter a valid email address.";
    const pw = validatePassword(password);
    if (!pw.valid && pw.message) next.password = pw.message;
    if (password !== confirm) next.confirm = "Passwords do not match.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await registerWithEmail(name, email, password);
    } catch (err) {
      setFormError(friendlyAuthError(err));
      setBusy(false);
    }
  }

  const err = (k: string) =>
    errors[k] ? (
      <p id={`${k}-error`} className="field-error">
        {errors[k]}
      </p>
    ) : null;

  return (
    <>
      <NotConfiguredNotice />
      <form onSubmit={onSubmit} method="post" noValidate className="space-y-4">
        <div>
          <label htmlFor="name" className="label">Name</label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-invalid={!!errors.name || undefined} aria-describedby={errors.name ? "name-error" : undefined} required maxLength={60} />
          {err("name")}
        </div>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" aria-invalid={!!errors.email || undefined} aria-describedby={errors.email ? "email-error" : undefined} required />
          {err("email")}
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" describedBy={errors.password ? "password-error" : "password-hint"} invalid={!!errors.password} />
          {errors.password ? err("password") : <p id="password-hint" className="mt-1 text-xs muted">At least 8 characters, with a letter and a number.</p>}
        </div>
        <div>
          <label htmlFor="confirm" className="label">Confirm password</label>
          <PasswordInput id="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" describedBy={errors.confirm ? "confirm-error" : undefined} invalid={!!errors.confirm} />
          {err("confirm")}
        </div>
        {formError && <Alert tone="error">{formError}</Alert>}
        <button type="submit" className="btn-primary w-full" disabled={busy || !firebaseReady}>
          {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {busy ? "Creating account..." : "Create account"}
        </button>
        <p className="text-xs muted">
          By registering you agree to our{" "}
          <Link href="/privacy" className="underline">privacy notice</Link>. We only store your name, email and the food items you add.
        </p>
      </form>
      <Divider />
      <div className="space-y-2">
        <GoogleButton disabled={!firebaseReady} onError={setFormError} />
        <DemoButton />
      </div>
    </>
  );
}
