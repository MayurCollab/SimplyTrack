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

export function useDailyStatusSnapshots() {
  return useQuery({
    queryKey: ['reports', 'daily-status'],
    queryFn: async () => {
      const { data } = await api.get('/reports/daily-status')
      return { list: data.data || [], meta: data.meta || {} }
    },
  })
}

export function useDailyStatusDetail(date, userId = '') {
  return useQuery({
    queryKey: ['reports', 'daily-status', 'detail', date, userId || 'all'],
    queryFn: async () => {
      const { data } = await api.get('/reports/daily-status/detail', {
        params: {
          date,
          ...(userId ? { userId } : {}),
        },
      })
      return data.data
    },
    enabled: Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date)),
    retry: false,
  })
}

export function useCaptureDailySnapshot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body = {}) => api.post('/reports/daily-status/capture', body),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Snapshot saved')
      qc.invalidateQueries({ queryKey: ['reports', 'daily-status'] })
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to capture snapshot')
    },
  })
}

function filenameFromDisposition(header, fallback) {
  if (!header) return fallback
  const match = /filename="?([^";]+)"?/i.exec(header)
  return match?.[1] || fallback
}

async function readBlobErrorMessage(err) {
  const data = err?.response?.data
  if (!data) return err?.response?.data?.message || err.message || 'Failed to download report'
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)?.message || data
    } catch {
      return data
    }
  }
  if (data instanceof Blob) {
    try {
      const text = await data.text()
      return JSON.parse(text)?.message || text || 'Failed to download report'
    } catch {
      return 'Failed to download report'
    }
  }
  return data.message || 'Failed to download report'
}

export async function downloadDailyStatusReport({ date, userId }) {
  try {
    const response = await api.get('/reports/daily-status/download', {
      params: {
        date,
        ...(userId ? { userId } : {}),
      },
      responseType: 'blob',
    })

    const contentType = response.headers['content-type'] || ''
    if (contentType.includes('application/json')) {
      const text = await response.data.text()
      let message = 'Failed to download report'
      try {
        message = JSON.parse(text)?.message || message
      } catch {
        /* ignore */
      }
      throw new Error(message)
    }

    const blob = new Blob([response.data], {
      type:
        contentType ||
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const fileName = filenameFromDisposition(
      response.headers['content-disposition'],
      `Daily-Status-${date}.xlsx`
    )
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  } catch (err) {
    if (err instanceof Error && err.message && !err.response) throw err
    throw new Error(await readBlobErrorMessage(err))
  }
}
