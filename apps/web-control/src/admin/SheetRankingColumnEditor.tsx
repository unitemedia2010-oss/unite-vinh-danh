import { AlertTriangle, Check, RotateCcw, Save } from 'lucide-react'
import {
  managerRankingLabel,
  sameSheetRankingSelection,
  sheetRankingMode,
  teamRankingLabel,
  type ManagerRankingColumn,
  type SheetRankingSelection,
  type SheetRankingSettings,
  type TeamRankingColumn,
} from '../lib/sheetRankingSettings'

type Props = {
  settings: SheetRankingSettings | null
  draft: SheetRankingSelection | null
  loading: boolean
  saving: boolean
  error: string
  onChange: (selection: SheetRankingSelection) => void
  onReset: () => void
  onSave: () => void
}

const teamOptions: Array<{ column: TeamRankingColumn; title: string; detail: string }> = [
  { column: 'M', title: 'Tổng cọc', detail: 'Dùng đầu tháng khi GDTC chưa cập nhật đủ' },
  { column: 'O', title: 'GDTC xét Best Team', detail: 'Dùng khi kế toán đã cập nhật giao dịch thành công' },
]

const managerOptions: Array<{ column: ManagerRankingColumn; title: string; detail: string }> = [
  { column: 'K', title: 'Tổng cọc', detail: 'Dùng đầu tháng khi GDTC chưa cập nhật đủ' },
  { column: 'L', title: 'Tổng GDTC + HC', detail: 'Dùng khi kế toán đã cập nhật giao dịch thành công' },
]

export function SheetRankingColumnEditor({
  settings,
  draft,
  loading,
  saving,
  error,
  onChange,
  onReset,
  onSave,
}: Props) {
  if (loading) {
    return <div className="mapping-config mapping-config--loading">Đang đọc cột xếp hạng từ Supabase…</div>
  }
  if (!settings || !draft) {
    return (
      <div className="mapping-config mapping-config--error" role="alert">
        <AlertTriangle size={18} />
        <span>{error || 'Chưa đọc được cấu hình cột xếp hạng.'}</span>
      </div>
    )
  }

  const dirty = !sameSheetRankingSelection(settings, draft)
  const mode = sheetRankingMode(draft)
  const choosePreset = (selection: SheetRankingSelection) => onChange(selection)

  return (
    <div className="mapping-config">
      <div className="mapping-config__intro">
        <div>
          <strong>Chọn cột dùng để tính xếp hạng</strong>
          <span>Chỉ thay nguồn doanh số. Cột Bảng Đấu N/S và toàn bộ tên nhân sự vẫn giữ nguyên.</span>
        </div>
        <div className="mapping-config__presets" aria-label="Chế độ chọn nhanh">
          <button
            type="button"
            className={mode === 'deposit' ? 'active' : ''}
            onClick={() => choosePreset({ team: 'M', manager: 'K' })}
          >
            Đầu tháng <small>M + K</small>
          </button>
          <button
            type="button"
            className={mode === 'gdtc' ? 'active' : ''}
            onClick={() => choosePreset({ team: 'O', manager: 'L' })}
          >
            Chốt GDTC <small>O + L</small>
          </button>
        </div>
      </div>

      <div className="mapping-config__grid">
        <fieldset className="mapping-config__card">
          <legend>TEAM & LEADER <small>DS-TEAM</small></legend>
          <div className="mapping-config__options">
            {teamOptions.map((option) => (
              <label
                className={`mapping-column-option ${draft.team === option.column ? 'mapping-column-option--active' : ''}`}
                key={option.column}
              >
                <input
                  type="radio"
                  name="team-ranking-column"
                  value={option.column}
                  checked={draft.team === option.column}
                  onChange={() => onChange({ ...draft, team: option.column })}
                />
                <b>{option.column}</b>
                <span><strong>{option.title}</strong><small>{option.detail}</small></span>
                <Check size={17} />
              </label>
            ))}
          </div>
          <p className="mapping-config__active">Đang chọn: <strong>{teamRankingLabel(draft.team)}</strong></p>
        </fieldset>

        <fieldset className="mapping-config__card">
          <legend>QUẢN LÝ KHU VỰC <small>DS-KV</small></legend>
          <div className="mapping-config__options">
            {managerOptions.map((option) => (
              <label
                className={`mapping-column-option ${draft.manager === option.column ? 'mapping-column-option--active' : ''}`}
                key={option.column}
              >
                <input
                  type="radio"
                  name="manager-ranking-column"
                  value={option.column}
                  checked={draft.manager === option.column}
                  onChange={() => onChange({ ...draft, manager: option.column })}
                />
                <b>{option.column}</b>
                <span><strong>{option.title}</strong><small>{option.detail}</small></span>
                <Check size={17} />
              </label>
            ))}
          </div>
          <p className="mapping-config__active">Đang chọn: <strong>{managerRankingLabel(draft.manager)}</strong></p>
        </fieldset>
      </div>

      <div
        className={`mapping-config__validation mapping-config__validation--${mode}`}
        role="status"
        aria-live="polite"
      >
        {mode === 'deposit' && <><Check size={17} /><span><strong>Chế độ đầu tháng:</strong> hai bảng cùng xếp theo Tổng cọc.</span></>}
        {mode === 'gdtc' && <><Check size={17} /><span><strong>Chế độ chốt:</strong> hai bảng cùng xếp theo giao dịch thành công.</span></>}
        {mode === 'mixed' && <><AlertTriangle size={17} /><span><strong>Đang trộn hai loại số liệu.</strong> Hệ thống vẫn cho lưu nhưng đối soát tổng có thể cảnh báo chênh lệch.</span></>}
      </div>

      {error && <div className="mapping-config__error" role="alert">{error}</div>}

      <div className="mapping-config__actions">
        <span>
          {dirty
            ? 'Có thay đổi chưa lưu. Bản đang phát chưa bị ảnh hưởng.'
            : 'Cấu hình đã lưu. Lần đồng bộ kế tiếp sẽ dùng đúng lựa chọn này.'}
        </span>
        <button
          type="button"
          className="button button--secondary"
          onClick={onReset}
          disabled={!dirty || saving}
        >
          <RotateCcw size={15} /> Hủy thay đổi
        </button>
        <button
          type="button"
          className="button button--gold"
          onClick={onSave}
          disabled={!dirty || saving}
        >
          <Save size={15} /> {saving ? 'Đang lưu…' : 'Lưu lựa chọn'}
        </button>
      </div>
    </div>
  )
}
