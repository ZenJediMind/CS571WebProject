import { HashRouter, Navigate, Routes, Route, Outlet, useParams } from 'react-router-dom'
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

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/browse" element={<CourseBrowser />} />
          <Route path="/build/:courseId" element={<CourseBuilder />} />
          <Route path="/car" element={<CarDesigner />} />
          <Route path="/race/:courseId" element={<RaceRoute />} />
          <Route path="/results/:courseId" element={<Results />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/invite" element={<Invite />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
