import type { Board, Branch, Honoree, ImportRun, PlaylistItem, Release } from '../types'

export const demoMeta = {
  month: '08',
  year: '2026',
  period: '08/2026',
  release: 'R08.1',
  nextRelease: 'R08.2',
  snapshotDate: '28/08/2026',
  schedule: '01/08 — 31/08/2026',
} as const

const people: Honoree[] = [
  { rank: 1, name: 'Nguyễn Thị Minh Anh', shortName: 'Minh Anh', role: 'Sales', team: 'Team ZENITH', branch: '125 Trần Bình Trọng', revenue: 0, accent: '#f2c75c', initials: 'MA' },
  { rank: 2, name: 'Trần Quốc Bảo', shortName: 'Quốc Bảo', role: 'Sales', team: 'Team MONEY', branch: 'Chi nhánh 02', revenue: 0, accent: '#b8c7dc', initials: 'QB' },
  { rank: 3, name: 'Lê Hoàng Ngân', shortName: 'Hoàng Ngân', role: 'Sales', team: 'Team THE KEY', branch: '683 Âu Cơ Tân Phú', revenue: 0, accent: '#d59a68', initials: 'HN' },
  { rank: 4, name: 'Phạm Gia Hân', shortName: 'Gia Hân', role: 'Sales', team: 'Team IRON HEART', branch: '125 Trần Bình Trọng', revenue: 0, accent: '#9fd8c8', initials: 'GH' },
  { rank: 5, name: 'Võ Thành Đạt', shortName: 'Thành Đạt', role: 'Sales', team: 'Team FUSION', branch: 'Chi nhánh 04', revenue: 0, accent: '#8db5df', initials: 'TĐ' },
  { rank: 6, name: 'Đặng Bảo Trâm', shortName: 'Bảo Trâm', role: 'Sales', team: 'Team FLASH', branch: 'Chi nhánh 05', revenue: 0, accent: '#d0a8dc', initials: 'BT' },
  { rank: 7, name: 'Bùi Minh Khôi', shortName: 'Minh Khôi', role: 'Sales', team: 'Team IMMORTALS', branch: 'Chi nhánh 06', revenue: 0, accent: '#ef9d91', initials: 'MK' },
  { rank: 8, name: 'Huỳnh Thanh Vy', shortName: 'Thanh Vy', role: 'Sales', team: 'Team DOMINANT', branch: 'Chi nhánh 07', revenue: 0, accent: '#c1d986', initials: 'TV' },
  { rank: 9, name: 'Ngô Anh Tuấn', shortName: 'Anh Tuấn', role: 'Sales', team: 'Team THE BEST', branch: 'Chi nhánh 08', revenue: 0, accent: '#f0b78b', initials: 'AT' },
  { rank: 10, name: 'Đỗ Ngọc Mai', shortName: 'Ngọc Mai', role: 'Sales', team: 'Team LEGACY', branch: '683 Âu Cơ Tân Phú', revenue: 0, accent: '#99cde1', initials: 'NM' },
]

const rankPeople = (source: Honoree[], revenues: number[], role: string) =>
  source.map((person, index) => ({ ...person, rank: index + 1, role, revenue: revenues[index] }))

const rankNamedPeople = (names: string[], revenues: number[], role: string, offset = 0) =>
  names.map((name, index) => {
    const template = people[(index + offset) % people.length]
    const words = name.trim().split(/\s+/)
    return {
      ...template,
      rank: index + 1,
      name,
      shortName: words.slice(-2).join(' '),
      role,
      revenue: revenues[index],
      initials: words.map((word) => word[0]).slice(-2).join('').toUpperCase(),
    }
  })

const managerThongSoaiPeople: Honoree[] = [
  { ...people[0], rank: 1, name: 'Lê Thanh Hà', shortName: 'Thanh Hà', role: 'QLCN demo · U803', team: 'Khu vực DOC1 + DFC', branch: 'DOC1 + DFC', revenue: 685500000, initials: 'TH' },
  { ...people[1], rank: 2, name: 'Trần Minh Đức', shortName: 'Minh Đức', role: 'QLCN demo · U802', team: 'Khu vực CTC', branch: 'CTC', revenue: 612350000, initials: 'MĐ' },
  { ...people[2], rank: 3, name: 'Nguyễn Quỳnh Anh', shortName: 'Quỳnh Anh', role: 'QLCN demo · U801', team: 'Khu vực ATC', branch: 'ATC', revenue: 548200000, initials: 'QA' },
]

const managerDaiTuongPeople: Honoree[] = [
  { ...people[3], rank: 1, name: 'Phạm Hải Yến', shortName: 'Hải Yến', role: 'QLCN demo · U804', team: 'Khu vực BTC1', branch: 'BTC1', revenue: 486750000, initials: 'HY' },
  { ...people[4], rank: 2, name: 'Võ Hoàng Long', shortName: 'Hoàng Long', role: 'QLCN demo · U805', team: 'Khu vực TBC', branch: 'TBC', revenue: 421300000, initials: 'HL' },
  { ...people[5], rank: 3, name: 'Bùi Thùy Trang', shortName: 'Thùy Trang', role: 'QLCN demo · U806', team: 'Khu vực MVC', branch: 'MVC', revenue: 356800000, initials: 'TT' },
]

const managerThuLinhPeople: Honoree[] = [
  { ...people[6], rank: 1, name: 'Đặng Ngọc Anh', shortName: 'Ngọc Anh', role: 'QLCN demo · U807', team: 'Khu vực TBC2', branch: 'TBC2', revenue: 298500000, initials: 'NA' },
  { ...people[7], rank: 2, name: 'Huỳnh Quốc Khánh', shortName: 'Quốc Khánh', role: 'QLCN demo · U808', team: 'Khu vực DOC2', branch: 'DOC2', revenue: 248200000, initials: 'QK' },
  { ...people[8], rank: 3, name: 'Ngô Phương Linh', shortName: 'Phương Linh', role: 'QLCN demo · U809', team: 'Khu vực Tân Phú', branch: 'Tân Phú', revenue: 186800000, initials: 'PL' },
]

const leaderKyLanPeople = rankPeople(
  people,
  [356000000, 332500000, 289800000, 268200000, 248600000, 236400000, 224900000, 216300000, 208700000, 201500000],
  'Leader · Kỳ Lân',
)

const leaderPhuongHoangPeople = rankNamedPeople(
  ['Nguyễn Khánh Linh', 'Trần Hoàng Phúc', 'Lê Tú Uyên', 'Phạm Đức Anh', 'Võ Thanh Lam', 'Bùi Quỳnh Như', 'Đặng Hải Nam', 'Huỳnh Ngọc Hân', 'Ngô Minh Triết', 'Đỗ Gia Bảo'],
  [198500000, 191200000, 184800000, 176400000, 168700000, 157900000, 146200000, 133500000, 119800000, 102600000],
  'Leader · Phượng Hoàng',
  2,
)

const leaderSuTuPeople = rankNamedPeople(
  ['Nguyễn Thiên An', 'Trần Mỹ Duyên', 'Lê Quốc Huy', 'Phạm Thanh Thảo', 'Võ Nhật Minh', 'Bùi Hà My', 'Đặng Trung Kiên', 'Huỳnh Thảo Nhi', 'Ngô Tuấn Khang', 'Đỗ Kim Ngân'],
  [98500000, 94200000, 89700000, 85400000, 80600000, 74900000, 69300000, 63800000, 57600000, 51200000],
  'Leader · Sư Tử',
  4,
)

const saleFulltimePeople = rankNamedPeople(
  ['Nguyễn Yến Nhi', 'Trần Anh Khoa', 'Lê Minh Thư', 'Phạm Gia Huy', 'Võ Bảo Ngọc', 'Bùi Hoàng Long', 'Đặng Phương Vy', 'Huỳnh Đức Thịnh', 'Ngô Mai Anh', 'Đỗ Quốc Việt'],
  [246800000, 228400000, 213700000, 196400000, 181000000, 172700000, 168900000, 162000000, 156000000, 149800000],
  'Sales Full-time',
  1,
)

const saleParttimePeople = rankNamedPeople(
  ['Nguyễn Hồng Nhung', 'Trần Nhật Quang', 'Lê Khánh An', 'Phạm Tuệ Mẫn', 'Võ Công Thành', 'Bùi Ngọc Diệp', 'Đặng Quang Huy', 'Huỳnh Thùy Linh', 'Ngô Bảo Châu', 'Đỗ Minh Tâm'],
  [188000000, 179300000, 171000000, 162500000, 154200000, 146800000, 138100000, 129400000, 117900000, 103200000],
  'Sales Part-time',
  6,
)

const teamPeople: Honoree[] = [
  { ...people[0], rank: 1, name: 'ZENITH', shortName: 'ZENITH', role: 'Leader · Nguyễn Thị Cẩm Giang · U553', team: 'CTC · Nguyễn Thị Cẩm Giang', branch: 'CTC', revenue: 198400000, initials: 'ZE' },
  { ...people[1], rank: 2, name: 'MONEY', shortName: 'MONEY', role: 'Leader · Trần Xuân Hoa · U966', team: 'TBC · Trần Xuân Hoa', branch: 'TBC', revenue: 184700000, initials: 'MO' },
  { ...people[2], rank: 3, name: 'FUSION', shortName: 'FUSION', role: 'Leader · Phạm Vũ Thư · U382', team: 'DOC1 · Phạm Vũ Thư', branch: 'DOC1', revenue: 172600000, initials: 'FU' },
  { ...people[3], rank: 4, name: 'THE KEY', shortName: 'THE KEY', role: 'Leader · Hoàng Mạnh Đoàn · U351', team: 'BTC1 · Hoàng Mạnh Đoàn', branch: 'BTC1', revenue: 159800000, initials: 'TK' },
  { ...people[4], rank: 5, name: 'IRON HEART', shortName: 'IRON HEART', role: 'Leader · Đồng Tiến Quân · U884', team: 'ATC · Đồng Tiến Quân', branch: 'ATC', revenue: 148300000, initials: 'IH' },
  { ...people[5], rank: 6, name: 'FLASH', shortName: 'FLASH', role: 'Leader · Lê Hoài Nam · U667', team: 'ATC · Lê Hoài Nam', branch: 'ATC', revenue: 136900000, initials: 'FL' },
  { ...people[6], rank: 7, name: 'IMMORTALS', shortName: 'IMMORTALS', role: 'Leader · Võ Vy Tường · U430', team: 'MVC · Võ Vy Tường', branch: 'MVC', revenue: 124500000, initials: 'IM' },
  { ...people[7], rank: 8, name: 'DOMINANT', shortName: 'DOMINANT', role: 'Leader · Nguyễn Thị Thùy Dung · U930', team: 'TSC · Nguyễn Thị Thùy Dung', branch: 'TSC', revenue: 112700000, initials: 'DO' },
  { ...people[8], rank: 9, name: 'THE BEST', shortName: 'THE BEST', role: 'Leader · Nguyễn Đức Duy · U1715', team: 'ATC · Nguyễn Đức Duy', branch: 'ATC', revenue: 101300000, initials: 'TB' },
  { ...people[9], rank: 10, name: 'LEGACY', shortName: 'LEGACY', role: 'Leader · Trương Chí Khanh · U1275', team: 'ATC · Trương Chí Khanh', branch: 'ATC', revenue: 93600000, initials: 'LE' },
]

export const boards: Board[] = [
  { id: 'manager-thong-soai', group: 'manager', title: 'Thống Soái', subtitle: 'Quản lý chi nhánh xuất sắc', threshold: 'Từ 500 triệu trở lên', sourceRange: 'DEMO T08 · DS-TEAM + DS-KV · GDTC XÉT BEST TEAM', honorees: managerThongSoaiPeople },
  { id: 'manager-dai-tuong', group: 'manager', title: 'Đại Tướng', subtitle: 'Quản lý chi nhánh bứt phá', threshold: 'Từ 300 đến dưới 500 triệu', sourceRange: 'DEMO T08 · DS-TEAM + DS-KV · GDTC XÉT BEST TEAM', honorees: managerDaiTuongPeople },
  { id: 'manager-thu-linh', group: 'manager', title: 'Thủ Lĩnh', subtitle: 'Quản lý chi nhánh tiềm năng', threshold: 'Từ 0 đến dưới 300 triệu', sourceRange: 'DEMO T08 · DS-TEAM + DS-KV · GDTC XÉT BEST TEAM', honorees: managerThuLinhPeople },
  { id: 'leader-ky-lan', group: 'leader', title: 'Kỳ Lân', subtitle: 'Leader dẫn đầu doanh số', threshold: 'Từ 200 triệu trở lên', sourceRange: 'DEMO T08 · ngưỡng Leader đã kiểm tra', honorees: leaderKyLanPeople },
  { id: 'leader-phuong-hoang', group: 'leader', title: 'Phượng Hoàng', subtitle: 'Leader tăng trưởng nổi bật', threshold: 'Từ 100 đến dưới 200 triệu', sourceRange: 'DEMO T08 · ngưỡng Leader đã kiểm tra', honorees: leaderPhuongHoangPeople },
  { id: 'leader-su-tu', group: 'leader', title: 'Sư Tử', subtitle: 'Leader chinh phục mục tiêu', threshold: 'Từ 50 đến dưới 100 triệu', sourceRange: 'DEMO T08 · ngưỡng Leader đã kiểm tra', honorees: leaderSuTuPeople },
  { id: 'sale-fulltime', group: 'fulltime', title: 'Chiến Binh Toàn Thời Gian', subtitle: 'Top Sales Full-time', threshold: 'Top 10 theo Sheet kế toán', sourceRange: 'DEMO T08 · Top 10 Sales Full-time', honorees: saleFulltimePeople },
  { id: 'sale-parttime', group: 'parttime', title: 'Ngôi Sao Bán Thời Gian', subtitle: 'Top Sales Part-time', threshold: 'Top 10 theo Sheet kế toán', sourceRange: 'DEMO T08 · Top 10 Sales Part-time', honorees: saleParttimePeople },
  { id: 'team-ranking', group: 'team', title: 'Đội Nhóm Vàng', subtitle: 'Top Team toàn hệ thống', threshold: 'Top 10 theo GDTC XÉT BEST TEAM', sourceRange: 'DEMO T08 · tên Team từ ảnh sổ tay · GDTC XÉT BEST TEAM', honorees: teamPeople },
]

export const branches: Branch[] = [
  { id: 'br-01', code: 'CN01', name: 'Chi nhánh chính', address: '125 Trần Bình Trọng', deviceName: 'TV Sảnh chính · 125 TBT', platform: 'Web Player · Chrome', health: 'online', lastSeen: 'Vừa xong', release: 'R08.1', ready: true, pilot: true },
  { id: 'br-02', code: 'CN02', name: 'Chi nhánh 02', address: 'Địa chỉ chờ Admin xác nhận', deviceName: 'Google TV · CN02', platform: 'Android TV 12', health: 'online', lastSeen: '12 giây trước', release: 'R08.1', ready: true },
  { id: 'br-03', code: 'CN03', name: 'Chi nhánh 03', address: 'Địa chỉ chờ Admin xác nhận', deviceName: 'Android Box · CN03', platform: 'Android TV 11', health: 'online', lastSeen: '18 giây trước', release: 'R08.1', ready: true },
  { id: 'br-04', code: 'CN04', name: 'Chi nhánh 04', address: 'Địa chỉ chờ Admin xác nhận', deviceName: 'Google TV · CN04', platform: 'Android TV 12', health: 'online', lastSeen: '25 giây trước', release: 'R08.1', ready: true },
  { id: 'br-05', code: 'CN05', name: 'Chi nhánh 05', address: 'Địa chỉ chờ Admin xác nhận', deviceName: 'TV Sảnh · CN05', platform: 'Android TV 10', health: 'warning', lastSeen: '7 phút trước', release: 'R08.0', ready: false },
  { id: 'br-06', code: 'CN06', name: 'Chi nhánh 06', address: 'Địa chỉ chờ Admin xác nhận', deviceName: 'Android Box · CN06', platform: 'Android TV 11', health: 'online', lastSeen: '9 giây trước', release: 'R08.1', ready: true },
  { id: 'br-07', code: 'CN07', name: 'Chi nhánh 07', address: 'Địa chỉ chờ Admin xác nhận', deviceName: 'Google TV · CN07', platform: 'Android TV 12', health: 'online', lastSeen: '15 giây trước', release: 'R08.1', ready: true },
  { id: 'br-08', code: 'CN08', name: 'Chi nhánh 08', address: 'Địa chỉ chờ Admin xác nhận', deviceName: 'TV Lễ tân · CN08', platform: 'Web Player · Chrome', health: 'offline', lastSeen: '2 giờ trước', release: 'R07.2', ready: false },
  { id: 'br-09', code: 'CN09', name: 'Chi nhánh Tân Phú', address: '683 Âu Cơ Tân Phú', deviceName: 'Google TV · Âu Cơ', platform: 'Android TV 12', health: 'online', lastSeen: '20 giây trước', release: 'R08.1', ready: true },
]

export const playlist: PlaylistItem[] = [
  { id: 'pl-01', boardId: 'manager-thong-soai', title: 'QLCN · Thống Soái', kind: 'recognition', meta: 'Top 1–3 · Từ 500 triệu', duration: 14, enabled: true, audience: 'Toàn hệ thống' },
  { id: 'pl-02', boardId: 'manager-dai-tuong', title: 'QLCN · Đại Tướng', kind: 'recognition', meta: 'Top 1–3 · 300–499 triệu', duration: 14, enabled: true, audience: 'Toàn hệ thống' },
  { id: 'pl-03', boardId: 'manager-thu-linh', title: 'QLCN · Thủ Lĩnh', kind: 'recognition', meta: 'Top 1–3 · Dưới 300 triệu', duration: 14, enabled: true, audience: 'Toàn hệ thống' },
  { id: 'pl-04', boardId: 'leader-ky-lan', title: 'Leader · Kỳ Lân', kind: 'recognition', meta: 'Top 10 · Từ 200 triệu', duration: 18, enabled: true, audience: 'Toàn hệ thống' },
  { id: 'pl-05', boardId: 'leader-phuong-hoang', title: 'Leader · Phượng Hoàng', kind: 'recognition', meta: 'Top 10 · 100–199 triệu', duration: 18, enabled: true, audience: 'Toàn hệ thống' },
  { id: 'pl-06', boardId: 'leader-su-tu', title: 'Leader · Sư Tử', kind: 'recognition', meta: 'Top 10 · 50–99 triệu', duration: 18, enabled: true, audience: 'Toàn hệ thống' },
  { id: 'pl-07', boardId: 'sale-fulltime', title: 'Sales Full-time', kind: 'recognition', meta: 'Top 10 tháng 08/2026', duration: 18, enabled: true, audience: 'Toàn hệ thống' },
  { id: 'pl-08', boardId: 'sale-parttime', title: 'Sales Part-time', kind: 'recognition', meta: 'Top 10 tháng 08/2026', duration: 18, enabled: true, audience: 'Toàn hệ thống' },
  { id: 'pl-09', boardId: 'team-ranking', title: 'Team · Đội Nhóm Vàng', kind: 'recognition', meta: 'Top 10 · GDTC XÉT BEST TEAM', duration: 18, enabled: true, audience: 'Toàn hệ thống' },
  { id: 'pl-10', title: 'Unite Weekly · Số 32', kind: 'video', meta: 'MP4 · H.264 · Có âm thanh', duration: 42, enabled: true, audience: 'Toàn hệ thống' },
  { id: 'pl-11', title: 'Kick-off tháng 08', kind: 'event', meta: '08/08 · 08:00 · Hội trường chính', duration: 14, enabled: true, audience: 'Toàn hệ thống' },
  { id: 'pl-12', title: 'Việc cần làm hôm nay', kind: 'announcement', meta: 'Nội dung riêng từng chi nhánh', duration: 14, enabled: true, audience: 'Theo chi nhánh' },
]

export const importRuns: ImportRun[] = [
  { id: 'DEMO-0826-01', createdAt: '23/07/2026 · 15:30', period: '08/2026', state: 'demo', records: 69, warnings: 0, sourceVersion: 'Demo T08', actor: 'Minh Admin' },
  { id: 'IMP-0726-03', createdAt: '15/07/2026 · 09:18', period: '07/2026', state: 'final', records: 78, warnings: 2, sourceVersion: 'Sheet #184', actor: 'Tự động' },
  { id: 'IMP-0726-02', createdAt: '14/07/2026 · 17:42', period: '07/2026', state: 'warning', records: 77, warnings: 4, sourceVersion: 'Sheet #179', actor: 'Trâm HR' },
  { id: 'IMP-0626-07', createdAt: '28/06/2026 · 18:05', period: '06/2026', state: 'final', records: 74, warnings: 0, sourceVersion: 'Sheet #165', actor: 'Minh Admin' },
]

export const releases: Release[] = [
  { id: 'demo-081', version: 'R08.1', state: 'live', label: 'DEMO vinh danh tháng 08', changed: 'Đủ 9/9 bảng · 69 lượt xếp hạng', ready: '7/9 TV', publishedAt: '23/07/2026 · 15:30', actor: 'Minh Admin' },
  { id: 'rel-082', version: 'R08.2', state: 'scheduled', label: 'Chờ dữ liệu FINAL tháng 08', changed: 'Sẽ thay dữ liệu demo', ready: 'Chưa phát', publishedAt: 'Dự kiến 28/08/2026', actor: 'Kế toán + Admin' },
  { id: 'rel-072', version: 'R07.2', state: 'archived', label: 'Vinh danh tháng 07 · Bản 2', changed: 'Đã thay bằng demo R08.1', ready: '9/9 TV', publishedAt: '15/07/2026 · 09:32', actor: 'Minh Admin' },
  { id: 'rel-071', version: 'R07.1', state: 'archived', label: 'Vinh danh tháng 07 · Bản 1', changed: 'Lưu lịch sử', ready: '9/9 TV', publishedAt: '14/07/2026 · 18:02', actor: 'Minh Admin' },
]

export const sourceSheetUrl = 'https://docs.google.com/spreadsheets/d/1H0gZ6jW5KKvpP6WvdU07FdamYd8lWsOe9_WmdO6Z5PM/edit'
