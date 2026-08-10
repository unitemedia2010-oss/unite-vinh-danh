import { useEffect, useState } from 'react'
import { Sparkles, Save, Undo2 } from 'lucide-react'
import { useVisualSettings, type VisualSettings } from '../lib/visualSettings'
import { saveVisualSettings } from '../lib/visualSettingsAdmin'
import { getRecognitionVisualPreset } from '../data/recognitionPresets'

export function VisualSettingsPage({ notify }: { notify: (message: string) => void }) {
  const settings = useVisualSettings()
  const [draft, setDraft] = useState<VisualSettings>(settings)
  const [isSaving, setIsSaving] = useState(false)

  // Sync draft when remote settings change (only if not saving)
  useEffect(() => {
    if (!isSaving) setDraft(settings)
  }, [settings, isSaving])

  const handleSave = async () => {
    try {
      setIsSaving(true)
      await saveVisualSettings(draft)
      notify('Đã lưu cấu hình giao diện thành công!')
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      notify(`Lỗi khi lưu: ${msg}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setDraft(settings)
    notify('Đã hủy các thay đổi chưa lưu')
  }

  return (
    <div className="settings-grid">
      <section className="panel settings-card">
        <div className="settings-card__title">
          <span><Sparkles size={21} /></span>
          <div>
            <h3>Watermark (Logo siêu to dưới nền)</h3>
            <p>Độ mờ, kích thước và vị trí của logo huy hiệu</p>
          </div>
        </div>
        <div className="settings-lines">
          <div>
            <span>Độ đậm (Opacity)</span>
            <input
              type="range" min="0" max="12"
              value={draft.watermarkOpacity}
              onChange={(e) => setDraft({ ...draft, watermarkOpacity: Number(e.target.value) })}
            />
            <strong>{draft.watermarkOpacity}%</strong>
          </div>
          <div>
            <span>Kích thước (Size)</span>
            <input
              type="range" min="55" max="112"
              value={draft.watermarkSize}
              onChange={(e) => setDraft({ ...draft, watermarkSize: Number(e.target.value) })}
            />
            <strong>{draft.watermarkSize}vh</strong>
          </div>
          <div>
            <span>Vị trí dọc (Y-Offset)</span>
            <input
              type="range" min="-65" max="-25"
              value={draft.watermarkOffsetY}
              onChange={(e) => setDraft({ ...draft, watermarkOffsetY: Number(e.target.value) })}
            />
            <strong>{draft.watermarkOffsetY}%</strong>
          </div>
        </div>
      </section>

      <section className="panel settings-card">
        <div className="settings-card__title">
          <span><Sparkles size={21} /></span>
          <div>
            <h3>Logo huy hiệu bảng đấu (Badges)</h3>
            <p>Nhập URL ảnh để thay thế logo mặc định của các bảng</p>
          </div>
        </div>
        <div className="settings-lines">
          {[
            'manager-thong-soai',
            'manager-dai-tuong',
            'manager-thu-linh',
            'leader-ky-lan',
            'leader-phuong-hoang',
            'leader-su-tu'
          ].map(boardId => {
            const preset = getRecognitionVisualPreset(boardId)
            const previewUrl = draft.boardBadges[boardId] || preset?.badgeUrl || ''
            return (
              <div key={boardId} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {previewUrl && (
                  <div style={{ width: '40px', height: '40px', flexShrink: 0, background: 'rgba(0,0,0,0.2)', borderRadius: '6px', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
                    <img src={previewUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  </div>
                )}
                <span style={{ width: '160px', opacity: 0.8, fontSize: '13px' }}>{boardId}</span>
                <input
                  type="text"
                  placeholder="Nhập link (URL) ảnh..."
                  value={draft.boardBadges[boardId] || ''}
                  onChange={(e) => setDraft({
                    ...draft,
                    boardBadges: { ...draft.boardBadges, [boardId]: e.target.value }
                  })}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', fontSize: '13px', background: 'rgba(0,0,0,0.2)' }}
                />
              </div>
            )
          })}
        </div>
      </section>

      <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
        <button className="button button--gold" onClick={handleSave} disabled={isSaving}>
          <Save size={16} /> {isSaving ? 'Đang lưu...' : 'Lưu & Áp dụng ngay'}
        </button>
        <button className="button button--secondary" onClick={handleReset} disabled={isSaving}>
          <Undo2 size={16} /> Hủy thay đổi
        </button>
      </div>
    </div>
  )
}
