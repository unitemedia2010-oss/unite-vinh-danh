import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from './supabase'

export type EmployeePhotoRole = 'branch_manager' | 'leader'

export type EmployeePhotoProfile = {
  employeeCode: string
  fullName: string
  roles: EmployeePhotoRole[]
  branchCodes: string[]
  teamCodes: string[]
  roleCodes: string[]
  photoPath: string | null
  photoUrl: string | null
}

type ImportRow = {
  entity_type: 'branch_manager' | 'team'
  entity_code: string | null
  display_name: string | null
  branch_code: string | null
  team_code: string | null
  role_code: string | null
}

type EmployeeRow = {
  employee_code: string
  full_name: string
  role_code: string | null
  photo_path: string | null
  metadata: unknown
}

const normalizeCode = (value: string | null | undefined) => value?.trim().toUpperCase() ?? ''

const requireSession = async () => {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase chưa được cấu hình.')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) {
    throw error || new Error('Admin cần đăng nhập để quản lý ảnh nhân sự.')
  }
  return { supabase, userId: data.session.user.id }
}

const signPhotoPaths = async (
  supabase: SupabaseClient,
  paths: string[],
): Promise<Map<string, string>> => {
  const uniquePaths = [...new Set(paths.filter(Boolean))]
  if (!uniquePaths.length) return new Map()
  const { data, error } = await supabase.storage
    .from('employee-photos')
    .createSignedUrls(uniquePaths, 60 * 60)
  if (error) throw error
  const signedUrls = new Map<string, string>()
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) signedUrls.set(item.path, item.signedUrl)
  }
  return signedUrls
}

const addUnique = (values: string[], value: string | null) => {
  const normalized = value?.trim()
  if (normalized && !values.includes(normalized)) values.push(normalized)
}

export async function loadEmployeePhotoProfiles(): Promise<{
  periodId: string | null
  profiles: EmployeePhotoProfile[]
}> {
  const { supabase } = await requireSession()
  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .select('id,period_id')
    .in('status', ['imported', 'needs_review', 'validated'])
    .order('imported_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (batchError) throw batchError
  if (!batch) return { periodId: null, profiles: [] }

  const { data: importData, error: importError } = await supabase
    .from('import_rows')
    .select('entity_type,entity_code,display_name,branch_code,team_code,role_code')
    .eq('batch_id', batch.id)
    .in('entity_type', ['branch_manager', 'team'])
    .order('source_row_number', { ascending: true })
  if (importError) throw importError

  const profilesByCode = new Map<string, EmployeePhotoProfile>()
  for (const row of (importData ?? []) as ImportRow[]) {
    const employeeCode = normalizeCode(row.entity_code)
    if (!employeeCode || !row.display_name?.trim()) continue
    const role: EmployeePhotoRole = row.entity_type === 'branch_manager' ? 'branch_manager' : 'leader'
    const current = profilesByCode.get(employeeCode) ?? {
      employeeCode,
      fullName: row.display_name.trim(),
      roles: [],
      branchCodes: [],
      teamCodes: [],
      roleCodes: [],
      photoPath: null,
      photoUrl: null,
    }
    if (!current.roles.includes(role)) current.roles.push(role)
    addUnique(current.branchCodes, row.branch_code)
    addUnique(current.teamCodes, row.team_code)
    addUnique(current.roleCodes, row.role_code)
    profilesByCode.set(employeeCode, current)
  }

  const employeeCodes = [...profilesByCode.keys()]
  if (!employeeCodes.length) return { periodId: batch.period_id, profiles: [] }
  const { data: employeeData, error: employeeError } = await supabase
    .from('employees')
    .select('employee_code,full_name,role_code,photo_path,metadata')
    .in('employee_code', employeeCodes)
  if (employeeError) throw employeeError

  for (const employee of (employeeData ?? []) as EmployeeRow[]) {
    const current = profilesByCode.get(normalizeCode(employee.employee_code))
    if (!current) continue
    current.photoPath = employee.photo_path?.trim() || null
  }
  const photoUrls = await signPhotoPaths(
    supabase,
    [...profilesByCode.values()].flatMap((profile) => profile.photoPath ? [profile.photoPath] : []),
  )
  for (const profile of profilesByCode.values()) {
    profile.photoUrl = profile.photoPath ? photoUrls.get(profile.photoPath) ?? null : null
  }

  return {
    periodId: batch.period_id,
    profiles: [...profilesByCode.values()].sort((left, right) => {
      const leftManager = left.roles.includes('branch_manager') ? 0 : 1
      const rightManager = right.roles.includes('branch_manager') ? 0 : 1
      return leftManager - rightManager || left.fullName.localeCompare(right.fullName, 'vi')
    }),
  }
}

const updateCurrentAwardPhotos = async (
  supabase: SupabaseClient,
  employeeCode: string,
  photoPath: string | null,
) => {
  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .select('id')
    .eq('status', 'validated')
    .order('imported_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (batchError) return batchError.message
  if (!batch?.id) return null

  const { error } = await supabase
    .from('award_results')
    .update({ photo_path: photoPath })
    .eq('batch_id', batch.id)
    .eq('entity_code', employeeCode)
    .in('entity_type', ['branch_manager', 'leader'])
  return error?.message ?? null
}

const writeAudit = async (
  supabase: SupabaseClient,
  userId: string,
  profile: EmployeePhotoProfile,
  oldPath: string | null,
  nextPath: string | null,
) => {
  await supabase.from('audit_logs').insert({
    actor_id: userId,
    action: nextPath ? 'employee.photo.upload' : 'employee.photo.remove',
    entity_type: 'employee',
    entity_id: profile.employeeCode,
    before_data: { photo_path: oldPath },
    after_data: { photo_path: nextPath },
    metadata: { roles: profile.roles, source: 'admin_employee_photos' },
  })
}

export async function uploadEmployeePhoto(
  profile: EmployeePhotoProfile,
  file: File,
): Promise<{ profile: EmployeePhotoProfile; warning: string | null }> {
  const { supabase, userId } = await requireSession()
  const { data: existing, error: existingError } = await supabase
    .from('employees')
    .select('role_code,photo_path')
    .eq('employee_code', profile.employeeCode)
    .maybeSingle()
  if (existingError) throw existingError
  const oldPath = existing?.photo_path?.trim() || profile.photoPath
  const extension = file.type === 'image/webp' ? 'webp' : 'png'
  const path = `avatars/${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await supabase.storage
    .from('employee-photos')
    .upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false })
  if (uploadError) throw uploadError

  const { data: signed, error: signedError } = await supabase.storage
    .from('employee-photos')
    .createSignedUrl(path, 60 * 60)
  if (signedError) {
    await supabase.storage.from('employee-photos').remove([path])
    throw signedError
  }

  const roleCode = existing?.role_code || (profile.roles.includes('branch_manager') ? 'QLCN' : 'LEADER')
  const { error: employeeError } = await supabase.from('employees').upsert({
    employee_code: profile.employeeCode,
    full_name: profile.fullName,
    role_code: roleCode,
    photo_path: path,
    is_active: true,
  }, { onConflict: 'employee_code' })
  if (employeeError) {
    await supabase.storage.from('employee-photos').remove([path])
    throw employeeError
  }

  const awardWarning = await updateCurrentAwardPhotos(supabase, profile.employeeCode, path)
  let cleanupWarning: string | null = null
  if (oldPath && oldPath !== path) {
    const { error } = await supabase.storage.from('employee-photos').remove([oldPath])
    cleanupWarning = error ? `Không xóa được ảnh cũ: ${error.message}` : null
  }
  await writeAudit(supabase, userId, profile, oldPath, path)
  return {
    profile: { ...profile, photoPath: path, photoUrl: signed.signedUrl },
    warning: [awardWarning, cleanupWarning].filter(Boolean).join(' ') || null,
  }
}

export async function downloadEmployeePhoto(profile: EmployeePhotoProfile): Promise<File> {
  if (!profile.photoPath) throw new Error(`Nhân sự ${profile.employeeCode} chưa có ảnh.`)
  const { supabase } = await requireSession()
  const { data, error } = await supabase.storage
    .from('employee-photos')
    .download(profile.photoPath)
  if (error) throw error
  const type = data.type || (profile.photoPath.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/png')
  const extension = type === 'image/webp' ? 'webp' : 'png'
  return new File([data], `${profile.employeeCode}.${extension}`, {
    type,
    lastModified: Date.now(),
  })
}

export async function removeEmployeePhoto(
  profile: EmployeePhotoProfile,
): Promise<{ profile: EmployeePhotoProfile; warning: string | null }> {
  const { supabase, userId } = await requireSession()
  const { error: employeeError } = await supabase
    .from('employees')
    .update({ photo_path: null })
    .eq('employee_code', profile.employeeCode)
  if (employeeError) throw employeeError

  const awardWarning = await updateCurrentAwardPhotos(supabase, profile.employeeCode, null)
  let cleanupWarning: string | null = null
  if (profile.photoPath) {
    const { error } = await supabase.storage.from('employee-photos').remove([profile.photoPath])
    cleanupWarning = error ? `Không xóa được file ảnh: ${error.message}` : null
  }
  await writeAudit(supabase, userId, profile, profile.photoPath, null)
  return {
    profile: { ...profile, photoPath: null, photoUrl: null },
    warning: [awardWarning, cleanupWarning].filter(Boolean).join(' ') || null,
  }
}
