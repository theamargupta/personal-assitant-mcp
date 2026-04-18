'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AvatarUpload } from '@/components/dashboard/AvatarUpload'
import { Card, DashboardHero, SectionHeader } from '@/components/dashboard/kit'

const MCP_URL = 'https://sathi.devfrend.com/api/mcp'

interface ProfileMetadata {
  full_name?: string
  first_name?: string
  bio?: string
  avatar_url?: string
}

export default function ProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string>('')
  const [email, setEmail] = useState('')
  const [createdAt, setCreatedAt] = useState('')
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
      setCreatedAt(user.created_at || '')
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

  async function handleCopyMcp() {
    await navigator.clipboard.writeText(MCP_URL)
    setToast({ kind: 'ok', msg: 'MCP URL copied' })
    setTimeout(() => setToast(null), 2000)
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return <div className="max-w-2xl text-text-muted text-sm">Loading profile…</div>
  }

  const initial = (firstName || fullName || email).slice(0, 1).toUpperCase()

  return (
    <div className="space-y-8">
      <DashboardHero eyebrow="ACCOUNT" title="Profile" subtitle="Your identity, assistant greeting, and MCP connection details in one place." />

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

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="p-5">
          <SectionHeader eyebrow="IDENTITY" title="How Sathi sees you" />
          <div className="space-y-5">
            <div>
              <p className="text-lg font-semibold tracking-[-0.02em] text-text-primary">{fullName || email.split('@')[0] || 'Unnamed'}</p>
              <p className="mt-1 text-sm text-text-muted">{email}</p>
              {createdAt && <p className="mt-1 text-xs text-text-muted">Joined {new Date(createdAt).toLocaleDateString('en-IN')}</p>}
            </div>
            {userId && <AvatarUpload userId={userId} initial={initial} initialUrl={avatarUrl} onUploaded={setAvatarUrl} />}
          </div>
        </Card>

        <form onSubmit={handleSave} className="space-y-5">
          <Card className="space-y-5 p-5">
            <SectionHeader eyebrow="DETAILS" title="Profile fields" />
            <Field label="First name" hint="Used by the assistant to address you.">
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. Amar" maxLength={50} className="profile-input" />
            </Field>
            <Field label="Full name" hint="Displayed on your profile.">
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Amar Gupta" maxLength={100} className="profile-input" />
            </Field>
            <Field label="Bio" hint="A one-line description.">
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Founder. Operator. Permanent learner." maxLength={280} rows={3} className="profile-input resize-none" />
              <p className="mt-1 text-[11px] text-text-muted">{bio.length}/280</p>
            </Field>
            <Field label="Avatar URL" hint="Auto-filled when you upload a photo above.">
              <input type="url" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." className="profile-input" />
            </Field>
            <div className="flex justify-end pt-2">
              <button type="submit" disabled={saving} className="rounded-full bg-neon px-5 py-2.5 text-sm font-semibold text-bg-primary transition-opacity disabled:opacity-60">
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </Card>
        </form>
      </div>

      <Card className="p-5">
        <SectionHeader eyebrow="MCP" title="Connection info" />
        <div className="flex flex-col gap-3 rounded-2xl border border-neon/[0.12] bg-neon/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between">
          <code className="overflow-x-auto whitespace-nowrap font-mono text-sm text-text-primary">{MCP_URL}</code>
          <button type="button" onClick={handleCopyMcp} className="rounded-full border border-white/[0.08] px-4 py-2 text-xs font-medium text-text-primary hover:border-neon/30 hover:text-neon">Copy</button>
        </div>
        <p className="mt-4 text-sm text-text-muted">Connected clients are authorized through OAuth when you add this MCP server in Claude, ChatGPT, or a local client.</p>
      </Card>

      <Card className="border-red-500/[0.08] p-5">
        <SectionHeader eyebrow="DANGER ZONE" title="Session" />
        <button type="button" onClick={handleSignOut} className="rounded-full border border-red-500/[0.2] bg-red-500/[0.08] px-5 py-2.5 text-sm font-medium text-red-300 hover:bg-red-500/[0.14]">
          Sign out
        </button>
      </Card>

      <style jsx>{`
        :global(.profile-input) {
          width: 100%;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: var(--color-text-primary, #fafafa);
          border-radius: 14px;
          padding: 10px 14px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        :global(.profile-input:focus) {
          border-color: rgba(200, 255, 0, 0.32);
          box-shadow: 0 0 0 1px rgba(200, 255, 0, 0.08);
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
