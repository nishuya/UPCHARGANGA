import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Field from '../components/ui/PField';
import { Spinner, EmptyState, ErrorNotice } from '../components/ui/PStateNotice';
import { useCities } from '../hooks/useLookups';
import CityCard from '../components/CityCard';
import BookingSteps from '../components/BookingSteps';
import { ROUTES } from '../../../constants/routePaths';

/**
 * Premium UpcharGanga City Selection Page
 *
 * Step 1 of guided booking flow:
 * 1. City (THIS PAGE) - select location
 * 2. Hospital - choose facility
 * 3. Doctor - select specialist
 * 4. Confirm - book appointment
 *
 * Features:
 * - Search by city name
 * - City cards with professional styling
 * - Clear navigation progress
 */
const ChooseCityPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { data: cities, isLoading, isError } = useCities(search);

  const handleSelect = (city) => {
    navigate(`${ROUTES.PATIENT.CHOOSE_HOSPITAL}?cityId=${city._id}&cityName=${encodeURIComponent(city.name)}`);
  };

  return (
    <div className="space-y-2xl">
      {/* Progress Stepper */}
      <BookingSteps current={1} />

      {/* Page Title */}
      <div>
        <h1 className="text-display font-bold text-neutral-900">Where are you located?</h1>
        <p className="mt-md text-body text-neutral-600">
          Select your city to see available hospitals and doctors.
        </p>
      </div>

      {/* Search Field */}
      <div className="max-w-sm">
        <Field
          label="Search city"
          placeholder="e.g., Bengaluru, Mumbai, Delhi"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      {/* Loading State */}
      {isLoading && <Spinner label="Loading cities…" />}

      {/* Error State */}
      {isError && (
        <ErrorNotice
          message="Couldn't load cities right now. Please try again."
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
      {!isLoading && !isError && cities?.length === 0 && (
        <EmptyState
          title="No cities found"
          description={
            search
              ? `No cities match "${search}". Try a different search term.`
              : 'Try searching for a city to get started.'
          }
        />
      )}

      {/* Cities Grid */}
      {!isLoading && !isError && cities?.length > 0 && (
        <div className="grid gap-lg sm:grid-cols-2 lg:grid-cols-3">
          {cities.map((city) => (
            <CityCard key={city._id} city={city} onSelect={handleSelect} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ChooseCityPage;
