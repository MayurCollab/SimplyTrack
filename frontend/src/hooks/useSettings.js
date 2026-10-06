import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/api'

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await api.get('/settings')
      return data
    },
  })
}

export function useSettingsMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.patch('/settings', body),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Settings saved')
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to save settings')
    },
  })
}

export function useMonthlyReportRuns(includeTests = false) {
  return useQuery({
    queryKey: ['reports', 'monthly-status', includeTests],
    queryFn: async () => {
      const { data } = await api.get('/reports/monthly-status', {
        params: { includeTests: includeTests ? 'true' : undefined },
      })
      return data.data
    },
  })
}

export function useMonthlyReportJobLogs() {
  return useQuery({
    queryKey: ['reports', 'monthly-status', 'job-logs'],
    queryFn: async () => {
      const { data } = await api.get('/reports/monthly-status/job-logs')
      return data.data
    },
  })
}

export function useMonthlyReportTestSend() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body = { onlyMe: true }) =>
      api.post('/reports/monthly-status/test', body),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Test report sent')
      qc.invalidateQueries({ queryKey: ['reports', 'monthly-status'] })
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to send test report')
    },
  })
}

export async function downloadMonthlyReport(runId, fileName) {
  const response = await api.get(`/reports/monthly-status/${runId}/download`, {
    responseType: 'blob',
  })
  const blob = new Blob([response.data], {
    type:
      response.headers['content-type'] ||
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName || 'Monthly-Status-Report.xlsx'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
