import { lazy, Suspense } from 'react'
import {
  createHashRouter, Navigate, Outlet, RouterProvider, useLocation, useParams,
} from 'react-router-dom'
import AppNavbar from './components/AppNavbar'

const Home = lazy(() => import('./pages/Home'))
const CourseBrowser = lazy(() => import('./pages/CourseBrowser'))
const CourseBuilder = lazy(() => import('./pages/CourseBuilder'))
const CarDesigner = lazy(() => import('./pages/CarDesigner'))
const Race = lazy(() => import('./pages/Race'))
const Results = lazy(() => import('./pages/Results'))
const Leaderboard = lazy(() => import('./pages/Leaderboard'))
const Invite = lazy(() => import('./pages/Invite'))
const Settings = lazy(() => import('./pages/Settings'))
const Performance = lazy(() => import('./pages/Performance'))

function Layout() {
  return (
    <>
      <AppNavbar />
      <Outlet />
    </>
  )
}

function Page({ Component }) {
  return (
    <Suspense fallback={<main className="py-5 text-center" role="status">Loading…</main>}>
      <Component />
    </Suspense>
  )
}

function RaceRoute() {
  const { courseId } = useParams()
  const location = useLocation()
  return <Page Component={() => <Race key={`${courseId}:${location.search}`} />} />
}

const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Page Component={Home} /> },
      { path: '/browse', element: <Page Component={CourseBrowser} /> },
      { path: '/build/:courseId', element: <Page Component={CourseBuilder} /> },
      { path: '/car', element: <Page Component={CarDesigner} /> },
      { path: '/race/:courseId', element: <RaceRoute /> },
      { path: '/results/:courseId', element: <Page Component={Results} /> },
      { path: '/leaderboard', element: <Page Component={Leaderboard} /> },
      { path: '/invite', element: <Page Component={Invite} /> },
      { path: '/settings', element: <Page Component={Settings} /> },
      { path: '/performance', element: <Page Component={Performance} /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
