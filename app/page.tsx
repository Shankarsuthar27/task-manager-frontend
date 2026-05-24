"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import { supabase } from "@/lib/supabase"

function GoogleIcon() {
  return (
    <svg className="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

type AuthMode = "login" | "signup"

export default function Home() {
  const router = useRouter()

  const [mode,     setMode]     = useState<AuthMode>("login")
  const [name,     setName]     = useState("")
  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [confirm,  setConfirm]  = useState("")
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [success,  setSuccess]  = useState<string | null>(null)

  /* ── Switch mode ── */
  const switchMode = (m: AuthMode) => {
    setMode(m)
    setError(null)
    setSuccess(null)
    setName(""); setEmail(""); setPassword(""); setConfirm("")
  }

  /* ── Google OAuth ── */
  const loginWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
  }

  /* ── Email sign-in ── */
  const handleSignIn = async () => {
    if (!email.trim() || !password) { setError("Email and password are required."); return }
    setLoading(true); setError(null)
    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (authErr) { setError(authErr.message); return }
      if (data.session) {
        // Sync user to backend
        const me = data.session.user
        try {
          await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/users/sync`, {
            id:    me.id,
            email: me.email,
            name:  me.user_metadata?.full_name ?? me.user_metadata?.name ?? me.email,
          })
        } catch { /* silent */ }
        router.push("/dashboard")
      }
    } catch {
      setError("Sign-in failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  /* ── Email sign-up ── */
  const handleSignUp = async () => {
    if (!name.trim())    { setError("Full name is required."); return }
    if (!email.trim())   { setError("Email is required."); return }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return }
    if (password !== confirm) { setError("Passwords do not match."); return }

    setLoading(true); setError(null); setSuccess(null)
    try {
      const { data, error: authErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: name.trim() },
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      })

      if (authErr) { setError(authErr.message); return }

      const user = data.user
      if (user) {
        // Sync to backend immediately so admin can see this user
        try {
          await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/users/sync`, {
            id:    user.id,
            email: user.email,
            name:  name.trim(),
          })
        } catch { /* silent */ }
      }

      // If email confirmation is off in Supabase, session is already active
      if (data.session) {
        router.push("/dashboard")
      } else {
        setSuccess(
          "Account created! Check your email for a confirmation link, then sign in."
        )
        setMode("login")
        setEmail(email.trim())
        setPassword("")
      }
    } catch {
      setError("Sign-up failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") mode === "login" ? handleSignIn() : handleSignUp()
  }

  return (
    <div className="login-page">
      {/* Animated background orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className={`login-card auth-card${mode === "signup" ? " signup-mode" : ""}`}>

        {/* Logo */}
        <div className="login-logo-wrap">
          <div className="login-logo-icon">✓</div>
          <span className="login-app-name">TaskFlow</span>
        </div>

        {/* Mode tabs */}
        <div className="auth-tabs">
          <button
            id="tab-signin"
            className={`auth-tab${mode === "login" ? " active" : ""}`}
            onClick={() => switchMode("login")}
          >
            Sign In
          </button>
          <button
            id="tab-signup"
            className={`auth-tab${mode === "signup" ? " active" : ""}`}
            onClick={() => switchMode("signup")}
          >
            Sign Up
          </button>
        </div>

        {/* Tagline changes with mode */}
        <p className="login-tagline" style={{ marginBottom: 20 }}>
          {mode === "login"
            ? "Welcome back! Sign in to manage your tasks."
            : "Create an account to join your team on TaskFlow."}
        </p>

        {/* Error / Success banners */}
        {error && (
          <div className="auth-error-banner">
            <span>⚠ {error}</span>
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}
        {success && (
          <div className="auth-success-banner">
            <span>✅ {success}</span>
            <button onClick={() => setSuccess(null)}>✕</button>
          </div>
        )}

        {/* ── SIGN-UP FORM ── */}
        {mode === "signup" && (
          <div className="auth-form" onKeyDown={handleKeyDown}>
            <div className="form-group">
              <label className="form-label" htmlFor="signup-name">Full Name</label>
              <input
                id="signup-name"
                className="form-input"
                type="text"
                placeholder="Jane Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="signup-email">Email Address</label>
              <input
                id="signup-email"
                className="form-input"
                type="email"
                placeholder="jane@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="signup-password">Password</label>
              <input
                id="signup-password"
                className="form-input"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="signup-confirm">Confirm Password</label>
              <input
                id="signup-confirm"
                className="form-input"
                type="password"
                placeholder="Repeat your password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <button
              id="signup-submit-btn"
              className="btn-create"
              onClick={handleSignUp}
              disabled={loading}
              style={{ marginTop: 4 }}
            >
              {loading ? "Creating account…" : "Create Account"}
            </button>

            <div className="auth-divider">or sign up with</div>

            <button onClick={loginWithGoogle} className="google-btn" id="signup-google-btn">
              <GoogleIcon />
              Continue with Google
            </button>

            <p className="auth-switch-text">
              Already have an account?{" "}
              <button className="auth-link" onClick={() => switchMode("login")}>
                Sign in
              </button>
            </p>
          </div>
        )}

        {/* ── SIGN-IN FORM ── */}
        {mode === "login" && (
          <div className="auth-form" onKeyDown={handleKeyDown}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">Email Address</label>
              <input
                id="login-email"
                className="form-input"
                type="email"
                placeholder="jane@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                className="form-input"
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <button
              id="login-submit-btn"
              className="btn-create"
              onClick={handleSignIn}
              disabled={loading}
              style={{ marginTop: 4 }}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>

            <div className="auth-divider">or continue with</div>

            <button onClick={loginWithGoogle} className="google-btn" id="google-login-btn">
              <GoogleIcon />
              Continue with Google
            </button>

            <p className="auth-switch-text">
              Don&apos;t have an account?{" "}
              <button className="auth-link" id="go-to-signup-btn" onClick={() => switchMode("signup")}>
                Sign up
              </button>
            </p>
          </div>
        )}

        <p className="login-footer-text" style={{ marginTop: 16 }}>
          By signing in, you agree to our terms of service.
        </p>
      </div>
    </div>
  )
}