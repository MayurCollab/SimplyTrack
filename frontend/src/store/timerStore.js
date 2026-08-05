import { create } from 'zustand'

export const useTimerStore = create((set) => ({
  active: null,
  pendingNote: null,
  breakMinutesToday: 0,
  dailyBreakMinutes: 60,
  breakOverAllowance: false,
  noteDialog: null, // { timeLog, mode: 'stop' | 'pending', onSubmit }

  setActiveState: (payload) =>
    set({
      active: payload?.active ?? null,
      pendingNote: payload?.pendingNote ?? null,
      breakMinutesToday: payload?.breakMinutesToday ?? 0,
      dailyBreakMinutes: payload?.dailyBreakMinutes ?? 60,
      breakOverAllowance: payload?.breakOverAllowance ?? false,
    }),

  openNoteDialog: (noteDialog) => set({ noteDialog }),
  closeNoteDialog: () => set({ noteDialog: null }),
  setPendingNote: (pendingNote) => set({ pendingNote }),
}))
