import { useMemo, useState } from 'react';
import Field from '../../../components/ui/Field';
import Button from '../../../components/ui/Button';
import Pagination from '../../../components/ui/Pagination';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import FullScreenLoader from '../../../components/common/FullScreenLoader';
import StateNotice from '../../../components/ui/StateNotice';
import useDebouncedValue from '../../../hooks/useDebouncedValue';
import { useAdminDoctors, useDeleteDoctor } from '../hooks/useAdminDoctors';
import { useAdminHospitals } from '../hooks/useAdminHospitals';
import DoctorFormModal from '../components/DoctorFormModal';
import DoctorUnavailabilityModal from '../components/DoctorUnavailabilityModal';
import AdminCard from '../components/AdminCard';
import { getApiErrorMessage } from '../../../utils/apiError';

const LIMIT = 12;

const AdminDoctorsPage = () => {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 400);
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [editingDoctor, setEditingDoctor] = useState(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(null);
  const [unavailabilityDoctor, setUnavailabilityDoctor] = useState(null);

  const { data: hospitalsData } = useAdminHospitals({ limit: 100, isActive: 'true' });

  const params = useMemo(() => {
    const p = { page, limit: LIMIT };
    if (search) p.search = search;
    if (hospitalFilter) p.hospital = hospitalFilter;
    return p;
  }, [page, search, hospitalFilter]);

  const { data, isLoading, isError } = useAdminDoctors(params);
  const deleteMutation = useDeleteDoctor();

  const doctors = data?.doctors ?? [];

  const handleDeactivate = async () => {
    await deleteMutation.mutateAsync(confirmDeactivate._id);
    setConfirmDeactivate(null);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 sm:mb-2xl">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">Doctors</h1>
          <p className="mt-1 sm:mt-md text-sm sm:text-lg text-neutral-600">Manage doctors across all hospitals on the platform.</p>
        </div>
        <Button onClick={() => setEditingDoctor({})} className="w-full sm:w-auto">+ New Doctor</Button>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 sm:mb-xl flex flex-col gap-3 sm:gap-md sm:flex-row sm:items-center">
        <Field
          className="w-full sm:w-80"
          placeholder="Search by name or specialization…"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPage(1);
          }}
        />
        <Field
          className="w-full sm:w-64"
          as="select"
          value={hospitalFilter}
          onChange={(e) => {
            setHospitalFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All hospitals</option>
          {hospitalsData?.hospitals?.map((h) => (
            <option key={h._id} value={h._id}>
              {h.name}
            </option>
          ))}
        </Field>
      </div>

      {/* Content */}
      {isLoading && <FullScreenLoader />}

      {isError && (
        <StateNotice
          type="error"
          title="Couldn't load doctors"
          description="Try refreshing the page or contact support."
        />
      )}

      {!isLoading && !isError && doctors.length === 0 && (
        <StateNotice
          type="empty"
          title="No doctors found"
          description={search || hospitalFilter ? "Try a different search or filter, or add the first doctor." : "Get started by adding your first doctor."}
        />
      )}

      {!isLoading && !isError && doctors.length > 0 && (
        <>
          {/* Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-lg mb-6 sm:mb-2xl">
            {doctors.map((doctor) => (
              <AdminCard
                key={doctor._id}
                item={doctor}
                type="doctor"
                onEdit={() => setEditingDoctor(doctor)}
                onDeactivate={() => setConfirmDeactivate(doctor)}
                onManageUnavailability={() => setUnavailabilityDoctor(doctor)}
              />
            ))}
          </div>

          {/* Pagination */}
          {data && <Pagination page={data.page} limit={data.limit} total={data.total} onPageChange={setPage} />}
        </>
      )}

      {/* Modals */}
      <DoctorFormModal
        isOpen={!!editingDoctor}
        onClose={() => setEditingDoctor(null)}
        doctor={editingDoctor && Object.keys(editingDoctor).length ? editingDoctor : null}
      />

      <DoctorUnavailabilityModal
        isOpen={!!unavailabilityDoctor}
        onClose={() => setUnavailabilityDoctor(null)}
        doctorId={unavailabilityDoctor?._id}
        doctorName={unavailabilityDoctor?.user?.fullName}
      />

      {confirmDeactivate && (
        <ConfirmDialog
          title={`Deactivate Dr. ${confirmDeactivate.user?.fullName}?`}
          description="This doctor will no longer be available for booking new appointments."
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

export default AdminDoctorsPage;
