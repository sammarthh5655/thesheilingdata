import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ADMIN_PATH } from './config.js'
import { useAuth } from './context/AuthContext.jsx'
import Layout from './components/Layout.jsx'
import Spinner from './components/Spinner.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import VerifyEmail from './pages/VerifyEmail.jsx'
import Classes from './pages/Classes.jsx'
import ClassPage from './pages/ClassPage.jsx'
import SubjectPage from './pages/SubjectPage.jsx'
import Assistant from './pages/Assistant.jsx'
import Upload from './pages/Upload.jsx'
import Settings from './pages/Settings.jsx'
import { CATEGORY_QUESTION_PAPER } from './config.js'
import FilePage from './pages/FilePage.jsx'
import SearchPage from './pages/SearchPage.jsx'
import Bookmarks from './pages/Bookmarks.jsx'
import Profile from './pages/Profile.jsx'
import TeacherProfile from './pages/TeacherProfile.jsx'
import NotFound from './pages/NotFound.jsx'
import AdminLogin from './pages/admin/AdminLogin.jsx'
import AdminDashboard from './pages/admin/AdminDashboard.jsx'
import { backend } from './backend/index.js'

function Protected({ children }) {
  const { isSignedIn, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="page-loading"><Spinner label="Loading" /></div>
  if (!isSignedIn) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return children
}

function SuspendedScreen() {
  return (
    <div className="suspended-screen">
      <div className="suspended-card">
        <h1>Account suspended</h1>
        <p>
          Your account has been suspended by a school administrator. If you
          believe this is a mistake, please contact your school office.
        </p>
        <button className="btn" onClick={() => backend.signOutUser()}>Sign out</button>
      </div>
    </div>
  )
}

export default function App() {
  const { loading, isBanned } = useAuth()

  if (loading) return <div className="page-loading"><Spinner label="Loading TheSheilingData" /></div>
  if (isBanned) return <SuspendedScreen />

  return (
    <Routes>
      {/* Hidden admin routes — deliberately outside the public layout. */}
      <Route path={`/${ADMIN_PATH}/login`} element={<AdminLogin />} />
      <Route path={`/${ADMIN_PATH}/dashboard`} element={<AdminDashboard />} />

      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/classes" element={<Protected><Classes /></Protected>} />
        <Route path="/classes/:classNumber" element={<Protected><ClassPage /></Protected>} />
        <Route path="/classes/:classNumber/:subjectSlug" element={<Protected><SubjectPage /></Protected>} />
        <Route path="/question-bank" element={<Protected><Classes category={CATEGORY_QUESTION_PAPER} /></Protected>} />
        <Route path="/question-bank/:classNumber" element={<Protected><ClassPage category={CATEGORY_QUESTION_PAPER} /></Protected>} />
        <Route path="/question-bank/:classNumber/:subjectSlug" element={<Protected><SubjectPage category={CATEGORY_QUESTION_PAPER} /></Protected>} />
        <Route path="/assistant" element={<Protected><Assistant /></Protected>} />
        <Route path="/upload" element={<Protected><Upload /></Protected>} />
        <Route path="/settings" element={<Protected><Settings /></Protected>} />
        <Route path="/file/:fileId" element={<Protected><FilePage /></Protected>} />
        <Route path="/search" element={<Protected><SearchPage /></Protected>} />
        <Route path="/bookmarks" element={<Protected><Bookmarks /></Protected>} />
        <Route path="/profile" element={<Protected><Profile /></Protected>} />
        <Route path="/teacher/:teacherId" element={<Protected><TeacherProfile /></Protected>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
