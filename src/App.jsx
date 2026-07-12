import { HashRouter, Routes, Route, Outlet } from 'react-router-dom'
import AppNavbar from './components/AppNavbar'
import Home from './pages/Home'
import CourseBrowser from './pages/CourseBrowser'
import CourseBuilder from './pages/CourseBuilder'
import CarDesigner from './pages/CarDesigner'
import Race from './pages/Race'
import Results from './pages/Results'
import Leaderboard from './pages/Leaderboard'
import Invite from './pages/Invite'

function Layout() {
  return (
    <>
      <AppNavbar />
      <Outlet />
    </>
  )
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
          <Route path="/race/:courseId" element={<Race />} />
          <Route path="/results/:courseId" element={<Results />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/invite" element={<Invite />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
