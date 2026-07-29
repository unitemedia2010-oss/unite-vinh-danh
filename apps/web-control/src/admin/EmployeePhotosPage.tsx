import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { ImageUp, RefreshCw, Search, ShieldCheck, Trash2, UsersRound } from 'lucide-react'
import { StatusPill } from '../components/Status'
import { validateTransparentAvatarFile } from '../lib/avatarTransparency'
import {
  loadEmployeePhotoProfiles,
  removeEmployeePhoto,
  uploadEmployeePhoto,
  type EmployeePhotoProfile,
  type EmployeePhotoRole,
} from '../lib/employeePhotoRepository'
import { isSupabaseConfigured } from '../lib/supabase'

type Filter = 'all' | EmployeePhotoRole | 'missing'

const roleLabel = (role: EmployeePhotoRole) => role === 'branch_manager' ? 'QLCN' : 'LEADER'

const initials = (name: string) => name
  .trim()
  .split(/\s+/)
  .slice(-2)
  .map((part) => part[0]?.toUpperCase() ?? '')
  .join('')

const periodLabel = (periodId: string | null) => {
  const match = periodId?.match(/^(\d{4})-(\d{2})$/)
  return match ? `Tháng ${Number(match[2])}/${match[1]}` : 'lô Sheet mới nhất'
}

export function EmployeePhotosPage({ notify }: { notify: (message: string) => void }) {
  const [profiles, setProfiles] = useState<EmployeePhotoProfile[]>([])
  const [periodId, setPeriodId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [busyCode, setBusyCode] = useState('')
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [loadError, setLoadError] = useState('')

  const refresh = async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      setLoadError('Chưa cấu hình Supabase trong .env.local.')
      return
    }
    setLoading(true)
    try {
      const result = await loadEmployeePhotoProfiles()
      setProfiles(result.profiles)
      setPeriodId(result.periodId)
      setLoadError('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const visibleProfiles = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('vi')
    return profiles.filter((profile) => {
      if (filter === 'missing' && profile.photoPath) return false
      if (filter === 'branch_manager' && !profile.roles.includes('branch_manager')) return false
      if (filter === 'leader' && !profile.roles.includes('leader')) return false
      if (!search) return true
      return [profile.employeeCode, profile.fullName, ...profile.branchCodes, ...profile.teamCodes]
        .join(' ')
        .toLocaleLowerCase('vi')
        .includes(search)
    })
  }, [filter, profiles, query])

  const updateProfile = (next: EmployeePhotoProfile) => {
    setProfiles((current) => current.map((profile) =>
      profile.employeeCode === next.employeeCode ? next : profile,
    ))
  }

  const choosePhoto = async (
    profile: EmployeePhotoProfile,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusyCode(profile.employeeCode)
    try {
      const dimensions = await validateTransparentAvatarFile(file)
      const result = await uploadEmployeePhoto(profile, file)
      updateProfile(result.profile)
      const warning = result.warning ? ' Ảnh đã lưu nhưng snapshot Admin chưa cập nhật được.' : ''
      notify(`Đã lưu ảnh ${profile.fullName} (${dimensions.width} × ${dimensions.height}px). TV nhận ảnh ở lần tải manifest kế tiếp.${warning}`)
    } catch (error) {
      notify(`Không thể tải ảnh: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusyCode('')
    }
  }

  const removePhoto = async (profile: EmployeePhotoProfile) => {
    if (!profile.photoPath) return
    if (!window.confirm(`Gỡ ảnh hiện tại của ${profile.fullName} (${profile.employeeCode})?`)) return
    setBusyCode(profile.employeeCode)
    try {
      const result = await removeEmployeePhoto(profile)
      updateProfile(result.profile)
      const warning = result.warning ? ' Snapshot Admin chưa cập nhật được.' : ''
      notify(`Đã gỡ ảnh ${profile.fullName}. TV sẽ trở về avatar chữ ở lần tải kế tiếp.${warning}`)
    } catch (error) {
      notify(`Không thể gỡ ảnh: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusyCode('')
    }
  }

  const countWithPhoto = profiles.filter((profile) => profile.photoPath).length
  const countManagers = profiles.filter((profile) => profile.roles.includes('branch_manager')).length
  const countLeaders = profiles.filter((profile) => profile.roles.includes('leader')).length

  return (
    <>
      <section className="photo-guide panel">
        <div className="photo-guide__icon"><ImageUp size={27} /></div>
        <div className="photo-guide__copy">
          <span>ẢNH NHÂN SỰ THEO MNV</span>
          <h2>PNG/WebP nền trong suốt cho Leader và QLCN</h2>
          <p>Mỗi MNV chỉ có một ảnh chuẩn. Ảnh mới áp dụng cho release đang phát ở lần TV lấy manifest kế tiếp và được giữ cho các lần đồng bộ Sheet sau.</p>
        </div>
        <div className="photo-guide__rules">
          <strong><ShieldCheck size={16} /> App kiểm tra nền trong suốt</strong>
          <span>Tối đa 20 MB · 4096 × 4096 px</span>
          <span>Không nhận JPG có nền liền</span>
        </div>
      </section>

      <section className="photo-stats">
        <div><small>HỒ SƠ TỪ {periodLabel(periodId).toUpperCase()}</small><strong>{profiles.length}</strong><span>nhân sự theo MNV</span></div>
        <div><small>QUẢN LÝ CHI NHÁNH</small><strong>{countManagers}</strong><span>QLCN trong Sheet</span></div>
        <div><small>LEADER</small><strong>{countLeaders}</strong><span>Leader trong Sheet</span></div>
        <div><small>ĐÃ CÓ ẢNH</small><strong>{countWithPhoto}/{profiles.length}</strong><span>ảnh sẵn sàng lên TV</span></div>
      </section>

      <section className="panel photo-manager">
        <div className="photo-manager__toolbar">
          <div className="photo-filter" role="group" aria-label="Lọc nhân sự">
            {([
              ['all', 'Tất cả'],
              ['branch_manager', 'QLCN'],
              ['leader', 'Leader'],
              ['missing', 'Chưa có ảnh'],
            ] as const).map(([value, label]) => (
              <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>
            ))}
          </div>
          <label className="photo-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên, MNV, Team, khu vực…" /></label>
          <button className="button button--secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} /> Tải lại</button>
        </div>

        {loadError && <div className="photo-state photo-state--error"><UsersRound size={28} /><strong>Chưa tải được danh sách nhân sự</strong><span>{loadError}</span></div>}
        {!loadError && loading && <div className="photo-state"><RefreshCw className="spin" size={28} /><strong>Đang đọc MNV từ lô Sheet mới nhất…</strong></div>}
        {!loadError && !loading && !visibleProfiles.length && <div className="photo-state"><UsersRound size={28} /><strong>Không có nhân sự phù hợp bộ lọc</strong><span>Danh sách chỉ lấy QLCN và Leader có MNV trong lô Sheet mới nhất.</span></div>}

        {!loadError && !loading && visibleProfiles.length > 0 && <div className="photo-profile-grid">
          {visibleProfiles.map((profile) => {
            const busy = busyCode === profile.employeeCode
            return (
              <article className="photo-profile" key={profile.employeeCode}>
                <div className={`photo-profile__preview ${profile.photoUrl ? 'has-photo' : ''}`}>
                  {profile.photoUrl ? <img src={profile.photoUrl} alt={`Ảnh ${profile.fullName}`} /> : <span>{initials(profile.fullName)}</span>}
                  <StatusPill tone={profile.photoPath ? 'success' : 'warning'}>{profile.photoPath ? 'ĐÃ CÓ ẢNH' : 'CHƯA CÓ ẢNH'}</StatusPill>
                </div>
                <div className="photo-profile__body">
                  <div className="photo-profile__identity"><strong>{profile.fullName}</strong><code>{profile.employeeCode}</code></div>
                  <div className="photo-profile__roles">{profile.roles.map((role) => <span key={role}>{roleLabel(role)}</span>)}</div>
                  <dl>
                    <div><dt>Khu vực</dt><dd>{profile.branchCodes.join(' · ') || '—'}</dd></div>
                    <div><dt>Team</dt><dd>{profile.teamCodes.join(' · ') || '—'}</dd></div>
                    <div><dt>Cấp bậc</dt><dd>{profile.roleCodes.join(' · ') || '—'}</dd></div>
                  </dl>
                  <div className="photo-profile__actions">
                    <label className={`button button--gold ${busy ? 'is-disabled' : ''}`}>
                      <ImageUp size={16} /> {busy ? 'Đang xử lý…' : profile.photoPath ? 'Thay ảnh' : 'Tải ảnh'}
                      <input type="file" accept="image/png,image/webp" disabled={busy} onChange={(event) => void choosePhoto(profile, event)} />
                    </label>
                    {profile.photoPath && <button className="button button--danger" disabled={busy} onClick={() => void removePhoto(profile)}><Trash2 size={15} /> Gỡ ảnh</button>}
                  </div>
                </div>
              </article>
            )
          })}
        </div>}
      </section>
    </>
  )
}
