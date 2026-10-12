import { useState } from 'react';
import { Link } from 'react-router-dom';
import Field from '../components/ui/PField';
import Button from '../components/ui/PButton';
import { Spinner, EmptyState, ErrorNotice } from '../components/ui/PStateNotice';
import { useMyAppointments } from '../hooks/useAppointments';
import AppointmentCard from '../components/AppointmentCard';
import { ROUTES } from '../../../constants/routePaths';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'checked-in', label: 'Checked In' },
  { value: 'in-consultation', label: 'In Consultation' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

/**
 * Premium UpcharGanga Appointments List Page
 *
 * Displays all patient appointments with:
 * - Filter by status
 * - Quick booking action
 * - Professional empty/loading/error states
 * - Responsive appointment cards
 */
const AppointmentsPage = () => {
  const [status, setStatus] = useState('');
  const { data: appointments, isLoading, isError } = useMyAppointments(status ? { status } : {});

  return (
    <div className="space-y-2xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-lg">
        <div>
          <h1 className="text-display font-bold text-neutral-900">My Appointments</h1>
          <p className="mt-md text-body text-neutral-600">
            Track your bookings, queue positions, and appointment history.
          </p>
        </div>
        <Link to={ROUTES.PATIENT.CHOOSE_CITY}>
          <Button size="lg" className="w-full sm:w-auto">
            + Book new
          </Button>
        </Link>
      </div>

      {/* Filter Section */}
      <div className="max-w-sm">
        <Field
          as="select"
          label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Field>
      </div>

      {/* Loading State */}
      {isLoading && <Spinner label="Loading your appointments…" />}

      {/* Error State */}
      {isError && (
        <ErrorNotice
          message="Couldn't load your appointments right now."
          action={
            <button
              onClick={() => window.location.reload()}
              className="text-sm font-medium text-upchar-600 hover:text-upchar-700 underline"
            >
              Try again
            </button>
          }
        />
      )}

      {/* Empty State */}
      {!isLoading && !isError && appointments?.length === 0 && (
        <EmptyState
          title="No appointments match this filter"
          description={
            status
              ? 'Try selecting a different status or book a new appointment.'
              : 'You haven\'t booked any appointments yet. Start by booking your first appointment.'
          }
          action={
            <Link to={ROUTES.PATIENT.CHOOSE_CITY}>
              <Button size="sm" variant="secondary">
                Book an appointment
              </Button>
            </Link>
          }
        />
      )}

      {/* Appointments List */}
      {!isLoading && !isError && appointments?.length > 0 && (
        <div className="space-y-md">
          {appointments.map((appointment) => (
            <AppointmentCard key={appointment._id} appointment={appointment} />
          ))}
        </div>
      )}
    </div>
  );
};

export default AppointmentsPage;
