import { useEffect, useState } from 'react'
import { AdminApp } from './admin/AdminApp'
import { ScreenPlayer } from './screen/ScreenPlayer'

const getRoute = () => {
  const hash = window.location.hash.replace(/^#/, '')
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

  return route === 'screen' ? <ScreenPlayer /> : <AdminApp />
}
