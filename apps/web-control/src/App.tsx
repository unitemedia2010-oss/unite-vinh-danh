import { useEffect, useState } from 'react'
import { AdminApp } from './admin/AdminApp'
import { ScreenPlayer } from './screen/ScreenPlayer'
import { PublicSharePage } from './share/PublicSharePage'

const getRoute = () => {
  const hash = window.location.hash.replace(/^#/, '')
  if (hash.startsWith('/share') || window.location.pathname.endsWith('/share')) return 'share'
  if (hash.startsWith('/screen') || window.location.pathname.endsWith('/screen')) return 'screen'
  return 'admin'
}

export default function App() {
  const [route, setRoute] = useState(getRoute)

  useEffect(() => {
    const update = () => setRoute(getRoute())
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])

  if (route === 'share') return <PublicSharePage />
  return route === 'screen' ? <ScreenPlayer /> : <AdminApp />
}
