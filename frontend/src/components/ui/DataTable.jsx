import React, { useCallback } from 'react';
import { Spinner, EmptyState, ErrorNotice } from './StateNotice';

/**
 * Premium UpcharGanga Data Table Component
 * Reusable table for all admin lists (Hospitals, Doctors, Patients, Appointments, etc).
 * Features:
 * - Professional typography and spacing
 * - Hover states with subtle color change
 * - Responsive horizontal scroll on mobile
 * - Consistent loading/empty/error state handling
 *
 * Optimized with memoized row rendering to prevent unnecessary re-renders
 * when parent re-renders with same data.
 */

// Memoized table row component to prevent re-renders on parent updates
const DataTableRow = React.memo(({
  row,
  rowIndex,
  columns,
  keyField,
  onRowClick
}) => (
  <tr
    onClick={onRowClick ? () => onRowClick(row) : undefined}
    className={`${
      rowIndex % 2 === 0 ? 'bg-neutral-0' : 'bg-neutral-50'
    } transition-colors duration-fast ${
      onRowClick ? 'cursor-pointer hover:bg-upchar-50' : ''
    }`}
  >
    {columns.map((col) => (
      <td
        key={col.key}
        className="whitespace-nowrap px-lg py-md text-body text-neutral-700"
      >
        {col.render ? col.render(row) : row[col.key]}
      </td>
    ))}
  </tr>
));

DataTableRow.displayName = 'DataTableRow';

const DataTable = ({
  columns,
  rows,
  keyField = '_id',
  onRowClick,
  isLoading = false,
  isError = false,
  errorMessage,
  emptyTitle = 'Nothing here',
  emptyDescription = 'No records match your current filters.',
}) => {
  const handleRowClick = useCallback(
    (row) => {
      if (onRowClick) onRowClick(row);
    },
    [onRowClick]
  );

  if (isLoading) return <Spinner label="Loading…" />;
  if (isError) return <ErrorNotice message={errorMessage} />;
  if (!rows || rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-0 shadow-base">
      <table className="w-full min-w-[640px] text-left text-sm">
        {/* Header */}
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50">
            {columns.map((col) => (
              <th
                key={col.key}
                className="whitespace-nowrap px-lg py-md text-label font-semibold uppercase tracking-widest text-neutral-600"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>

        {/* Body */}
        <tbody className="divide-y divide-neutral-100">
          {rows.map((row, idx) => (
            <DataTableRow
              key={row[keyField]}
              row={row}
              rowIndex={idx}
              columns={columns}
              keyField={keyField}
              onRowClick={onRowClick ? handleRowClick : undefined}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default React.memo(DataTable);
