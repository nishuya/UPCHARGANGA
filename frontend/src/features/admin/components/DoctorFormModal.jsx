import { useEffect, useState } from 'react';
import Modal from '../../../components/ui/Modal';
import Field from '../../../components/ui/Field';
import Button from '../../../components/ui/Button';
import ImagePreview from '../../../components/ui/ImagePreview';
import { useAdminHospitals } from '../hooks/useAdminHospitals';
import { useDepartmentsLookup } from '../hooks/useLookups';
import { useCreateDoctor, useUpdateDoctor } from '../hooks/useAdminDoctors';
import { getApiErrorMessage } from '../../../utils/apiError';
import { WEEKDAYS } from '../../../constants/weekdays';

const DEFAULT_DAY_SLOT = { enabled: false, startTime: '09:00', endTime: '17:00', maxPatients: 30, slotDurationMinutes: 15 };

const emptyAvailability = () =>
  WEEKDAYS.reduce((acc, { value }) => ({ ...acc, [value]: { ...DEFAULT_DAY_SLOT } }), {});

const emptyForm = {
  fullName: '',
  email: '',
  phone: '',
  hospital: '',
  department: '',
  specialization: '',
  licenseNumber: '',
  experienceYears: '',
  consultationFee: '',
  qualifications: '', // NEW: qualifications as comma-separated string
  isAvailableToday: true,
  availability: emptyAvailability(),
  image: null,
};

/** Turns the Doctor document's `availability` array (only the days that
 * ARE configured) into the day-keyed map the form/table below works with,
 * so every weekday always has a row, whether it's set up yet or not. */
const toAvailabilityFormState = (availability = []) => {
  const map = emptyAvailability();
  availability.forEach((slot) => {
    if (map[slot.day]) {
      map[slot.day] = {
        enabled: true,
        startTime: slot.startTime,
        endTime: slot.endTime,
        maxPatients: slot.maxPatients || 30,
        slotDurationMinutes: slot.slotDurationMinutes || 15,
      };
    }
  });
  return map;
};

/** Inverse of the above — only enabled days are sent to the API, since
 * an unchecked day simply shouldn't have an availability entry at all. */
const toAvailabilityPayload = (availabilityForm) => {
  console.log('🔄 [AVAILABILITY] Converting form availability to payload...');
  console.log('   Form availability:', availabilityForm);

  const payload = WEEKDAYS
    .filter(({ value }) => availabilityForm[value]?.enabled)
    .map(({ value }) => ({
      day: value,
      startTime: availabilityForm[value].startTime,
      endTime: availabilityForm[value].endTime,
      maxPatients: Number(availabilityForm[value].maxPatients) || 30,
      slotDurationMinutes: Number(availabilityForm[value].slotDurationMinutes) || 15,
    }));

  console.log('   Payload availability:', payload);
  console.log('   Total enabled days:', payload.length);

  return payload;
};

const toFormState = (doctor) => {
  if (!doctor) return emptyForm;
  return {
    fullName: doctor.user?.fullName ?? '',
    email: doctor.user?.email ?? '',
    phone: doctor.user?.phone ?? '',
    hospital: doctor.hospital?._id ?? doctor.hospital ?? '',
    department: doctor.department?._id ?? doctor.department ?? '',
    specialization: doctor.specialization ?? '',
    licenseNumber: doctor.licenseNumber ?? '',
    experienceYears: doctor.experienceYears ?? '',
    consultationFee: doctor.consultationFee ?? '',
    qualifications: doctor.qualifications?.join(', ') ?? '', // Convert array to comma-separated string
    isAvailableToday: doctor.isAvailableToday ?? true,
    availability: toAvailabilityFormState(doctor.availability),
    image: null,
  };
};

/**
 * Doctor create/edit intentionally does NOT touch hospital/department
 * assignment on edit (the backend deliberately routes that through
 * dedicated assign-hospital/assign-department endpoints — see
 * doctors.service.js) or account fields like email/phone. Those two
 * fields are shown read-only in edit mode so the admin can still see
 * who they're editing.
 *
 * Weekly availability (which days/hours a doctor is bookable) IS editable
 * here in both create and edit mode — the backend has always accepted it
 * on both `POST /doctors` and `PATCH /doctors/:id`, this form just never
 * exposed it, which meant every doctor was silently created with
 * `availability: []` and could never be booked on any day at all.
 */
const DoctorFormModal = ({ isOpen, onClose, doctor = null }) => {
  const [form, setForm] = useState(emptyForm);
  const isEditing = !!doctor;

  const { data: hospitalsData } = useAdminHospitals({ limit: 100, isActive: 'true' });
  const { data: departments } = useDepartmentsLookup(form.hospital);
  const createMutation = useCreateDoctor();
  const updateMutation = useUpdateDoctor();
  const mutation = isEditing ? updateMutation : createMutation;

  useEffect(() => {
    if (isOpen) setForm(toFormState(doctor));
  }, [isOpen, doctor]);

  const setField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const setDayField = (day, field) => (e) => {
    const value = field === 'enabled' ? e.target.checked : e.target.value;
    setForm((prev) => ({
      ...prev,
      availability: {
        ...prev.availability,
        [day]: { ...prev.availability[day], [field]: value },
      },
    }));
  };

  const handleImageSelect = (file) => {
    setForm((prev) => ({ ...prev, image: file }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const availability = toAvailabilityPayload(form.availability);
    // Convert comma-separated qualifications to array
    const qualifications = form.qualifications
      .split(',')
      .map((q) => q.trim())
      .filter((q) => q.length > 0);

    console.log('📋 [DOCTOR FORM] Submitting with availability:', availability);
    console.log('📋 [DOCTOR FORM] Qualifications:', qualifications);

    if (isEditing) {
      const payload = new FormData();
      payload.append('specialization', form.specialization.trim());
      payload.append('licenseNumber', form.licenseNumber.trim());
      if (form.experienceYears) {
        payload.append('experienceYears', Number(form.experienceYears));
      }
      payload.append('consultationFee', Number(form.consultationFee));
      payload.append('isAvailableToday', form.isAvailableToday);
      payload.append('qualifications', JSON.stringify(qualifications)); // NEW
      // CRITICAL: Always append availability as JSON string, even if empty
      payload.append('availability', JSON.stringify(availability));
      console.log('📋 [DOCTOR FORM] Availability JSON string:', JSON.stringify(availability));
      if (form.image) {
        payload.append('image', form.image);
      }
      await updateMutation.mutateAsync({
        id: doctor._id,
        payload,
      });
    } else {
      const payload = new FormData();
      payload.append('fullName', form.fullName.trim());
      payload.append('email', form.email.trim());
      payload.append('phone', form.phone.trim());
      payload.append('hospital', form.hospital);
      payload.append('department', form.department);
      payload.append('specialization', form.specialization.trim());
      payload.append('licenseNumber', form.licenseNumber.trim());
      if (form.experienceYears) {
        payload.append('experienceYears', Number(form.experienceYears));
      }
      payload.append('consultationFee', Number(form.consultationFee));
      payload.append('qualifications', JSON.stringify(qualifications)); // NEW
      // CRITICAL: Always append availability as JSON string, even if empty
      payload.append('availability', JSON.stringify(availability));
      console.log('📋 [DOCTOR FORM] Availability JSON string:', JSON.stringify(availability));
      if (form.image) {
        payload.append('image', form.image);
      }
      await createMutation.mutateAsync(payload);
    }
    onClose();
  };

  return (
    <Modal title={isEditing ? 'Edit Doctor' : 'Create Doctor'} isOpen={isOpen} onClose={onClose} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" value={form.fullName} onChange={setField('fullName')} required disabled={isEditing} />
          <Field label="Email" type="email" value={form.email} onChange={setField('email')} required disabled={isEditing} />
          <Field label="Phone" value={form.phone} onChange={setField('phone')} required disabled={isEditing} />
          <Field
            label="License number"
            value={form.licenseNumber}
            onChange={setField('licenseNumber')}
            required
          />
        </div>

        {!isEditing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Hospital" as="select" value={form.hospital} onChange={setField('hospital')} required>
              <option value="">Select a hospital</option>
              {hospitalsData?.hospitals?.map((h) => (
                <option key={h._id} value={h._id}>
                  {h.name}
                </option>
              ))}
            </Field>
            <Field
              label="Department"
              as="select"
              value={form.department}
              onChange={setField('department')}
              required
              disabled={!form.hospital}
            >
              <option value="">{form.hospital ? 'Select a department' : 'Choose a hospital first'}</option>
              {departments?.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </Field>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Specialization"
            value={form.specialization}
            onChange={setField('specialization')}
            required
          />
          <Field
            label="Experience (years)"
            type="number"
            min="0"
            value={form.experienceYears}
            onChange={setField('experienceYears')}
          />
          <Field
            label="Consultation fee (₹)"
            type="number"
            min="0"
            value={form.consultationFee}
            onChange={setField('consultationFee')}
            required
          />
        </div>

        {/* Qualifications */}
        <div>
          <label className="block text-sm font-medium text-ink mb-1">Qualifications</label>
          <textarea
            value={form.qualifications}
            onChange={(e) => setForm((prev) => ({ ...prev, qualifications: e.target.value }))}
            placeholder="Enter qualifications separated by commas (e.g., MBBS, MD - Cardiology, DM - Interventional Cardiology)"
            className="w-full rounded border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            rows="3"
          />
          <p className="mt-1 text-xs text-ink-subtle">
            Separate multiple qualifications with commas
          </p>
        </div>

        {/* Image Upload */}
        <ImagePreview
          label="Doctor Photo (optional)"
          onFileSelect={handleImageSelect}
          preview={form.imagePreview}
          isEditing={isEditing}
        />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-ink">Weekly availability</span>
            {isEditing && (
              <label className="flex items-center gap-2 text-xs text-ink-muted">
                <input
                  type="checkbox"
                  checked={form.isAvailableToday}
                  onChange={(e) => setForm((prev) => ({ ...prev, isAvailableToday: e.target.checked }))}
                />
                Available today (overrides the weekly schedule for just today)
              </label>
            )}
          </div>
          <p className="mb-2 text-xs text-ink-subtle">
            Tick the days this doctor sees patients — patients can only book on ticked days.
          </p>
          <div className="overflow-x-auto rounded border border-surface-border">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs text-ink-muted">
                <tr>
                  <th className="px-3 py-2">Day</th>
                  <th className="px-3 py-2">Available</th>
                  <th className="px-3 py-2">Start</th>
                  <th className="px-3 py-2">End</th>
                  <th className="px-3 py-2">Max Patients</th>
                  <th className="px-3 py-2">Slot Duration (min)</th>
                </tr>
              </thead>
              <tbody>
                {WEEKDAYS.map(({ value, label }) => {
                  const dayForm = form.availability[value];
                  return (
                    <tr key={value} className="border-t border-surface-border">
                      <td className="px-3 py-2 text-ink">{label}</td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={dayForm.enabled}
                          onChange={setDayField(value, 'enabled')}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="time"
                          className="rounded border border-surface-border px-2 py-1 text-sm disabled:bg-surface disabled:text-ink-subtle"
                          value={dayForm.startTime}
                          onChange={setDayField(value, 'startTime')}
                          disabled={!dayForm.enabled}
                          required={dayForm.enabled}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="time"
                          className="rounded border border-surface-border px-2 py-1 text-sm disabled:bg-surface disabled:text-ink-subtle"
                          value={dayForm.endTime}
                          onChange={setDayField(value, 'endTime')}
                          disabled={!dayForm.enabled}
                          required={dayForm.enabled}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="1"
                          max="200"
                          className="w-16 rounded border border-surface-border px-2 py-1 text-sm disabled:bg-surface disabled:text-ink-subtle"
                          value={dayForm.maxPatients || 30}
                          onChange={setDayField(value, 'maxPatients')}
                          disabled={!dayForm.enabled}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="5"
                          max="120"
                          className="w-20 rounded border border-surface-border px-2 py-1 text-sm disabled:bg-surface disabled:text-ink-subtle"
                          value={dayForm.slotDurationMinutes || 15}
                          onChange={setDayField(value, 'slotDurationMinutes')}
                          disabled={!dayForm.enabled}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {!isEditing && (
          <p className="text-xs text-ink-subtle">
            A temporary password is generated and emailed to the doctor.
          </p>
        )}

        {mutation.isError && (
          <p className="text-xs font-medium text-danger">{getApiErrorMessage(mutation.error)}</p>
        )}

        <div className="flex justify-end gap-2 border-t border-surface-border pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={mutation.isPending}>
            {isEditing ? 'Save changes' : 'Create doctor'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default DoctorFormModal;
