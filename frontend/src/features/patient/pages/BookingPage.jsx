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

// Booking constraints (must match backend)
const BOOKING_CONSTRAINTS = {
  MAX_ADVANCE_DAYS: 3,
};

const getMaxBookingDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + BOOKING_CONSTRAINTS.MAX_ADVANCE_DAYS);
  return date.toISOString().slice(0, 10);
};

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Check if a doctor is unavailable on a specific date
 */
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

  // State for hospital and department (not URL params - fix stale closure)
  const [hospitalId, setHospitalId] = useState(initialHospitalId);
  const [departmentId, setDepartmentId] = useState(initialDepartmentId);

  // Fallback: extract hospital from doctor object if not in search params
  useEffect(() => {
    if (doctor && !hospitalId && doctor.hospital?._id) {
      setHospitalId(doctor.hospital._id);
    }
  }, [doctor, hospitalId]);

  // Fetch departments for this hospital if we have hospitalId but no departmentId
  const { data: departments } = useDepartments(hospitalId && !departmentId ? hospitalId : null);

  // Use first department as fallback if not provided
  useEffect(() => {
    if (!departmentId && departments && departments.length > 0) {
      setDepartmentId(departments[0]._id);
    }
  }, [departments, departmentId]);

  const bookMutation = useBookAppointment();
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ appointmentDate: todayISO(), reasonForVisit: '', symptoms: '' });

  // Listen for real-time doctor unavailability updates
  useEffect(() => {
    if (!socket || !doctorId) return;

    const handleUnavailabilityCreated = (data) => {
      if (import.meta.env.DEV) {
        console.log('🚨 [BOOKING] Doctor unavailability created:', data);
      }
      if (data.doctorId === doctorId) {
        // Refetch doctor to get updated unavailability
        refetchDoctor().catch((err) => {
          if (import.meta.env.DEV) {
            console.error('Failed to refetch doctor after unavailability created:', err);
          }
        });
      }
    };

    const handleUnavailabilityUpdated = (data) => {
      if (import.meta.env.DEV) {
        console.log('🚨 [BOOKING] Doctor unavailability updated:', data);
      }
      if (data.doctorId === doctorId) {
        refetchDoctor().catch((err) => {
          if (import.meta.env.DEV) {
            console.error('Failed to refetch doctor after unavailability updated:', err);
          }
        });
      }
    };

    const handleUnavailabilityDeleted = (data) => {
      if (import.meta.env.DEV) {
        console.log('🚨 [BOOKING] Doctor unavailability deleted:', data);
      }
      if (data.doctorId === doctorId) {
        refetchDoctor().catch((err) => {
          if (import.meta.env.DEV) {
            console.error('Failed to refetch doctor after unavailability deleted:', err);
          }
        });
      }
    };

    // Use socket event constants instead of hardcoded strings
    socket.on(SOCKET_EVENTS.DOCTOR_UNAVAILABILITY_CREATED, handleUnavailabilityCreated);
    socket.on(SOCKET_EVENTS.DOCTOR_UNAVAILABILITY_UPDATED, handleUnavailabilityUpdated);
    socket.on(SOCKET_EVENTS.DOCTOR_UNAVAILABILITY_DELETED, handleUnavailabilityDeleted);

    return () => {
      socket.off(SOCKET_EVENTS.DOCTOR_UNAVAILABILITY_CREATED, handleUnavailabilityCreated);
      socket.off(SOCKET_EVENTS.DOCTOR_UNAVAILABILITY_UPDATED, handleUnavailabilityUpdated);
      socket.off(SOCKET_EVENTS.DOCTOR_UNAVAILABILITY_DELETED, handleUnavailabilityDeleted);
    };
  }, [socket, doctorId, refetchDoctor]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));

    // Clear error when user changes date
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

    // Validate booking window (max 3 days, but can book same-day)
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
      // CRITICAL: Refetch doctor immediately before booking to get LATEST availability
      console.log('🔄 Refreshing doctor availability before booking...');
      await refetchDoctor();

      console.log('📋 Attempting to book appointment:', {
        doctor: doctorId,
        date: form.appointmentDate,
        hospital: hospitalId,
        doctorAvailability: doctor?.availability,
      });

      const res = await bookMutation.mutateAsync({
        hospital: hospitalId,
        department: departmentId,
        doctor: doctorId,
        appointmentDate: form.appointmentDate,
        reasonForVisit: form.reasonForVisit,
        symptoms: form.symptoms
          ? form.symptoms.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
      });

      console.log('✅ Booking successful:', res.data.data);
      const result = res.data.data;
      navigate(`${ROUTES.PATIENT.BOOKING_SUCCESS}/${result.appointment._id}`, {
        replace: true,
        state: result,
      });
    } catch (err) {
      const errorMsg = getApiErrorMessage(err, 'Booking failed. Please try a different date or time.');
      console.error('❌ Booking failed:', errorMsg, err);
      setFormError(errorMsg);
    }
  };

  const isDateDisabled = (dateString) => {
    // Check if date is within booking window (today to 3 days ahead)
    const selectedDate = new Date(dateString);
    selectedDate.setUTCHours(0, 0, 0, 0);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + BOOKING_CONSTRAINTS.MAX_ADVANCE_DAYS);
    maxDate.setUTCHours(0, 0, 0, 0);

    if (selectedDate < today || selectedDate > maxDate) {
      return true;
    }

    // Check if doctor is unavailable on this date
    if (isDoctorUnavailableOnDate(doctor, dateString)) {
      return true;
    }

    return false;
  };

  if (isLoading) return <Spinner label="Loading doctor details…" />;
  if (isError || !doctor) {
    return (
      <ErrorNotice message="Couldn't load this doctor's details. Please try again." />
    );
  }

  return (
    <div className="space-y-2xl">
      {/* Progress Stepper */}
      <BookingSteps current={4} />

      {/* Page Title */}
      <div>
        <h1 className="text-display font-bold text-neutral-900">
          Confirm your appointment
        </h1>
        <p className="mt-md text-body text-neutral-600">
          Select your preferred date and provide any additional information.
        </p>
      </div>

      {/* Main Content: Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2xl">
        {/* Left: Doctor Profile (Sticky on Desktop) */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-lg">
            <Card>
              {/* Doctor Info */}
              <div className="text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-upchar-100 flex items-center justify-center">
                  <span className="text-2xl font-bold text-upchar-600">
                    {doctor.user?.fullName?.charAt(0)}
                  </span>
                </div>
                <h3 className="mt-lg text-h3 font-bold text-neutral-900">
                  Dr. {doctor.user?.fullName}
                </h3>
                <p className="mt-sm text-body-sm font-medium text-upchar-600">
                  {doctor.specialization}
                </p>
              </div>

              {/* Divider */}
              <div className="my-lg border-t border-neutral-200" />

              {/* Hospital Details */}
              <div className="space-y-md">
                {doctor.hospital?.name && (
                  <div>
                    <p className="text-caption font-medium uppercase tracking-widest text-neutral-500">
                      Hospital
                    </p>
                    <p className="mt-sm text-body-sm font-semibold text-neutral-900">
                      {doctor.hospital.name}
                    </p>
                  </div>
                )}

                {doctor.hospital?.address?.line1 && (
                  <div>
                    <p className="text-caption font-medium uppercase tracking-widest text-neutral-500">
                      Location
                    </p>
                    <p className="mt-sm text-body-sm text-neutral-600">
                      {doctor.hospital.address.line1}
                      {doctor.hospital.address.line2 ? `, ${doctor.hospital.address.line2}` : ''}
                      {doctor.hospital.address.pincode ? ` – ${doctor.hospital.address.pincode}` : ''}
                    </p>
                  </div>
                )}

                {doctor.hospital?.contact?.phone && (
                  <div>
                    <p className="text-caption font-medium uppercase tracking-widest text-neutral-500">
                      Phone
                    </p>
                    <p className="mt-sm text-body-sm text-neutral-900">
                      {doctor.hospital.contact.phone}
                    </p>
                  </div>
                )}

                {doctor.consultationFee && (
                  <div>
                    <p className="text-caption font-medium uppercase tracking-widest text-neutral-500">
                      Consultation fee
                    </p>
                    <p className="mt-sm text-body font-semibold text-neutral-900">
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
          <form onSubmit={handleSubmit} className="space-y-2xl">
            {/* Section: Appointment Details */}
            <div>
              <h2 className="text-label font-semibold uppercase tracking-widest text-neutral-600 mb-lg">
                When would you like to visit?
              </h2>
              <div className="space-y-md">
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
                  You can book appointments from today up to {BOOKING_CONSTRAINTS.MAX_ADVANCE_DAYS} days ahead.
                </p>
                {isDoctorUnavailableOnDate(doctor, form.appointmentDate) && (
                  <div className="rounded-lg border border-warning-200 bg-warning-50 px-lg py-md">
                    <p className="text-body-sm font-medium text-warning-700">
                      Dr. {doctor.user?.fullName} is unavailable on this date. Please select another date.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-neutral-200" />

            {/* Section: Medical Information */}
            <div>
              <h2 className="text-label font-semibold uppercase tracking-widest text-neutral-600 mb-lg">
                Tell us about your visit (optional)
              </h2>
              <div className="space-y-lg">
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

            {/* Error Message */}
            {formError && (
              <div className="rounded-lg border border-danger-200 bg-danger-50 px-lg py-md">
                <p className="text-body-sm font-medium text-danger-700">{formError}</p>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex flex-col sm:flex-row gap-md pt-lg">
              <Button
                type="submit"
                size="lg"
                isLoading={bookMutation.isPending}
                className="flex-1"
              >
                Confirm booking & get token
              </Button>
            </div>

            {/* Terms Notice */}
            <p className="text-caption text-neutral-500 text-center">
              By confirming, you agree to receive a token number and be placed in the queue.
              You can cancel up to 24 hours before your appointment.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default BookingPage;
