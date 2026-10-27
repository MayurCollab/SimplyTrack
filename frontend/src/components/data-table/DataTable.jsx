import { useMemo } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'

ModuleRegistry.registerModules([AllCommunityModule])

export function DataTable({
  columnDefs,
  rowData,
  loading,
  onRowClicked,
  getRowClass,
  getRowHeight,
  height = 480,
  rowHeight = 38,
  headerHeight = 40,
}) {
  const defaultColDef = useMemo(
    () => ({
      sortable: true,
      resizable: true,
      // No default flex — only columns that opt in (e.g. name/title) absorb leftover space.
      minWidth: 72,
    }),
    []
  )

  return (
    <div
      className="ag-theme-quartz w-full overflow-hidden rounded-xl border border-border shadow-sm"
      style={{ height }}
    >
      <AgGridReact
        theme="legacy"
        columnDefs={columnDefs}
        rowData={rowData}
        defaultColDef={defaultColDef}
        loading={loading}
        pagination
        paginationPageSize={25}
        paginationPageSizeSelector={[25, 50, 100]}
        suppressCellFocus
        onRowClicked={onRowClicked}
        getRowClass={getRowClass}
        getRowHeight={getRowHeight}
        rowHeight={rowHeight}
        headerHeight={headerHeight}
        overlayLoadingTemplate='<span class="text-sm text-muted-foreground">Loading…</span>'
        overlayNoRowsTemplate='<span class="text-sm text-muted-foreground">No rows to show</span>'
      />
    </div>
  )
}
