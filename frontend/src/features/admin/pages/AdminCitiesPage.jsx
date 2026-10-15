import { useMemo, useState } from 'react';
import Field from '../../../components/ui/Field';
import Button from '../../../components/ui/Button';
import Pagination from '../../../components/ui/Pagination';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import FullScreenLoader from '../../../components/common/FullScreenLoader';
import StateNotice from '../../../components/ui/StateNotice';
import useDebouncedValue from '../../../hooks/useDebouncedValue';
import { useAdminCities, useDeleteCity } from '../hooks/useAdminCities';
import CityFormModal from '../components/CityFormModal';
import AdminCard from '../components/AdminCard';
import { getApiErrorMessage } from '../../../utils/apiError';

const LIMIT = 12;

const AdminCitiesPage = () => {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 400);
  const [editingCity, setEditingCity] = useState(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(null);

  const params = useMemo(() => {
    const p = { page, limit: LIMIT };
    if (search) p.search = search;
    return p;
  }, [page, search]);

  const { data, isLoading, isError } = useAdminCities(params);
  const deleteMutation = useDeleteCity();

  const cities = data?.cities ?? [];

  const handleDeactivate = async () => {
    await deleteMutation.mutateAsync(confirmDeactivate._id);
    setConfirmDeactivate(null);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 sm:mb-2xl">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">Cities</h1>
          <p className="mt-1 sm:mt-md text-sm sm:text-lg text-neutral-600">
            Cities the platform operates in. Cities appear in dropdowns when creating hospitals.
          </p>
        </div>
        <Button onClick={() => setEditingCity({})} className="w-full sm:w-auto">+ Add City</Button>
      </div>

      {/* Search */}
      <div className="mb-6 sm:mb-xl">
        <Field
          className="w-full sm:w-80"
          placeholder="Search by city name…"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {/* Content */}
      {isLoading && <FullScreenLoader />}

      {isError && (
        <StateNotice
          type="error"
          title="Couldn't load cities"
          description="Try refreshing the page or contact support."
        />
      )}

      {!isLoading && !isError && cities.length === 0 && (
        <StateNotice
          type="empty"
          title="No cities found"
          description={search ? "Try a different search, or add the first one." : "Get started by creating your first city."}
        />
      )}

      {!isLoading && !isError && cities.length > 0 && (
        <>
          {/* Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-lg mb-6 sm:mb-2xl">
            {cities.map((city) => (
              <AdminCard
                key={city._id}
                item={city}
                type="city"
                onEdit={() => setEditingCity(city)}
                onDeactivate={() => setConfirmDeactivate(city)}
              />
            ))}
          </div>

          {/* Pagination */}
          {data && <Pagination page={data.page} limit={data.limit} total={data.total} onPageChange={setPage} />}
        </>
      )}

      {/* Modals */}
      <CityFormModal
        isOpen={!!editingCity}
        onClose={() => setEditingCity(null)}
        city={editingCity && Object.keys(editingCity).length ? editingCity : null}
      />

      {confirmDeactivate && (
        <ConfirmDialog
          title={`Deactivate ${confirmDeactivate.name}?`}
          description="It will no longer appear as an option when creating a hospital or when patients choose a city."
          confirmLabel="Deactivate"
          isLoading={deleteMutation.isPending}
          error={
            deleteMutation.isError
              ? getApiErrorMessage(deleteMutation.error)
              : null
          }
          onConfirm={handleDeactivate}
          onCancel={() => setConfirmDeactivate(null)}
        />
      )}
    </div>
  );
};

export default AdminCitiesPage;
