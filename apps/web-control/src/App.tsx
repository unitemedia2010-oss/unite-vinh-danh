import { lazy, Suspense, useEffect, useState } from 'react'

const AdminApp = lazy(() => import('./admin/AdminApp').then((module) => ({ default: module.AdminApp })))
const ScreenPlayer = lazy(() => import('./screen/ScreenPlayer').then((module) => ({ default: module.ScreenPlayer })))
const PublicSharePage = lazy(() => import('./share/PublicSharePage').then((module) => ({ default: module.PublicSharePage })))

const getRoute = () => {
  const hash = window.location.hash.replace(/^#/, '')
  if (hash.startsWith('/share') || window.location.pathname.endsWith('/share')) return 'share'
  if (hash.startsWith('/tv') || window.location.pathname.endsWith('/tv')) return 'tv'
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

  const content = route === 'share'
    ? <PublicSharePage />
    : route === 'tv'
      ? <ScreenPlayer mode="public" />
      : route === 'screen'
        ? <ScreenPlayer mode="paired" />
        : <AdminApp />

  return (
    <Suspense fallback={<div className={`route-loading route-loading--${route}`}><span>UNITE GROUP</span><i /></div>}>
      {content}
    </Suspense>
  )
}
