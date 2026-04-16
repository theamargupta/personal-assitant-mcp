'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  initialUrl?: string
  userId: string
  initial: string
  onUploaded: (url: string) => void
}

/**
 * Simple avatar picker + client-side square crop. Reads the selected image,
 * renders it on a canvas with a draggable crop square, then uploads a 512x512
 * JPEG to the `avatars` Supabase bucket under `{userId}/{timestamp}.jpg`.
 */
export function AvatarUpload({ initialUrl, userId, initial, onUploaded }: Props) {
  const [preview, setPreview] = useState<string | undefined>(initialUrl)
  const [pickedUri, setPickedUri] = useState<string | null>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)

  useEffect(() => {
    setPreview(initialUrl)
  }, [initialUrl])

  const onPick = useCallback(() => fileRef.current?.click(), [])

  const onFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 8 * 1024 * 1024) {
      setError('File too large (max 8MB)')
      return
    }
    setError(null)
    const reader = new FileReader()
    reader.onload = () => {
      setPickedUri(typeof reader.result === 'string' ? reader.result : null)
      setOffset({ x: 0, y: 0 })
      setScale(1)
    }
    reader.readAsDataURL(file)
  }, [])

  const onDragStart = (e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  const onDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    setOffset({
      x: dragRef.current.ox + (e.clientX - dragRef.current.startX),
      y: dragRef.current.oy + (e.clientY - dragRef.current.startY),
    })
  }

  const onDragEnd = () => {
    dragRef.current = null
  }

  async function handleUpload() {
    if (!pickedUri || !imgRef.current || !canvasRef.current) return
    setUploading(true)
    setError(null)
    try {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas not supported')

      const OUT = 512
      canvas.width = OUT
      canvas.height = OUT
      ctx.fillStyle = '#18181B'
      ctx.fillRect(0, 0, OUT, OUT)

      const img = imgRef.current
      const boxSize = 240
      const naturalToBox = Math.min(img.naturalWidth, img.naturalHeight) / (boxSize / scale)
      const drawW = img.naturalWidth / naturalToBox
      const drawH = img.naturalHeight / naturalToBox
      const cx = OUT / 2 + (offset.x / boxSize) * OUT
      const cy = OUT / 2 + (offset.y / boxSize) * OUT
      ctx.drawImage(
        img,
        cx - drawW / 2,
        cy - drawH / 2,
        drawW,
        drawH
      )

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to encode image'))),
          'image/jpeg',
          0.88
        )
      })

      const supabase = createClient()
      const path = `${userId}/${Date.now()}.jpg`
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (uploadErr) throw uploadErr

      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      setPreview(data.publicUrl)
      onUploaded(data.publicUrl)
      setPickedUri(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 rounded-full overflow-hidden border border-neon/40 bg-neon/15 flex items-center justify-center">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Avatar" className="h-full w-full object-cover" />
          ) : (
            <span className="text-3xl font-semibold text-neon">{initial}</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={onPick} className="btn-secondary">
            Choose photo
          </button>
          {preview && (
            <button
              type="button"
              onClick={() => {
                setPreview(undefined)
                onUploaded('')
              }}
              className="text-xs text-text-muted hover:text-red-400"
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onFile}
          className="hidden"
        />
      </div>

      {pickedUri && (
        <div className="rounded-xl border border-white/6 bg-white/2 p-4 space-y-3">
          <p className="text-xs text-text-muted">Drag to position. Zoom below. Then upload.</p>
          <div
            className="relative h-60 w-60 mx-auto rounded-full overflow-hidden border border-white/10 cursor-grab active:cursor-grabbing"
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={pickedUri}
              alt="Preview"
              draggable={false}
              className="absolute top-1/2 left-1/2 max-w-none select-none pointer-events-none"
              style={{
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
                transformOrigin: 'center',
                height: '100%',
              }}
            />
          </div>
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="w-full accent-neon"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setPickedUri(null)}
              className="btn-secondary"
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="btn-primary"
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      <canvas ref={canvasRef} className="hidden" />

      <style jsx>{`
        :global(.btn-secondary) {
          padding: 8px 14px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
          color: var(--color-text-primary, #fafafa);
          font-size: 13px;
          font-weight: 500;
        }
        :global(.btn-secondary:hover) {
          background: rgba(255, 255, 255, 0.08);
        }
      `}</style>
    </div>
  )
}
