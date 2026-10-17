import { Link, useLocation, useParams } from 'react-router-dom';
import Button from '../components/ui/PButton';
import { Spinner, ErrorNotice } from '../components/ui/PStateNotice';
import { useAppointment } from '../hooks/useAppointments';
import { ROUTES } from '../../../constants/routePaths';
import UpcharGangaLogo from '../../../assets/logo/UpcharGangaLogo';
import { formatHospitalTime } from '../../../utils/dateTime';

const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const formatDateTime = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const BookingSuccessPage = () => {
  const { appointmentId } = useParams();
  const location = useLocation();
  const bookingResult = location.state;

  const shouldFetch = !bookingResult;
  const { data: fetchedAppointment, isLoading, isError } = useAppointment(
    shouldFetch ? appointmentId : null
  );

  const appointment = bookingResult?.appointment || fetchedAppointment;
  const bookingNumber = bookingResult?.bookingNumber || appointment?.bookingNumber;
  const queueNumber = bookingResult?.queueNumber ?? appointment?.tokenNumber;
  const queueStatus = bookingResult?.queueStatus;
  const estimatedStart =
    bookingResult?.estimatedConsultationStartTime ||
    appointment?.estimatedConsultationStartTime;
  const estimatedEnd =
    bookingResult?.estimatedConsultationEndTime ||
    appointment?.estimatedConsultationEndTime;

  if (shouldFetch && isLoading) return <Spinner label="Loading your booking…" />;
  if (shouldFetch && (isError || !appointment)) {
    return (
      <ErrorNotice message="Couldn't load this booking. Check My Appointments instead." />
    );
  }

  const handlePrint = () => {
    window.print();
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'My Appointment Receipt',
        text: `Token #${queueNumber} at ${appointment?.hospital?.name}`,
      });
    }
  };

  return (
    <div className="py-2 sm:py-6 print:bg-white">
      {/* Print-only header */}
      <div className="hidden print:block mb-6 text-center">
        <h1 className="text-2xl font-bold text-neutral-900">UpcharGanga</h1>
        <p className="text-sm text-neutral-600">Smart Hospital Queue Management</p>
      </div>

      {/* Main Receipt Container */}
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border-2 border-upchar-200 bg-white shadow-xl overflow-hidden print:shadow-none print:border-neutral-300">
          {/* Header Section */}
          <div className="border-b-2 border-upchar-100 px-4 sm:px-xl py-6 sm:py-2xl text-center bg-gradient-to-b from-upchar-50 to-white">
            <div className="flex items-center justify-center gap-2.5 sm:gap-md mb-4 sm:mb-xl print:mb-lg">
              <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0">
                <UpcharGangaLogo variant="mark" />
              </div>
              <div className="text-left">
                <h1 className="text-lg sm:text-h2 font-black text-upchar-700">UpcharGanga</h1>
                <p className="text-caption text-upchar-600">Hospital Queue Management</p>
              </div>
            </div>

            <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-success-100 text-3xl sm:text-4xl text-success-600 mb-3 sm:mb-lg">
              ✓
            </div>

            <h2 className="text-xl sm:text-h2 font-bold text-neutral-900">
              Appointment Confirmed
            </h2>
            <p className="mt-1 text-body text-neutral-600">
              Your appointment has been successfully booked
            </p>
          </div>

          {/* Token Display - Visual Centerpiece */}
          <div className="px-4 sm:px-xl py-6 sm:py-3xl text-center border-b-2 border-upchar-100 bg-white">
            <p className="text-label font-semibold uppercase tracking-widest text-neutral-500 mb-3">
              Your Token Number
            </p>
            <div className="inline-block rounded-2xl border-2 border-upchar-200 bg-gradient-to-br from-upchar-50 to-neutral-0 px-6 sm:px-3xl py-4 sm:py-2xl">
              <p className="font-display text-4xl xs:text-5xl sm:text-7xl font-black text-upchar-600">
                #{queueNumber}
              </p>
            </div>
            <p className="mt-4 text-body-sm text-neutral-600">
              Keep this number safe. You&apos;ll use it to track your appointment.
            </p>
          </div>

          {/* Doctor & Hospital Section */}
          <div className="px-4 sm:px-xl py-5 sm:py-xl border-b-2 border-upchar-100">
            <div className="space-y-4 sm:space-y-lg">
              <div>
                <p className="text-label font-semibold uppercase tracking-widest text-neutral-500 mb-1">
                  Doctor
                </p>
                <p className="text-lg sm:text-h3 font-bold text-neutral-900 break-words">
                  Dr. {appointment?.doctor?.user?.fullName}
                </p>
                <p className="mt-0.5 text-body-sm text-neutral-600">
                  {appointment?.doctor?.specialization}
                </p>
              </div>

              <div>
                <p className="text-label font-semibold uppercase tracking-widest text-neutral-500 mb-1">
                  Hospital
                </p>
                <p className="text-body font-semibold text-neutral-900 break-words">
                  {appointment?.hospital?.name}
                </p>
                {appointment?.hospital?.address?.line1 && (
                  <p className="mt-1 text-body-sm text-neutral-600 break-words">
                    {appointment.hospital.address.line1}
                    {appointment.hospital.address.line2
                      ? `, ${appointment.hospital.address.line2}`
                      : ''}
                    {appointment.hospital.address.pincode
                      ? ` – ${appointment.hospital.address.pincode}`
                      : ''}
                  </p>
                )}
                {appointment?.hospital?.contact?.phone && (
                  <p className="mt-1 text-body-sm text-neutral-600">
                    📞 {appointment.hospital.contact.phone}
                  </p>
                )}
              </div>

              {appointment?.department?.name && (
                <div>
                  <p className="text-label font-semibold uppercase tracking-widest text-neutral-500 mb-1">
                    Department
                  </p>
                  <p className="text-body font-semibold text-neutral-900">
                    {appointment.department.name}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Patient Information Section */}
          <div className="px-4 sm:px-xl py-5 sm:py-xl border-b-2 border-upchar-100">
            <p className="text-label font-semibold uppercase tracking-widest text-neutral-500 mb-3 sm:mb-lg">
              Patient Information
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-lg">
              <div>
                <p className="text-caption font-medium text-neutral-500">Patient Name</p>
                <p className="mt-1 text-body-sm font-semibold text-neutral-900 break-words">
                  {appointment?.patient?.fullName || appointment?.bookedByPatient?.fullName}
                </p>
              </div>
              <div>
                <p className="text-caption font-medium text-neutral-500">Booking Reference</p>
                <p className="mt-1 text-body-sm font-semibold text-neutral-900 font-mono break-all">
                  {bookingNumber}
                </p>
              </div>
            </div>
          </div>

          {/* Appointment Details Section */}
          <div className="px-4 sm:px-xl py-5 sm:py-xl border-b-2 border-upchar-100">
            <p className="text-label font-semibold uppercase tracking-widest text-neutral-500 mb-3 sm:mb-lg">
              Appointment Details
            </p>
            <div className="grid grid-cols-1 xs:grid-cols-2 gap-4 sm:gap-lg">
              <div>
                <p className="text-caption font-medium text-neutral-500">Date</p>
                <p className="mt-1 text-body font-semibold text-neutral-900">
                  {formatDate(appointment?.appointmentDate)}
                </p>
              </div>
              <div>
                <p className="text-caption font-medium text-neutral-500">Booked time slot</p>
                <p className="mt-1 text-body font-semibold text-neutral-900">
                  {formatHospitalTime(appointment?.timeSlot?.start)} –{' '}
                  {formatHospitalTime(appointment?.timeSlot?.end)}
                </p>
              </div>

              {estimatedStart && estimatedEnd && (
                <div>
                  <p className="text-caption font-medium text-neutral-500">
                    Estimated consultation
                  </p>
                  <p className="mt-1 text-body font-semibold text-neutral-900">
                    {formatHospitalTime(estimatedStart)} – {formatHospitalTime(estimatedEnd)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Queue Information Section */}
          {(queueStatus?.currentServingToken != null || queueStatus?.queuePosition != null) && (
            <div className="px-4 sm:px-xl py-5 sm:py-xl border-b-2 border-upchar-100">
              <p className="text-label font-semibold uppercase tracking-widest text-neutral-500 mb-3 sm:mb-lg">
                Queue Information
              </p>
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-4 sm:gap-lg">
                {queueStatus?.currentServingToken != null && (
                  <div>
                    <p className="text-caption font-medium text-neutral-500">Currently Serving</p>
                    <p className="mt-1 text-body font-semibold text-neutral-900">
                      #{queueStatus.currentServingToken}
                    </p>
                  </div>
                )}

                {queueStatus?.queuePosition != null && (
                  <div>
                    <p className="text-caption font-medium text-neutral-500">Your Position</p>
                    <p className="mt-1 text-body font-semibold text-neutral-900">
                      {queueStatus.queuePosition}
                      {queueStatus.queuePosition === 1
                        ? " (You're next!)"
                        : ` (${Math.max(queueStatus.queuePosition - 1, 0)} ahead)`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Booking Metadata Section */}
          <div className="px-4 sm:px-xl py-5 sm:py-xl border-b-2 border-upchar-100 bg-neutral-50">
            <p className="text-label font-semibold uppercase tracking-widest text-neutral-500 mb-3 sm:mb-lg">
              Booking Information
            </p>
            <div className="space-y-3 text-body-sm">
              <div className="flex flex-col xs:flex-row xs:justify-between xs:items-center gap-1">
                <span className="text-neutral-600 shrink-0">Appointment ID</span>
                <span className="font-mono font-semibold text-neutral-900 break-all">
                  {appointment?._id}
                </span>
              </div>
              <div className="flex flex-col xs:flex-row xs:justify-between xs:items-center gap-1">
                <span className="text-neutral-600 shrink-0">Booked On</span>
                <span className="font-semibold text-neutral-900">
                  {appointment?.createdAt ? formatDateTime(appointment.createdAt) : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Footer Notice */}
          <div className="px-4 sm:px-xl py-5 sm:py-xl text-center text-caption text-neutral-600 bg-gradient-to-t from-neutral-50 to-white">
            <p>
              Please arrive at the hospital at least 15 minutes before your appointment time.
            </p>
            <p className="mt-2">You can track your appointment live on your dashboard.</p>
          </div>
        </div>

        {/* Action Buttons - Not in Print */}
        <div className="print:hidden mt-6 sm:mt-2xl flex flex-col sm:flex-row flex-wrap gap-3 justify-center">
          <Button
            variant="secondary"
            size="lg"
            onClick={handlePrint}
            className="w-full sm:w-auto"
          >
            🖨️ Print Receipt
          </Button>

          {typeof navigator !== 'undefined' && navigator.share && (
            <Button
              variant="secondary"
              size="lg"
              onClick={handleShare}
              className="w-full sm:w-auto"
            >
              📤 Share
            </Button>
          )}

          <Link
            to={`${ROUTES.PATIENT.APPOINTMENT_TRACK}/${appointment?._id}`}
            className="w-full sm:w-auto"
          >
            <Button size="lg" className="w-full">
              Track Appointment
            </Button>
          </Link>

          <Link to={ROUTES.PATIENT.ROOT} className="w-full sm:w-auto">
            <Button variant="ghost" size="lg" className="w-full">
              Back to Dashboard
            </Button>
          </Link>
        </div>

        {/* Print-only footer */}
        <div className="hidden print:block mt-xl text-center text-xs text-neutral-600 border-t border-neutral-300 pt-lg">
          <p>This is your digital appointment receipt. Please keep it safe.</p>
          <p>Visit your UpcharGanga dashboard to track your appointment in real-time.</p>
        </div>
      </div>
    </div>
  );
};

export default BookingSuccessPage;
