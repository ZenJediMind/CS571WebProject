import { createHashRouter, Navigate, RouterProvider, Outlet, useParams } from 'react-router-dom'
import AppNavbar from './components/AppNavbar'
import Home from './pages/Home'
import CourseBrowser from './pages/CourseBrowser'
import CourseBuilder from './pages/CourseBuilder'
import CarDesigner from './pages/CarDesigner'
import Race from './pages/Race'
import Results from './pages/Results'
import Leaderboard from './pages/Leaderboard'
import Invite from './pages/Invite'
import Settings from './pages/Settings'

function Layout() {
  return (
    <>
      <AppNavbar />
      <Outlet />
    </>
  )
}

function RaceRoute() {
  const { courseId } = useParams()
  return <Race key={courseId} />
}

const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/browse', element: <CourseBrowser /> },
      { path: '/build/:courseId', element: <CourseBuilder /> },
      { path: '/car', element: <CarDesigner /> },
      { path: '/race/:courseId', element: <RaceRoute /> },
      { path: '/results/:courseId', element: <Results /> },
      { path: '/leaderboard', element: <Leaderboard /> },
      { path: '/invite', element: <Invite /> },
      { path: '/settings', element: <Settings /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
