import Button from './Button';

/**
 * Premium UpcharGanga Confirm Dialog
 * Confirmation dialog for destructive/irreversible actions.
 * Used for deactivating hospitals, doctors, deleting records, etc.
 */
const ConfirmDialog = ({
  title,
  description,
  confirmLabel = 'Confirm',
  isLoading = false,
  error,
  onConfirm,
  onCancel,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-lg">
    {/* Backdrop */}
    <div
      className="absolute inset-0 bg-neutral-900/50"
      onClick={onCancel}
      aria-hidden="true"
    />

    {/* Dialog */}
    <div
      role="alertdialog"
      aria-modal="true"
      className="relative z-10 w-full max-w-sm rounded-lg border border-neutral-200 bg-neutral-0 p-2xl shadow-xl"
    >
      <h2 className="text-h3 font-semibold text-neutral-900">{title}</h2>
      {description && (
        <p className="mt-md text-body-sm text-neutral-600">{description}</p>
      )}
      {error && (
        <p className="mt-md text-caption font-medium text-danger-600">{error}</p>
      )}

      {/* Actions */}
      <div className="mt-2xl flex justify-end gap-md">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" isLoading={isLoading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  </div>
);

export default ConfirmDialog;
