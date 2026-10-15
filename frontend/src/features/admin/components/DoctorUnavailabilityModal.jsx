import { useState } from 'react';
import Modal from '../../../components/ui/Modal';
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

  const { data: unavailabilityData, isLoading } = useGetUnavailability(doctorId);
  const createMutation = useCreateUnavailability(doctorId);
  const updateMutation = useUpdateUnavailability(doctorId);
  const deleteMutation = useDeleteUnavailability(doctorId);

  const unavailabilityPeriods = unavailabilityData?.unavailability || [];

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
        await updateMutation.mutateAsync({
          unavailabilityId: editingId,
          data: formData,
        });
      } else {
        await createMutation.mutateAsync(formData);
      }
      resetForm();
    } catch (err) {
      console.error('Error saving unavailability:', err);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(confirmDelete._id);
      setConfirmDelete(null);
    } catch (err) {
      console.error('Error deleting unavailability:', err);
    }
  };

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
            <h2 className="text-lg sm:text-2xl font-bold text-neutral-900 break-words">
              Unavailability for Dr. {doctorName}
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-neutral-600">
              Mark dates when this doctor is unavailable. Patients cannot book appointments during
              these periods.
            </p>
          </div>
        </Modal.Header>

        <Modal.Body>
          {!isCreating && (
            <div className="mb-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h3 className="text-base sm:text-lg font-semibold text-neutral-900">
                  Unavailability Periods
                </h3>
                <Button size="sm" onClick={() => setIsCreating(true)}>
                  + Add Period
                </Button>
              </div>

              {isLoading ? (
                <div className="text-center py-6 text-neutral-600">
                  Loading unavailability periods...
                </div>
              ) : unavailabilityPeriods.length === 0 ? (
                <div className="text-center py-6 text-neutral-600">
                  No unavailability periods set
                </div>
              ) : (
                <div className="space-y-3">
                  {unavailabilityPeriods.map((period) => (
                    <div
                      key={period._id}
                      className="p-3.5 sm:p-md border border-neutral-200 rounded-lg hover:bg-neutral-50 transition"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <span className="font-semibold text-neutral-900 text-sm sm:text-base">
                              {formatDate(period.startDate)} — {formatDate(period.endDate)}
                            </span>
                            <span className="inline-block px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                              {UNAVAILABILITY_REASONS.find((r) => r.value === period.reason)
                                ?.label || period.reason}
                            </span>
                          </div>
                          {period.notes && (
                            <p className="text-sm text-neutral-600 break-words">{period.notes}</p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleEdit(period)}
                            className="flex-1 sm:flex-none"
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => setConfirmDelete(period)}
                            className="flex-1 sm:flex-none"
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

          {isCreating && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Reason</label>
                <select
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {UNAVAILABILITY_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Add any additional notes..."
                  rows={3}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {createMutation.isError && (
                <div className="p-3 bg-danger-50 border border-danger-200 rounded text-danger-700 text-sm">
                  {getApiErrorMessage(createMutation.error)}
                </div>
              )}

              {updateMutation.isError && (
                <div className="p-3 bg-danger-50 border border-danger-200 rounded text-danger-700 text-sm">
                  {getApiErrorMessage(updateMutation.error)}
                </div>
              )}

              <div className="flex flex-col xs:flex-row gap-2">
                <Button
                  type="submit"
                  isLoading={createMutation.isPending || updateMutation.isPending}
                  className="w-full xs:w-auto"
                >
                  {editingId ? 'Update Period' : 'Add Period'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={resetForm}
                  className="w-full xs:w-auto"
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} className="w-full xs:w-auto">
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Unavailability Period?"
          description={`This will allow bookings for ${formatDate(
            confirmDelete.startDate
          )} to ${formatDate(confirmDelete.endDate)} again.`}
          confirmLabel="Delete"
          isDangerous
          isLoading={deleteMutation.isPending}
          error={deleteMutation.isError ? getApiErrorMessage(deleteMutation.error) : null}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
};

export default DoctorUnavailabilityModal;
