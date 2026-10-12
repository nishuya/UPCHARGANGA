import { useState } from 'react';
import Modal from '../../../components/ui/Modal';
import Field from '../../../components/ui/Field';
import Button from '../../../components/ui/Button';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import {
  useGetUnavailability,
  useCreateUnavailability,
  useUpdateUnavailability,
  useDeleteUnavailability,
} from '../hooks/useDoctorUnavailability';
import { getApiErrorMessage } from '../../../utils/apiError';

const UNAVAILABILITY_REASONS = [
  { value: 'vacation', label: 'Vacation' },
  { value: 'conference', label: 'Conference' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'other', label: 'Other' },
];

/**
 * Modal to manage doctor unavailability periods
 * Allows admin to add, edit, and delete periods when doctor is not available
 */
const DoctorUnavailabilityModal = ({ isOpen, onClose, doctorId, doctorName }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    reason: 'vacation',
    notes: '',
  });
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Queries and mutations
  const { data: unavailabilityData, isLoading } = useGetUnavailability(doctorId);
  const createMutation = useCreateUnavailability(doctorId);
  const updateMutation = useUpdateUnavailability(doctorId);
  const deleteMutation = useDeleteUnavailability(doctorId);

  const unavailabilityPeriods = unavailabilityData?.unavailability || [];

  // Reset form
  const resetForm = () => {
    setFormData({
      startDate: '',
      endDate: '',
      reason: 'vacation',
      notes: '',
    });
    setIsCreating(false);
    setEditingId(null);
  };

  // Handle create/update submit
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.startDate || !formData.endDate) {
      alert('Please select both start and end dates');
      return;
    }

    if (new Date(formData.startDate) >= new Date(formData.endDate)) {
      alert('Start date must be before end date');
      return;
    }

    try {
      if (editingId) {
        // Update existing
        await updateMutation.mutateAsync({
          unavailabilityId: editingId,
          data: formData,
        });
      } else {
        // Create new
        await createMutation.mutateAsync(formData);
      }
      resetForm();
    } catch (err) {
      console.error('Error saving unavailability:', err);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(confirmDelete._id);
      setConfirmDelete(null);
    } catch (err) {
      console.error('Error deleting unavailability:', err);
    }
  };

  // Handle edit button
  const handleEdit = (period) => {
    setEditingId(period._id);
    setFormData({
      startDate: period.startDate.split('T')[0],
      endDate: period.endDate.split('T')[0],
      reason: period.reason || 'other',
      notes: period.notes || '',
    });
    setIsCreating(true);
  };

  // Format date for display
  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <Modal.Header>
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">
              Unavailability for Dr. {doctorName}
            </h2>
            <p className="mt-sm text-neutral-600">
              Mark dates when this doctor is unavailable. Patients cannot book appointments during these periods.
            </p>
          </div>
        </Modal.Header>

        <Modal.Body>
          {/* List of existing unavailability periods */}
          {!isCreating && (
            <div className="mb-lg">
              <div className="flex items-center justify-between mb-md">
                <h3 className="text-lg font-semibold text-neutral-900">
                  Unavailability Periods
                </h3>
                <Button
                  size="sm"
                  onClick={() => setIsCreating(true)}
                >
                  + Add Period
                </Button>
              </div>

              {isLoading ? (
                <div className="text-center py-lg text-neutral-600">
                  Loading unavailability periods...
                </div>
              ) : unavailabilityPeriods.length === 0 ? (
                <div className="text-center py-lg text-neutral-600">
                  No unavailability periods set
                </div>
              ) : (
                <div className="space-y-md">
                  {unavailabilityPeriods.map((period) => (
                    <div
                      key={period._id}
                      className="p-md border border-neutral-200 rounded-lg hover:bg-neutral-50 transition"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-md mb-sm">
                            <span className="font-semibold text-neutral-900">
                              {formatDate(period.startDate)} — {formatDate(period.endDate)}
                            </span>
                            <span className="inline-block px-md py-xs bg-blue-100 text-blue-700 rounded text-sm font-medium">
                              {UNAVAILABILITY_REASONS.find(r => r.value === period.reason)?.label || period.reason}
                            </span>
                          </div>
                          {period.notes && (
                            <p className="text-sm text-neutral-600">
                              {period.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-sm ml-md">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleEdit(period)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => setConfirmDelete(period)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Form to create/edit unavailability */}
          {isCreating && (
            <form onSubmit={handleSubmit} className="space-y-md">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-xs">
                  Start Date *
                </label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) =>
                    setFormData({ ...formData, startDate: e.target.value })
                  }
                  className="w-full px-md py-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-xs">
                  End Date *
                </label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) =>
                    setFormData({ ...formData, endDate: e.target.value })
                  }
                  className="w-full px-md py-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-xs">
                  Reason
                </label>
                <select
                  value={formData.reason}
                  onChange={(e) =>
                    setFormData({ ...formData, reason: e.target.value })
                  }
                  className="w-full px-md py-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {UNAVAILABILITY_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-xs">
                  Notes (Optional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  placeholder="Add any additional notes..."
                  rows={3}
                  className="w-full px-md py-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {createMutation.isError && (
                <div className="p-md bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  {getApiErrorMessage(createMutation.error)}
                </div>
              )}

              {updateMutation.isError && (
                <div className="p-md bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  {getApiErrorMessage(updateMutation.error)}
                </div>
              )}

              <div className="flex gap-md">
                <Button
                  type="submit"
                  isLoading={createMutation.isPending || updateMutation.isPending}
                >
                  {editingId ? 'Update Period' : 'Add Period'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={resetForm}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Confirm delete dialog */}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete Unavailability Period?`}
          description={`This will allow bookings for ${formatDate(
            confirmDelete.startDate
          )} to ${formatDate(confirmDelete.endDate)} again.`}
          confirmLabel="Delete"
          isDangerous
          isLoading={deleteMutation.isPending}
          error={
            deleteMutation.isError
              ? getApiErrorMessage(deleteMutation.error)
              : null
          }
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
};

export default DoctorUnavailabilityModal;
