import { useForm } from 'react-hook-form'

export function useAppForm(options) {
  return useForm({
    mode: 'onChange',
    ...options,
  })
}
