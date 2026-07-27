import { useEffect, useState } from 'react'

const DATABASE_NAME = 'unite-recognition-media-v1'
const STORE_NAME = 'assets'

export type StoredMediaAsset = {
  id: string
  name: string
  type: string
  blob: Blob
  updatedAt: string
}

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = window.indexedDB.open(DATABASE_NAME, 1)
  request.onupgradeneeded = () => {
    const database = request.result
    if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'id' })
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error ?? new Error('Không mở được kho media cục bộ.'))
})

const runStoreRequest = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode)
      const request = action(transaction.objectStore(STORE_NAME))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Không thao tác được với kho media.'))
    })
  } finally {
    database.close()
  }
}

const imageFromFile = (file: File) => new Promise<HTMLImageElement>((resolve, reject) => {
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.onload = () => {
    URL.revokeObjectURL(url)
    resolve(image)
  }
  image.onerror = () => {
    URL.revokeObjectURL(url)
    reject(new Error('Không đọc được hình ảnh đã chọn.'))
  }
  image.src = url
})

const optimizeImage = async (file: File, purpose: 'background' | 'logo') => {
  const image = await imageFromFile(file)
  const maxWidth = purpose === 'background' ? 1920 : 720
  const maxHeight = purpose === 'background' ? 1080 : 720
  const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight)
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Không thể tối ưu hình ảnh.')),
      'image/webp',
      purpose === 'background' ? 0.84 : 0.9,
    )
  })
}

const newAssetId = () => `asset-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`

export const storeImageAsset = async (file: File, purpose: 'background' | 'logo') => {
  if (!file.type.startsWith('image/')) throw new Error('Vui lòng chọn file PNG, JPG hoặc WebP.')
  const blob = await optimizeImage(file, purpose)
  const asset: StoredMediaAsset = {
    id: newAssetId(),
    name: file.name,
    type: blob.type,
    blob,
    updatedAt: new Date().toISOString(),
  }
  await runStoreRequest('readwrite', (store) => store.put(asset))
  return asset
}

export const storeVideoAsset = async (file: File) => {
  if (!['video/mp4', 'video/webm'].includes(file.type)) throw new Error('Video demo cần định dạng MP4 hoặc WebM.')
  const asset: StoredMediaAsset = {
    id: newAssetId(),
    name: file.name,
    type: file.type,
    blob: file,
    updatedAt: new Date().toISOString(),
  }
  await runStoreRequest('readwrite', (store) => store.put(asset))
  return asset
}

export const deleteMediaAsset = async (id?: string) => {
  if (!id) return
  await runStoreRequest('readwrite', (store) => store.delete(id))
}

export const loadMediaAsset = async (id?: string) => {
  if (!id) return null
  return await runStoreRequest<StoredMediaAsset | undefined>('readonly', (store) => store.get(id)) ?? null
}

export const useMediaAssetUrl = (assetId?: string) => {
  const [url, setUrl] = useState('')

  useEffect(() => {
    let active = true
    let objectUrl = ''
    setUrl('')
    if (!assetId) return

    void loadMediaAsset(assetId).then((asset) => {
      if (!active || !asset) return
      objectUrl = URL.createObjectURL(asset.blob)
      setUrl(objectUrl)
    })

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [assetId])

  return url
}
