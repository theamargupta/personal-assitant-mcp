import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockStorage = {
  from: vi.fn().mockReturnValue({
    createSignedUploadUrl: vi.fn(),
    createSignedUrl: vi.fn(),
    download: vi.fn(),
    remove: vi.fn(),
  }),
}

const mockClient = {
  from: vi.fn(),
  storage: mockStorage,
}

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockClient),
}))

import { createSignedUploadUrl, getSignedUrl, downloadFile, deleteFile } from '@/lib/documents/storage'

describe('createSignedUploadUrl', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns signed URL on success', async () => {
    mockStorage.from.mockReturnValue({
      createSignedUploadUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: 'https://storage.test/upload?token=abc' },
        error: null,
      }),
    })

    const url = await createSignedUploadUrl('user-1/doc.pdf')
    expect(url).toBe('https://storage.test/upload?token=abc')
  })

  it('throws on error', async () => {
    mockStorage.from.mockReturnValue({
      createSignedUploadUrl: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Bucket not found' },
      }),
    })

    await expect(createSignedUploadUrl('user-1/doc.pdf')).rejects.toThrow('Signed upload URL failed')
  })
})

describe('getSignedUrl', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns signed download URL', async () => {
    mockStorage.from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: 'https://storage.test/download?token=abc' },
        error: null,
      }),
    })

    const url = await getSignedUrl('user-1/doc.pdf')
    expect(url).toBe('https://storage.test/download?token=abc')
  })

  it('uses custom expiry', async () => {
    const createSignedUrlFn = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://storage.test/dl' },
      error: null,
    })
    mockStorage.from.mockReturnValue({ createSignedUrl: createSignedUrlFn })

    await getSignedUrl('path', 7200)
    expect(createSignedUrlFn).toHaveBeenCalledWith('path', 7200)
  })

  it('throws on error', async () => {
    mockStorage.from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      }),
    })

    await expect(getSignedUrl('bad-path')).rejects.toThrow('Signed URL failed')
  })
})

describe('downloadFile', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns file buffer', async () => {
    const blob = new Blob(['file content'])
    mockStorage.from.mockReturnValue({
      download: vi.fn().mockResolvedValue({ data: blob, error: null }),
    })

    const buffer = await downloadFile('user-1/doc.pdf')
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.toString()).toBe('file content')
  })

  it('throws on error', async () => {
    mockStorage.from.mockReturnValue({
      download: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
    })

    await expect(downloadFile('bad-path')).rejects.toThrow('Download failed')
  })
})

describe('deleteFile', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('deletes file successfully', async () => {
    mockStorage.from.mockReturnValue({
      remove: vi.fn().mockResolvedValue({ error: null }),
    })

    await expect(deleteFile('user-1/doc.pdf')).resolves.toBeUndefined()
  })

  it('throws on error', async () => {
    mockStorage.from.mockReturnValue({
      remove: vi.fn().mockResolvedValue({ error: { message: 'Permission denied' } }),
    })

    await expect(deleteFile('user-1/doc.pdf')).rejects.toThrow('Delete failed')
  })
})
