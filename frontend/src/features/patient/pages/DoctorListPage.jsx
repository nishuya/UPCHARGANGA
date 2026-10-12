import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import Field from '../components/ui/PField';
import Button from '../components/ui/PButton';
import { Spinner, EmptyState, ErrorNotice } from '../components/ui/PStateNotice';
import { useDepartments, useDoctors } from '../hooks/useLookups';
import DoctorCard from '../components/DoctorCard';
import BookingSteps from '../components/BookingSteps';
import { ROUTES } from '../../../constants/routePaths';

/**
 * Premium UpcharGanga Doctor Selection Page
 *
 * Step 3 of guided booking flow:
 * 1. City - select location
 * 2. Hospital - choose facility
 * 3. Doctor (THIS PAGE) - select specialist
 * 4. Confirm - book appointment
 *
 * Features:
 * - Filter by department
 * - Search by specialization
 * - Professional doctor cards
 * - Hospital context
 * - Back navigation
 */
const DoctorListPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hospitalId = searchParams.get('hospitalId');
  const hospitalName = searchParams.get('hospitalName');

  const [department, setDepartment] = useState('');
  const [search, setSearch] = useState('');

  const { data: departments } = useDepartments(hospitalId);
  const { data: doctors, isLoading, isError } = useDoctors(hospitalId, { department, search });

  const handleBook = (doctor) => {
    const departmentId = doctor.department?._id ?? doctor.department;
    navigate(
      `${ROUTES.PATIENT.BOOKING}/${doctor._id}?hospitalId=${hospitalId}&hospitalName=${encodeURIComponent(
        hospitalName || ''
      )}&departmentId=${departmentId}`
    );
  };

  if (!hospitalId) {
    return (
      <EmptyState
        title="Pick a hospital first"
        description="We need to know which hospital to search doctors in."
        action={
          <Link to={ROUTES.PATIENT.CHOOSE_CITY}>
            <Button size="sm" variant="secondary">
              Start over →
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-2xl">
      {/* Progress Stepper */}
      <BookingSteps current={3} />

      {/* Page Title */}
      <div>
        <h1 className="text-display font-bold text-neutral-900">
          Doctors at {hospitalName || 'this hospital'}
        </h1>
        <p className="mt-md text-body text-neutral-600">
          Choose a doctor to see their availability and book an appointment.
        </p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-lg max-w-2xl">
        <Field
          label="Department"
          as="select"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          <option value="">All departments</option>
          {departments?.map((dept) => (
            <option key={dept._id} value={dept._id}>
              {dept.name}
            </option>
          ))}
        </Field>

        <Field
          label="Search by specialization"
          placeholder="e.g., Cardiology, Pediatrics"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      {/* Loading State */}
      {isLoading && <Spinner label="Loading doctors…" />}

      {/* Error State */}
      {isError && (
        <ErrorNotice
          message="Couldn't load doctors right now. Please try again."
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
      {!isLoading && !isError && doctors?.length === 0 && (
        <EmptyState
          title="No doctors found"
          description={
            department || search
              ? 'Try adjusting your filters or search term.'
              : 'No doctors available at this hospital right now.'
          }
          action={
            <Link to={ROUTES.PATIENT.CHOOSE_CITY}>
              <Button size="sm" variant="secondary">
                Try another hospital
              </Button>
            </Link>
          }
        />
      )}

      {/* Doctors List */}
      {!isLoading && !isError && doctors?.length > 0 && (
        <div className="space-y-lg">
          {doctors.map((doctor) => (
            <DoctorCard key={doctor._id} doctor={doctor} onBook={handleBook} />
          ))}
        </div>
      )}

      {/* Back Navigation */}
      <div className="pt-lg border-t border-neutral-200">
        <Link
          to={ROUTES.PATIENT.CHOOSE_CITY}
          className="text-body-sm font-medium text-neutral-600 hover:text-upchar-600 transition-colors"
        >
          ← Start over
        </Link>
      </div>
    </div>
  );
};

export default DoctorListPage;
