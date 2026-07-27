export const formatVnd = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} VNĐ`

export const formatNumber = (value: number) => new Intl.NumberFormat('vi-VN').format(value)

export const formatClock = (date = new Date()) =>
  new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)

export const formatFullDate = (date = new Date()) =>
  new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
