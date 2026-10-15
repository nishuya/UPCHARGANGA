import Button from './Button';

/**
 * Premium UpcharGanga Confirm Dialog — Responsive
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
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div
      className="absolute inset-0 bg-neutral-900/50"
      onClick={onCancel}
      aria-hidden="true"
    />

    <div
      role="alertdialog"
      aria-modal="true"
      className="relative z-10 w-full max-w-sm rounded-xl border border-neutral-200 bg-neutral-0 p-5 sm:p-6 shadow-xl"
    >
      <h2 className="text-lg sm:text-h3 font-semibold text-neutral-900 break-words">{title}</h2>
      {description && (
        <p className="mt-2 text-body-sm text-neutral-600 break-words">{description}</p>
      )}
      {error && (
        <p className="mt-2 text-caption font-medium text-danger-600">{error}</p>
      )}

      <div className="mt-5 flex flex-col-reverse xs:flex-row justify-end gap-2.5">
        <Button variant="ghost" onClick={onCancel} className="w-full xs:w-auto">
          Cancel
        </Button>
        <Button
          variant="danger"
          isLoading={isLoading}
          onClick={onConfirm}
          className="w-full xs:w-auto"
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  </div>
);

export default ConfirmDialog;
