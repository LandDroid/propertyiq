
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, House, ShieldCheck } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";

import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();

  const { login, isAuthenticated, isLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Redirect authenticated users after rendering.
  useEffect(() => {
  console.log(
    "AUTH STATE",
    {
      isLoading,
      isAuthenticated,
    }
  );

  if (
    !isLoading &&
    isAuthenticated
  ) {
    console.log(
      "AUTHENTICATED - REDIRECTING"
    );

    router.replace("/");
  }
}, [
  isLoading,
  isAuthenticated,
  router,
]);

  async function handleSubmit(
  event: FormEvent<HTMLFormElement>
) {
  event.preventDefault();

  console.log("LOGIN BUTTON CLICKED");

  if (submitting) {
    console.log("LOGIN ALREADY IN PROGRESS");
    return;
  }

  setError("");
  setSubmitting(true);

  try {
    console.log("EMAIL:", email.trim());
    console.log("CALLING AUTH LOGIN");

    await login(
      email.trim(),
      password
    );

    console.log("LOGIN SUCCESS");
    console.log("REDIRECTING TO DASHBOARD");

    router.replace("/");
  } catch (err) {
    console.error("LOGIN ERROR:", err);

    setError(
      err instanceof Error
        ? err.message
        : "Unable to sign in."
    );
  } finally {
    setSubmitting(false);
  }
}

  if (isLoading || isAuthenticated) {
    return (
      <main className={styles.page}>
        <div className={styles.loading}>
          {isLoading
            ? "Checking your session..."
            : "Redirecting to your dashboard..."}
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.leftPanel}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>
            <House size={25} />
          </div>
          <span>PropertyIQ</span>
        </div>

        <div className={styles.hero}>
          <div className={styles.eyebrow}>
            PROPERTY INTELLIGENCE PLATFORM
          </div>

          <h1>
            Know your property.
            <br />
            <span>Protect what matters.</span>
          </h1>

          <p>
            Monitor your properties, manage connected devices,
            and stay informed with PropertyIQ.
          </p>
        </div>

        <div className={styles.leftFooter}>
          PROPERTY MONITORING · MANAGEMENT · INTELLIGENCE
        </div>
      </section>

      <section className={styles.rightPanel}>
        <div className={styles.loginCard}>
          <div className={styles.mobileBrand}>
            <div className={styles.brandIcon}>
              <House size={23} />
            </div>
            <span>PropertyIQ</span>
          </div>

          <div className={styles.heading}>
            <div className={styles.securityIcon}>
              <ShieldCheck size={24} />
            </div>

            <h2>Welcome back</h2>
            <p>Sign in to access your PropertyIQ account.</p>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="email">Email address</label>

              <input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={255}
                disabled={submitting}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="password">Password</label>

              <div className={styles.passwordWrap}>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  maxLength={128}
                  disabled={submitting}
                />

                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                  disabled={submitting}
                >
                  {showPassword ? (
                    <EyeOff size={19} />
                  ) : (
                    <Eye size={19} />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              className={styles.submit}
              disabled={submitting || !email.trim() || !password}
            >
              {submitting ? "Signing in..." : "Sign in to PropertyIQ"}
            </button>
          </form>

          <div className={styles.secureNote}>
            <ShieldCheck size={16} />
            <span>
              Your account is protected by secure authentication.
            </span>
          </div>

          <div className={styles.copyright}>
            © {new Date().getFullYear()} PropertyIQ. All rights reserved.
          </div>
        </div>
      </section>
    </main>
  );
}
