const numberFormatter = new Intl.NumberFormat('vi-VN')
const clockFormatter = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const fullDateFormatter = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export const formatVnd = (value: number) => `${numberFormatter.format(value)} VNĐ`

export const formatNumber = (value: number) => numberFormatter.format(value)

export const formatClock = (date = new Date()) => clockFormatter.format(date)

export const formatFullDate = (date = new Date()) => fullDateFormatter.format(date)
