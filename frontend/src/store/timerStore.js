import { create } from 'zustand'
import { enrichTimeLog } from '@/lib/time'

export const useTimerStore = create((set) => ({
  active: null,
  pendingNote: null,
  breakMinutesToday: 0,
  dailyBreakMinutes: 60,
  breakOverAllowance: false,
  noteDialog: null, // { timeLog, mode: 'stop' | 'pending' | 'switch', pendingAction? }
  dismissedPendingNoteId: null,

  setActiveState: (payload) =>
    set({
      active: payload?.active ?? null,
      pendingNote: payload?.pendingNote ?? null,
      breakMinutesToday: payload?.breakMinutesToday ?? 0,
      dailyBreakMinutes: payload?.dailyBreakMinutes ?? 60,
      breakOverAllowance: payload?.breakOverAllowance ?? false,
    }),

  openNoteDialog: (noteDialog) =>
    set({
      noteDialog: noteDialog
        ? {
            ...noteDialog,
            timeLog: noteDialog.timeLog ? enrichTimeLog(noteDialog.timeLog) : noteDialog.timeLog,
          }
        : noteDialog,
      dismissedPendingNoteId: null,
    }),

  openPendingClosingNote: (timeLog) => {
    const enriched = enrichTimeLog(timeLog)
    set({
      noteDialog: { timeLog: enriched, mode: 'pending' },
      dismissedPendingNoteId: null,
      pendingNote: enriched,
    })
  },
  closeNoteDialog: () =>
    set((state) => ({
      noteDialog: null,
      dismissedPendingNoteId:
        state.noteDialog?.mode === 'pending'
          ? state.noteDialog.timeLog?._id ?? state.noteDialog.timeLog
          : state.dismissedPendingNoteId,
    })),
  setPendingNote: (pendingNote) => set({ pendingNote }),
}))
