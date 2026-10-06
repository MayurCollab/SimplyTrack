const ExcelJS = require('exceljs');
const moment = require('moment-timezone');
const { MONTHLY_REPORT_COLUMNS } = require('../constants/monthlyReportColumns');
const { rowValue, normalizeTimezone } = require('./monthlyStatusReport');

const COLUMN_LABELS = Object.fromEntries(
  MONTHLY_REPORT_COLUMNS.map((c) => [c.key, c.label])
);

function periodLabel(periodKey) {
  return moment(periodKey, 'YYYY-MM').format('MMMM YYYY');
}

async function buildMonthlyReportWorkbook({
  orgName,
  snapshot,
  isTest = false,
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SimplyTrack';
  workbook.created = snapshot.generatedAt || new Date();

  const tz = normalizeTimezone(snapshot.timezone);
  const columns = snapshot.selectedColumns || [];
  const label = periodLabel(snapshot.periodKey);

  // --- Summary sheet ---
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.getColumn(1).width = 28;
  summarySheet.getColumn(2).width = 40;

  const title = isTest
    ? `TEST — Monthly Status Report — ${orgName}`
    : `Monthly Status Report — ${orgName}`;

  summarySheet.addRow([title]);
  summarySheet.getRow(1).font = { bold: true, size: 14 };
  summarySheet.addRow(['Period', label]);
  summarySheet.addRow([
    'Generated at',
    moment(snapshot.generatedAt).tz(tz).format('DD/MM/YYYY HH:mm z'),
  ]);
  summarySheet.addRow(['Timezone', tz]);
  summarySheet.addRow(['Total tasks', snapshot.summary?.totalTasks ?? 0]);
  summarySheet.addRow([]);

  summarySheet.addRow(['Lifecycle', 'Count']);
  summarySheet.getRow(summarySheet.lastRow.number).font = { bold: true };
  const life = snapshot.summary?.byLifecycle || {};
  for (const key of ['Open', 'Completed', 'Ignored']) {
    summarySheet.addRow([key, life[key] || 0]);
  }

  summarySheet.addRow([]);
  summarySheet.addRow(['Status (workflow stage)', 'Count']);
  summarySheet.getRow(summarySheet.lastRow.number).font = { bold: true };
  for (const [status, count] of Object.entries(snapshot.summary?.byStatus || {})) {
    summarySheet.addRow([status, count]);
  }

  summarySheet.addRow([]);
  summarySheet.addRow([
    'Manager',
    'Team members',
    'Tasks',
    'Open',
    'Completed',
    'Ignored',
  ]);
  summarySheet.getRow(summarySheet.lastRow.number).font = { bold: true };
  for (const row of snapshot.summary?.byManager || []) {
    summarySheet.addRow([
      row.managerName,
      row.memberCount,
      row.taskCount,
      row.open,
      row.completed,
      row.ignored,
    ]);
  }

  // --- By Manager sheet (hierarchical) ---
  const byManagerSheet = workbook.addWorksheet('By Manager');
  const headerRow = ['Manager', 'Team Member', ...columns.map((k) => COLUMN_LABELS[k] || k)];
  byManagerSheet.addRow(headerRow);
  byManagerSheet.getRow(1).font = { bold: true };

  headerRow.forEach((_, idx) => {
    byManagerSheet.getColumn(idx + 1).width = idx < 2 ? 22 : 18;
  });

  for (const group of snapshot.groups || []) {
    // Manager banner row
    const managerRow = byManagerSheet.addRow([
      group.managerName,
      '',
      ...columns.map(() => ''),
    ]);
    managerRow.font = { bold: true };
    managerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E7FF' },
    };

    for (const member of group.members) {
      // Team member banner row
      const memberRow = byManagerSheet.addRow([
        group.managerName,
        member.assigneeName,
        ...columns.map(() => ''),
      ]);
      memberRow.font = { italic: true };
      memberRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F4F6' },
      };

      for (const task of member.tasks) {
        byManagerSheet.addRow([
          group.managerName,
          member.assigneeName,
          ...columns.map((key) => rowValue(task, key, tz)),
        ]);
      }
    }
  }

  // --- All Tasks flat sheet ---
  const allSheet = workbook.addWorksheet('All Tasks');
  const flatHeader = [
    'Manager',
    'Team Member',
    ...columns.map((k) => COLUMN_LABELS[k] || k),
  ];
  allSheet.addRow(flatHeader);
  allSheet.getRow(1).font = { bold: true };
  flatHeader.forEach((_, idx) => {
    allSheet.getColumn(idx + 1).width = idx < 2 ? 22 : 18;
  });

  for (const group of snapshot.groups || []) {
    for (const member of group.members) {
      for (const task of member.tasks) {
        allSheet.addRow([
          group.managerName,
          member.assigneeName,
          ...columns.map((key) => rowValue(task, key, tz)),
        ]);
      }
    }
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const safeOrg = String(orgName || 'Organization')
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 40);
  const fileName = isTest
    ? `TEST-Monthly-Status-Report-${snapshot.periodKey}-${safeOrg}.xlsx`
    : `Monthly-Status-Report-${snapshot.periodKey}-${safeOrg}.xlsx`;

  return { buffer, fileName };
}

module.exports = { buildMonthlyReportWorkbook, periodLabel };
