import { useEffect, useState } from 'react';
import Modal from '../../../components/ui/Modal';
import Field from '../../../components/ui/Field';
import Button from '../../../components/ui/Button';
import ImagePreview from '../../../components/ui/ImagePreview';
import { useCreateCity, useUpdateCity } from '../hooks/useAdminCities';
import { getApiErrorMessage } from '../../../utils/apiError';

const emptyForm = {
  name: '',
  state: '',
  country: 'India',
  postalCodes: '', // comma-separated in the UI, split into an array on submit
  image: null, // image file
};

const toFormState = (city) => {
  if (!city) return emptyForm;
  return {
    name: city.name ?? '',
    state: city.state ?? '',
    country: city.country ?? 'India',
    postalCodes: (city.postalCodes ?? []).join(', '),
    image: null, // start fresh for edit
  };
};

const toPayload = (form) => {
  const formData = new FormData();
  formData.append('name', form.name.trim());
  formData.append('state', form.state.trim());
  formData.append('country', form.country.trim() || 'India');
  formData.append(
    'postalCodes',
    JSON.stringify(
      form.postalCodes
        .split(',')
        .map((code) => code.trim())
        .filter(Boolean)
    )
  );
  if (form.image) {
    formData.append('image', form.image);
  }
  return formData;
};

/** Create/edit form for a City — the reference/lookup list that powers
 * the City dropdown on the Create Hospital form and the patient-facing
 * "choose your city" screen. */
const CityFormModal = ({ isOpen, onClose, city = null }) => {
  const [form, setForm] = useState(emptyForm);
  const isEditing = !!city;
  const createMutation = useCreateCity();
  const updateMutation = useUpdateCity();
  const mutation = isEditing ? updateMutation : createMutation;

  useEffect(() => {
    if (isOpen) setForm(toFormState(city));
  }, [isOpen, city]);

  const setField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleImageSelect = (file) => {
    setForm((prev) => ({ ...prev, image: file }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = toPayload(form);
    if (isEditing) {
      await updateMutation.mutateAsync({ id: city._id, payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    onClose();
  };

  return (
    <Modal title={isEditing ? 'Edit City' : 'Add City'} isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="City name" value={form.name} onChange={setField('name')} required />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="State" value={form.state} onChange={setField('state')} required />
          <Field label="Country" value={form.country} onChange={setField('country')} required />
        </div>
        <Field
          label="Postal codes (optional)"
          placeholder="e.g. 800001, 800002"
          value={form.postalCodes}
          onChange={setField('postalCodes')}
        />
        <p className="text-xs text-ink-subtle">Separate multiple postal codes with commas.</p>

        {/* Image Upload */}
        <ImagePreview
          label="City Image (optional)"
          onFileSelect={handleImageSelect}
          preview={form.imagePreview}
          isEditing={isEditing}
        />

        {mutation.isError && (
          <p className="text-xs font-medium text-danger">
            {getApiErrorMessage(mutation.error)}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-surface-border pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={mutation.isPending}>
            {isEditing ? 'Save changes' : 'Add city'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default CityFormModal;
