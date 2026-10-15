import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Field from '../components/ui/PField';
import { Spinner, EmptyState, ErrorNotice } from '../components/ui/PStateNotice';
import { useCities } from '../hooks/useLookups';
import CityCard from '../components/CityCard';
import BookingSteps from '../components/BookingSteps';
import { ROUTES } from '../../../constants/routePaths';

/**
 * Premium UpcharGanga City Selection Page — Responsive
 */
const ChooseCityPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { data: cities, isLoading, isError } = useCities(search);

  const handleSelect = (city) => {
    navigate(
      `${ROUTES.PATIENT.CHOOSE_HOSPITAL}?cityId=${city._id}&cityName=${encodeURIComponent(city.name)}`
    );
  };

  return (
    <div className="space-y-6 sm:space-y-2xl">
      <BookingSteps current={1} />

      <div>
        <h1 className="text-2xl sm:text-display font-bold text-neutral-900">
          Where are you located?
        </h1>
        <p className="mt-1.5 sm:mt-md text-body text-neutral-600">
          Select your city to see available hospitals and doctors.
        </p>
      </div>

      <div className="w-full sm:max-w-sm">
        <Field
          label="Search city"
          placeholder="e.g., Bengaluru, Mumbai, Delhi"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <Spinner label="Loading cities…" />}

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

      {!isLoading && !isError && cities?.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:gap-lg sm:grid-cols-2 lg:grid-cols-3">
          {cities.map((city) => (
            <CityCard key={city._id} city={city} onSelect={handleSelect} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ChooseCityPage;
