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
  height = 480,
  rowHeight = 38,
}) {
  const defaultColDef = useMemo(
    () => ({
      sortable: true,
      resizable: true,
      flex: 1,
      minWidth: 100,
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
        rowHeight={rowHeight}
        headerHeight={42}
        overlayLoadingTemplate='<span class="text-sm text-muted-foreground">Loading…</span>'
        overlayNoRowsTemplate='<span class="text-sm text-muted-foreground">No rows to show</span>'
      />
    </div>
  )
}
