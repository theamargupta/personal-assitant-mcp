'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
      setLoading(false)
    }
  }

  async function handleGoogleSignUp() {
    const supabase = createClient()
    const callbackUrl = new URL('/auth/callback', window.location.origin)
    callbackUrl.searchParams.set('next', '/dashboard')
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl.toString() },
    })
  }

  if (success) {
    return (
      <div className="w-full max-w-[380px]">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          {/* Success icon */}
          <div className="w-12 h-12 rounded-xl bg-neon/[0.08] border border-neon/[0.12] flex items-center justify-center mx-auto mb-5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c8ff00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </div>
          <h2 className="text-[18px] font-semibold text-text-primary mb-2 tracking-[-0.01em]">Check your email</h2>
          <p className="text-[13px] text-text-secondary leading-relaxed">
            We sent a confirmation link to{' '}
            <span className="text-text-primary font-medium">{email}</span>.
            Click it to activate your account.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 mt-6 text-[13px] text-neon hover:text-neon-muted transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-[380px]">
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-[22px] font-bold text-text-primary tracking-[-0.02em]">Create account</h1>
          <p className="text-text-muted text-[13px] mt-1.5">Get started with PA MCP</p>
        </div>

        {/* Google sign-up */}
        <button
          onClick={handleGoogleSignUp}
          className="w-full py-3 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[13px] text-text-secondary font-medium hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-300 flex items-center justify-center gap-2.5"
        >
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-white/[0.04]" />
          <span className="text-[11px] text-text-muted uppercase tracking-wider">or</span>
          <div className="flex-1 h-px bg-white/[0.04]" />
        </div>

        {/* Email form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] text-text-muted uppercase tracking-[0.1em] mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-text-primary text-[14px] placeholder:text-text-muted focus:outline-none focus:border-neon/30 focus:ring-1 focus:ring-neon/20 transition-all"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-[11px] text-text-muted uppercase tracking-[0.1em] mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-text-primary text-[14px] placeholder:text-text-muted focus:outline-none focus:border-neon/30 focus:ring-1 focus:ring-neon/20 transition-all"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="block text-[11px] text-text-muted uppercase tracking-[0.1em] mb-1.5">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-text-primary text-[14px] placeholder:text-text-muted focus:outline-none focus:border-neon/30 focus:ring-1 focus:ring-neon/20 transition-all"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-[12px] text-red-400 bg-red-500/[0.06] border border-red-500/[0.1] px-3 py-2.5 rounded-xl">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-neon text-bg-primary text-[14px] font-medium hover:bg-neon-muted transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-[12px] text-text-muted mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-neon hover:text-neon-muted transition-colors">Sign In</Link>
        </p>
      </div>
    </div>
  )
}
