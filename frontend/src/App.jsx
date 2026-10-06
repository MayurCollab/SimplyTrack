import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AppShell } from '@/components/layout/AppShell'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { PublicOnlyRoute } from '@/routes/PublicOnlyRoute'
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import VerifyOtpPage from '@/pages/auth/VerifyOtpPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import StagesPage from '@/pages/stages/StagesPage'
import ServicesPage from '@/pages/services/ServicesPage'
import ClientsPage from '@/pages/clients/ClientsPage'
import ProjectsPage from '@/pages/projects/ProjectsPage'
import UsersPage from '@/pages/users/UsersPage'
import TasksPage from '@/pages/tasks/TasksPage'
import PermissionsPage from '@/pages/permissions/PermissionsPage'
import SettingsPage from '@/pages/settings/SettingsPage'
import ReportsPage from '@/pages/reports/ReportsPage'
import { TASK_PHASE } from '@/config/taskModule'
import PlaceholderPage from '@/pages/PlaceholderPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-otp" element={<VerifyOtpPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              {TASK_PHASE.crud ? (
                <Route path="/tasks" element={<TasksPage />} />
              ) : (
                <Route path="/tasks" element={<PlaceholderPage title="Tasks" />} />
              )}
              <Route path="/stages" element={<StagesPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/permissions" element={<PermissionsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors closeButton />
    </QueryClientProvider>
  )
}
