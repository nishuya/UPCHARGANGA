import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import Field from '../components/ui/PField';
import { Spinner, EmptyState, ErrorNotice } from '../components/ui/PStateNotice';
import { useHospitals } from '../hooks/useLookups';
import HospitalCard from '../components/HospitalCard';
import BookingSteps from '../components/BookingSteps';
import Button from '../components/ui/PButton';
import { ROUTES } from '../../../constants/routePaths';

/**
 * Premium UpcharGanga Hospital Selection Page
 *
 * Step 2 of guided booking flow:
 * 1. City - select location
 * 2. Hospital (THIS PAGE) - choose facility
 * 3. Doctor - select specialist
 * 4. Confirm - book appointment
 *
 * Features:
 * - Shows city selection context
 * - Search hospitals by name
 * - Professional hospital cards
 * - Back navigation to city selection
 */
const ChooseHospitalPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cityId = searchParams.get('cityId');
  const cityName = searchParams.get('cityName');
  const [search, setSearch] = useState('');

  const { data: hospitals, isLoading, isError } = useHospitals(cityId, search);

  const handleSelect = (hospital) => {
    navigate(
      `${ROUTES.PATIENT.DOCTORS}?hospitalId=${hospital._id}&hospitalName=${encodeURIComponent(hospital.name)}`
    );
  };

  if (!cityId) {
    return (
      <EmptyState
        title="Pick a city first"
        description="We need to know which city to search hospitals in."
        action={
          <Link to={ROUTES.PATIENT.CHOOSE_CITY}>
            <Button size="sm" variant="secondary">
              Choose a city →
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-2xl">
      {/* Progress Stepper */}
      <BookingSteps current={2} />

      {/* Page Title */}
      <div>
        <h1 className="text-display font-bold text-neutral-900">
          Hospitals in {cityName || 'your city'}
        </h1>
        <p className="mt-md text-body text-neutral-600">
          Select the hospital you'd like to visit for your appointment.
        </p>
      </div>

      {/* Search Field */}
      <div className="max-w-sm">
        <Field
          label="Search hospital"
          placeholder="e.g., City Care Hospital, Apollo"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      {/* Loading State */}
      {isLoading && <Spinner label="Loading hospitals…" />}

      {/* Error State */}
      {isError && (
        <ErrorNotice
          message="Couldn't load hospitals right now. Please try again."
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
      {!isLoading && !isError && hospitals?.length === 0 && (
        <EmptyState
          title="No hospitals found"
          description={
            search
              ? `No hospitals match "${search}". Try a different search term or city.`
              : 'No hospitals available in this city right now.'
          }
          action={
            <Link to={ROUTES.PATIENT.CHOOSE_CITY}>
              <Button size="sm" variant="secondary">
                Try another city
              </Button>
            </Link>
          }
        />
      )}

      {/* Hospitals Grid */}
      {!isLoading && !isError && hospitals?.length > 0 && (
        <div className="grid gap-lg sm:grid-cols-2">
          {hospitals.map((hospital) => (
            <HospitalCard key={hospital._id} hospital={hospital} onSelect={handleSelect} />
          ))}
        </div>
      )}

      {/* Back Navigation */}
      <div className="pt-lg border-t border-neutral-200">
        <Link
          to={ROUTES.PATIENT.CHOOSE_CITY}
          className="text-body-sm font-medium text-neutral-600 hover:text-upchar-600 transition-colors"
        >
          ← Back to city selection
        </Link>
      </div>
    </div>
  );
};

export default ChooseHospitalPage;
