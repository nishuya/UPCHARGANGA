import { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useLogout } from '../../../hooks/useLogout';
import Card from '../components/ui/PCard';
import Button from '../components/ui/PButton';
import Field from '../components/ui/PField';
import { updateProfileRequest } from '../../auth/services/auth.api';
import { getApiErrorMessage } from '../../../utils/apiError';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

const formatDateForInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Premium UpcharGanga Patient Profile Page — Responsive
 */
const ProfilePage = () => {
  const { user } = useAuth();
  const handleLogout = useLogout();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    phone: user?.phone || '',
    gender: user?.gender || '',
    dateOfBirth: formatDateForInput(user?.dateOfBirth) || '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setIsSaving(true);

    try {
      await updateProfileRequest(formData);
      setSuccess('Profile updated successfully!');
      setIsEditing(false);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update profile. Please try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      phone: user?.phone || '',
      gender: user?.gender || '',
      dateOfBirth: formatDateForInput(user?.dateOfBirth) || '',
    });
    setError('');
    setSuccess('');
    setIsEditing(false);
  };

  const readOnlyRows = [
    { label: 'Full name', value: user?.fullName },
    { label: 'Email address', value: user?.email },
  ];

  return (
    <div className="space-y-6 sm:space-y-2xl max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-display font-bold text-neutral-900">Profile</h1>
        <p className="mt-1.5 sm:mt-md text-body text-neutral-600">
          Your UpcharGanga account information.
        </p>
      </div>

      {/* Success Message */}
      {success && (
        <div className="rounded-lg border border-success-200 bg-success-50 px-4 py-3">
          <p className="text-body-sm font-medium text-success-700">{success}</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3">
          <p className="text-body-sm font-medium text-danger-700">{error}</p>
        </div>
      )}

      {/* Read-Only Information Card */}
      <Card>
        <div className="space-y-4 sm:space-y-lg">
          {readOnlyRows.map((row, index) => (
            <div key={row.label}>
              <div className="flex flex-col xs:flex-row xs:items-start xs:justify-between gap-1 xs:gap-4">
                <dt className="text-body-sm font-medium text-neutral-600 shrink-0">
                  {row.label}
                </dt>
                <dd className="xs:text-right text-body-sm font-semibold text-neutral-900 break-all">
                  {row.value || '—'}
                </dd>
              </div>
              {index < readOnlyRows.length - 1 && (
                <div className="mt-4 sm:mt-lg border-t border-neutral-200" />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Editable Information Card */}
      <Card>
        {!isEditing ? (
          <div className="space-y-4 sm:space-y-lg">
            <div>
              <div className="flex flex-col xs:flex-row xs:items-start xs:justify-between gap-1 xs:gap-4">
                <dt className="text-body-sm font-medium text-neutral-600">Phone number</dt>
                <dd className="xs:text-right text-body-sm font-semibold text-neutral-900">
                  {user?.phone || '—'}
                </dd>
              </div>
              <div className="mt-4 sm:mt-lg border-t border-neutral-200" />
            </div>

            <div>
              <div className="flex flex-col xs:flex-row xs:items-start xs:justify-between gap-1 xs:gap-4">
                <dt className="text-body-sm font-medium text-neutral-600">Gender</dt>
                <dd className="xs:text-right text-body-sm font-semibold text-neutral-900">
                  {user?.gender ? user.gender[0].toUpperCase() + user.gender.slice(1) : '—'}
                </dd>
              </div>
              <div className="mt-4 sm:mt-lg border-t border-neutral-200" />
            </div>

            <div>
              <div className="flex flex-col xs:flex-row xs:items-start xs:justify-between gap-1 xs:gap-4">
                <dt className="text-body-sm font-medium text-neutral-600">Date of birth</dt>
                <dd className="xs:text-right text-body-sm font-semibold text-neutral-900">
                  {formatDate(user?.dateOfBirth)}
                </dd>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-lg">
            <Field
              label="Phone number"
              name="phone"
              type="tel"
              placeholder="+91 XXXXX XXXXX"
              value={formData.phone}
              onChange={handleChange}
            />

            <Field
              label="Gender"
              as="select"
              name="gender"
              value={formData.gender}
              onChange={handleChange}
            >
              <option value="">Not specified</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </Field>

            <Field
              label="Date of birth"
              type="date"
              name="dateOfBirth"
              value={formData.dateOfBirth}
              onChange={handleChange}
            />
          </div>
        )}
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col xs:flex-row gap-3 pt-2">
        {!isEditing ? (
          <>
            <Button
              variant="secondary"
              onClick={() => setIsEditing(true)}
              className="w-full xs:w-auto"
            >
              Edit Profile
            </Button>
            <Button
              variant="danger"
              onClick={handleLogout}
              className="w-full xs:w-auto"
            >
              Log out
            </Button>
          </>
        ) : (
          <>
            <Button
              onClick={handleSave}
              isLoading={isSaving}
              className="w-full xs:w-auto"
            >
              Save Changes
            </Button>
            <Button
              variant="secondary"
              onClick={handleCancel}
              disabled={isSaving}
              className="w-full xs:w-auto"
            >
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
