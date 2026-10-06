/** Available columns for Monthly Status Report (Excel). */
const MONTHLY_REPORT_COLUMNS = [
  { key: 'taskCode', label: 'Task Code', default: true },
  { key: 'title', label: 'Title', default: true },
  { key: 'client', label: 'Client', default: true },
  { key: 'service', label: 'Service', default: false },
  { key: 'assignee', label: 'Assignee', default: true },
  { key: 'helpingMember', label: 'Helping Member', default: false },
  { key: 'manager', label: 'Manager', default: true },
  { key: 'status', label: 'Status', default: true },
  { key: 'priority', label: 'Priority', default: true },
  { key: 'dueDate', label: 'Due Date', default: true },
  { key: 'targetDate', label: 'Target Date', default: false },
  { key: 'lifecycle', label: 'Lifecycle', default: true },
  { key: 'completedAt', label: 'Completed At', default: false },
  { key: 'ignoredAt', label: 'Ignored At', default: false },
  { key: 'budgetHours', label: 'Budget Hours', default: false },
  { key: 'loggedHours', label: 'Logged Hours', default: false },
];

const MONTHLY_REPORT_COLUMN_KEYS = MONTHLY_REPORT_COLUMNS.map((c) => c.key);

const DEFAULT_MONTHLY_REPORT_COLUMNS = MONTHLY_REPORT_COLUMNS.filter((c) => c.default).map(
  (c) => c.key
);

module.exports = {
  MONTHLY_REPORT_COLUMNS,
  MONTHLY_REPORT_COLUMN_KEYS,
  DEFAULT_MONTHLY_REPORT_COLUMNS,
};
