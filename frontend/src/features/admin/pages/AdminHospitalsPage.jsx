import { useMemo, useState } from 'react';
import Field from '../../../components/ui/Field';
import Button from '../../../components/ui/Button';
import Pagination from '../../../components/ui/Pagination';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import FullScreenLoader from '../../../components/common/FullScreenLoader';
import StateNotice from '../../../components/ui/StateNotice';
import useDebouncedValue from '../../../hooks/useDebouncedValue';
import { useAdminHospitals, useDeleteHospital } from '../hooks/useAdminHospitals';
import HospitalFormModal from '../components/HospitalFormModal';
import AdminCard from '../components/AdminCard';
import { getApiErrorMessage } from '../../../utils/apiError';

const LIMIT = 12;

const AdminHospitalsPage = () => {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 400);
  const [editingHospital, setEditingHospital] = useState(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(null);

  const params = useMemo(() => {
    const p = { page, limit: LIMIT };
    if (search) p.search = search;
    return p;
  }, [page, search]);

  const { data, isLoading, isError } = useAdminHospitals(params);
  const deleteMutation = useDeleteHospital();

  const hospitals = data?.hospitals ?? [];

  const handleDeactivate = async () => {
    await deleteMutation.mutateAsync(confirmDeactivate._id);
    setConfirmDeactivate(null);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2xl">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Hospitals</h1>
          <p className="mt-md text-lg text-neutral-600">Every hospital on the platform, active or not.</p>
        </div>
        <Button onClick={() => setEditingHospital({})}>+ New Hospital</Button>
      </div>

      {/* Search */}
      <div className="mb-xl">
        <Field
          className="w-full sm:w-80"
          placeholder="Search by hospital name…"
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
          title="Couldn't load hospitals"
          description="Try refreshing the page or contact support."
        />
      )}

      {!isLoading && !isError && hospitals.length === 0 && (
        <StateNotice
          type="empty"
          title="No hospitals found"
          description={search ? "Try a different search, or create the first one." : "Get started by creating your first hospital."}
        />
      )}

      {!isLoading && !isError && hospitals.length > 0 && (
        <>
          {/* Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-lg mb-2xl">
            {hospitals.map((hospital) => (
              <AdminCard
                key={hospital._id}
                item={hospital}
                type="hospital"
                onEdit={() => setEditingHospital(hospital)}
                onDeactivate={() => setConfirmDeactivate(hospital)}
              />
            ))}
          </div>

          {/* Pagination */}
          {data && <Pagination page={data.page} limit={data.limit} total={data.total} onPageChange={setPage} />}
        </>
      )}

      {/* Modals */}
      <HospitalFormModal
        isOpen={!!editingHospital}
        onClose={() => setEditingHospital(null)}
        hospital={editingHospital && Object.keys(editingHospital).length ? editingHospital : null}
      />

      {confirmDeactivate && (
        <ConfirmDialog
          title={`Deactivate ${confirmDeactivate.name}?`}
          description="It will no longer appear as an option when patients book appointments."
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

export default AdminHospitalsPage;
