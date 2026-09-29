/**
 * Task module feature flags.
 *
 * Original rollout:
 * - crud / timer / breakTraining — core Task Master
 *
 * Requirements doc phases (0–6) are shipped; flags remain for optional UI gating.
 */
export const TASK_PHASE = {
  crud: true,
  timer: true,
  breakTraining: true,
  /** Unique Task ID + immutable auto title */
  identity: true,
  /** Extra dates, compliance period UI, auto target date */
  dates: true,
  /** Mark Complete / Ignore */
  lifecycle: true,
  /** Status workflow date prompts */
  workflow: true,
  /** Recurring tasks + suggestions */
  recurring: true,
}
