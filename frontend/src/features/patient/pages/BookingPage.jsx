import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Field from '../components/ui/PField';
import Button from '../components/ui/PButton';
import Card from '../components/ui/PCard';
import { Spinner, ErrorNotice } from '../components/ui/PStateNotice';
import { useDoctor, useDepartments } from '../hooks/useLookups';
import { useBookAppointment } from '../hooks/useAppointments';
import BookingSteps from '../components/BookingSteps';
import { ROUTES } from '../../../constants/routePaths';
import { SOCKET_EVENTS } from '../../../constants/socketEvents';
import { getApiErrorMessage } from '../../../utils/apiError';
import { useSocket } from '../../../hooks/useSocket';

const BOOKING_CONSTRAINTS = {
  MAX_ADVANCE_DAYS: 3,
};

const getMaxBookingDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + BOOKING_CONSTRAINTS.MAX_ADVANCE_DAYS);
  return date.toISOString().slice(0, 10);
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const isDoctorUnavailableOnDate = (doctor, dateString) => {
  if (!doctor?.unavailability) return false;

  const selectedDate = new Date(dateString);
  selectedDate.setUTCHours(0, 0, 0, 0);

  for (const unavail of doctor.unavailability) {
    const startDate = new Date(unavail.startDate);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(unavail.endDate);
    endDate.setUTCHours(0, 0, 0, 0);

    if (selectedDate >= startDate && selectedDate <= endDate) {
      return true;
    }
  }
  return false;
};

const BookingPage = () => {
  const { doctorId } = useParams();
  const [searchParams] = useSearchParams();
  const initialHospitalId = searchParams.get('hospitalId');
  const initialDepartmentId = searchParams.get('departmentId');
  const navigate = useNavigate();
  const { socket } = useSocket();

  const { data: doctor, isLoading, isError, refetch: refetchDoctor } = useDoctor(doctorId);

  const [hospitalId, setHospitalId] = useState(initialHospitalId);
  const [departmentId, setDepartmentId] = useState(initialDepartmentId);

  useEffect(() => {
    if (doctor && !hospitalId && doctor.hospital?._id) {
      setHospitalId(doctor.hospital._id);
    }
  }, [doctor, hospitalId]);

  const { data: departments } = useDepartments(hospitalId && !departmentId ? hospitalId : null);

  useEffect(() => {
    if (!departmentId && departments && departments.length > 0) {
      setDepartmentId(departments[0]._id);
    }
  }, [departments, departmentId]);

  const bookMutation = useBookAppointment();
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    appointmentDate: todayISO(),
    reasonForVisit: '',
    symptoms: '',
  });

  useEffect(() => {
    if (!socket || !doctorId) return;

    const handleUnavailabilityChange = (data) => {
      if (data.doctorId === doctorId) {
        refetchDoctor().catch(() => {});
      }
    };

    socket.on(SOCKET_EVENTS.DOCTOR_UNAVAILABILITY_CREATED, handleUnavailabilityChange);
    socket.on(SOCKET_EVENTS.DOCTOR_UNAVAILABILITY_UPDATED, handleUnavailabilityChange);
    socket.on(SOCKET_EVENTS.DOCTOR_UNAVAILABILITY_DELETED, handleUnavailabilityChange);

    return () => {
      socket.off(SOCKET_EVENTS.DOCTOR_UNAVAILABILITY_CREATED, handleUnavailabilityChange);
      socket.off(SOCKET_EVENTS.DOCTOR_UNAVAILABILITY_UPDATED, handleUnavailabilityChange);
      socket.off(SOCKET_EVENTS.DOCTOR_UNAVAILABILITY_DELETED, handleUnavailabilityChange);
    };
  }, [socket, doctorId, refetchDoctor]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === 'appointmentDate') {
      setFormError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!hospitalId || !departmentId) {
      setFormError('Missing hospital/department context — please restart the booking flow.');
      return;
    }

    const selectedDate = new Date(form.appointmentDate);
    selectedDate.setUTCHours(0, 0, 0, 0);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + BOOKING_CONSTRAINTS.MAX_ADVANCE_DAYS);
    maxDate.setUTCHours(0, 0, 0, 0);

    if (selectedDate < today || selectedDate > maxDate) {
      setFormError(
        `Appointments can be booked from today up to ${BOOKING_CONSTRAINTS.MAX_ADVANCE_DAYS} days in advance.`
      );
      return;
    }

    try {
      await refetchDoctor();

      const res = await bookMutation.mutateAsync({
        hospital: hospitalId,
        department: departmentId,
        doctor: doctorId,
        appointmentDate: form.appointmentDate,
        reasonForVisit: form.reasonForVisit,
        symptoms: form.symptoms
          ? form.symptoms
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
      });

      const result = res.data.data;
      navigate(`${ROUTES.PATIENT.BOOKING_SUCCESS}/${result.appointment._id}`, {
        replace: true,
        state: result,
      });
    } catch (err) {
      const errorMsg = getApiErrorMessage(
        err,
        'Booking failed. Please try a different date or time.'
      );
      setFormError(errorMsg);
    }
  };

  if (isLoading) return <Spinner label="Loading doctor details…" />;
  if (isError || !doctor) {
    return <ErrorNotice message="Couldn't load this doctor's details. Please try again." />;
  }

  return (
    <div className="space-y-6 sm:space-y-2xl">
      <BookingSteps current={4} />

      <div>
        <h1 className="text-2xl sm:text-display font-bold text-neutral-900">
          Confirm your appointment
        </h1>
        <p className="mt-1.5 sm:mt-md text-body text-neutral-600">
          Select your preferred date and provide any additional information.
        </p>
      </div>

      {/* Main Content: Responsive Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-2xl">
        {/* Left: Doctor Profile (Compact on mobile, Sticky on Desktop) */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-20">
            <Card>
              <div className="flex items-center gap-4 lg:flex-col lg:text-center">
                <div className="w-14 h-14 lg:w-16 lg:h-16 shrink-0 lg:mx-auto rounded-full bg-upchar-100 flex items-center justify-center">
                  <span className="text-xl lg:text-2xl font-bold text-upchar-600">
                    {doctor.user?.fullName?.charAt(0)}
                  </span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-h3 font-bold text-neutral-900 break-words">
                    Dr. {doctor.user?.fullName}
                  </h3>
                  <p className="mt-0.5 text-body-sm font-medium text-upchar-600 break-words">
                    {doctor.specialization}
                  </p>
                </div>
              </div>

              <div className="my-4 lg:my-lg border-t border-neutral-200" />

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 sm:gap-md">
                {doctor.hospital?.name && (
                  <div>
                    <p className="text-caption font-medium uppercase tracking-widest text-neutral-500">
                      Hospital
                    </p>
                    <p className="mt-0.5 text-body-sm font-semibold text-neutral-900 break-words">
                      {doctor.hospital.name}
                    </p>
                  </div>
                )}

                {doctor.hospital?.address?.line1 && (
                  <div>
                    <p className="text-caption font-medium uppercase tracking-widest text-neutral-500">
                      Location
                    </p>
                    <p className="mt-0.5 text-body-sm text-neutral-600 break-words">
                      {doctor.hospital.address.line1}
                      {doctor.hospital.address.line2 ? `, ${doctor.hospital.address.line2}` : ''}
                      {doctor.hospital.address.pincode
                        ? ` – ${doctor.hospital.address.pincode}`
                        : ''}
                    </p>
                  </div>
                )}

                {doctor.hospital?.contact?.phone && (
                  <div>
                    <p className="text-caption font-medium uppercase tracking-widest text-neutral-500">
                      Phone
                    </p>
                    <p className="mt-0.5 text-body-sm text-neutral-900">
                      {doctor.hospital.contact.phone}
                    </p>
                  </div>
                )}

                {doctor.consultationFee && (
                  <div>
                    <p className="text-caption font-medium uppercase tracking-widest text-neutral-500">
                      Consultation fee
                    </p>
                    <p className="mt-0.5 text-body font-semibold text-neutral-900">
                      ₹{doctor.consultationFee}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Right: Booking Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-2xl">
            <div>
              <h2 className="text-label font-semibold uppercase tracking-widest text-neutral-600 mb-3 sm:mb-lg">
                When would you like to visit?
              </h2>
              <div className="space-y-3 sm:space-y-md">
                <Field
                  label="Appointment date"
                  type="date"
                  name="appointmentDate"
                  min={todayISO()}
                  max={getMaxBookingDate()}
                  value={form.appointmentDate}
                  onChange={handleChange}
                  required
                />
                <p className="text-caption text-neutral-500">
                  You can book appointments from today up to {BOOKING_CONSTRAINTS.MAX_ADVANCE_DAYS}{' '}
                  days ahead.
                </p>
                {isDoctorUnavailableOnDate(doctor, form.appointmentDate) && (
                  <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3">
                    <p className="text-body-sm font-medium text-warning-700">
                      Dr. {doctor.user?.fullName} is unavailable on this date. Please select another
                      date.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-neutral-200" />

            <div>
              <h2 className="text-label font-semibold uppercase tracking-widest text-neutral-600 mb-3 sm:mb-lg">
                Tell us about your visit (optional)
              </h2>
              <div className="space-y-4 sm:space-y-lg">
                <Field
                  label="Reason for visit"
                  as="textarea"
                  name="reasonForVisit"
                  placeholder="e.g., General check-up, Follow-up, Consultation"
                  value={form.reasonForVisit}
                  onChange={handleChange}
                  rows={3}
                />
                <Field
                  label="Symptoms"
                  name="symptoms"
                  placeholder="e.g., fever, headache, cough (comma separated)"
                  value={form.symptoms}
                  onChange={handleChange}
                />
              </div>
            </div>

            {formError && (
              <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3">
                <p className="text-body-sm font-medium text-danger-700">{formError}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                type="submit"
                size="lg"
                isLoading={bookMutation.isPending}
                className="w-full sm:flex-1"
              >
                Confirm booking &amp; get token
              </Button>
            </div>

            <p className="text-caption text-neutral-500 text-center">
              By confirming, you agree to receive a token number and be placed in the queue. You
              can cancel up to 24 hours before your appointment.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default BookingPage;
