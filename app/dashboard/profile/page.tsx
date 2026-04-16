'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AvatarUpload } from '@/components/dashboard/AvatarUpload'

interface ProfileMetadata {
  full_name?: string
  first_name?: string
  bio?: string
  avatar_url?: string
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string>('')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const meta = (user.user_metadata || {}) as ProfileMetadata
      setUserId(user.id)
      setEmail(user.email || '')
      setFullName(meta.full_name || '')
      setFirstName(meta.first_name || '')
      setBio(meta.bio || '')
      setAvatarUrl(meta.avatar_url || '')
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave(event: React.SyntheticEvent) {
    event.preventDefault()
    setSaving(true)
    setToast(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: fullName.trim() || undefined,
          first_name: firstName.trim() || undefined,
          bio: bio.trim() || undefined,
          avatar_url: avatarUrl.trim() || undefined,
        },
      })
      if (error) throw error
      setToast({ kind: 'ok', msg: 'Profile saved' })
    } catch (error) {
      setToast({
        kind: 'err',
        msg: error instanceof Error ? error.message : 'Save failed',
      })
    } finally {
      setSaving(false)
      setTimeout(() => setToast(null), 2400)
    }
  }

  if (loading) {
    return <div className="max-w-2xl text-text-muted text-sm">Loading profile…</div>
  }

  const initial = (firstName || fullName || email).slice(0, 1).toUpperCase()

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Profile</h1>
        <p className="text-sm text-text-muted mt-1">How you show up in the app.</p>
      </div>

      {toast && (
        <div
          className={`mb-5 rounded-md px-3 py-2 text-sm border ${
            toast.kind === 'ok'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/40 bg-red-500/10 text-red-300'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="rounded-xl border border-white/6 bg-white/2 p-5 space-y-5">
          <div>
            <p className="text-sm text-text-primary font-medium">
              {fullName || email.split('@')[0] || 'Unnamed'}
            </p>
            <p className="text-xs text-text-muted mt-0.5">{email}</p>
          </div>
          {userId && (
            <AvatarUpload
              userId={userId}
              initial={initial}
              initialUrl={avatarUrl}
              onUploaded={setAvatarUrl}
            />
          )}
        </div>

        <Field label="First name" hint="Used by the assistant to address you.">
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="e.g. Amar"
            maxLength={50}
            className="input"
          />
        </Field>

        <Field label="Full name" hint="Displayed on your profile.">
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Amar Gupta"
            maxLength={100}
            className="input"
          />
        </Field>

        <Field label="Bio" hint="A one-line description (optional).">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Founder. Operator. Permanent learner."
            maxLength={280}
            rows={3}
            className="input resize-none"
          />
          <p className="text-[11px] text-text-muted mt-1">{bio.length}/280</p>
        </Field>

        <Field
          label="Avatar URL"
          hint="Auto-filled when you upload a photo above. You can also paste a URL directly."
        >
          <input
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
            className="input"
          />
        </Field>

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: var(--color-text-primary, #fafafa);
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.15s;
        }
        :global(.input:focus) {
          border-color: rgba(139, 92, 246, 0.6);
        }
        :global(.btn-primary) {
          padding: 10px 20px;
          border-radius: 10px;
          background: #8b5cf6;
          color: #fafafa;
          font-size: 14px;
          font-weight: 600;
          transition: opacity 0.15s;
        }
        :global(.btn-primary:disabled) {
          opacity: 0.6;
          cursor: not-allowed;
        }
        :global(.btn-primary:hover:not(:disabled)) {
          background: #7c3aed;
        }
      `}</style>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-text-primary mb-1">{label}</span>
      {hint && <span className="block text-xs text-text-muted mb-2">{hint}</span>}
      {children}
    </label>
  )
}
