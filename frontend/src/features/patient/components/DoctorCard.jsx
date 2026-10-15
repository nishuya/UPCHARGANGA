import { useState } from 'react';
import Button from './ui/PButton';
import Card from './ui/PCard';

/**
 * Premium UpcharGanga Doctor Card
 */
const DoctorCard = ({ doctor, onBook }) => {
  const [imageError, setImageError] = useState(false);

  const hasImage = doctor.image?.url && !imageError;
  const doctorName = doctor.user?.fullName || 'Doctor';
  const isAvailable = doctor.isAvailableToday !== false;

  return (
    <Card className="overflow-hidden hover:shadow-xl hover:border-upchar-300 hover:-translate-y-0.5 transition-all duration-300">
      {/* Top Section: Image and Quick Info */}
      <div className="flex flex-row items-start gap-4 sm:gap-lg mb-4 sm:mb-lg">
        {/* Doctor Image/Avatar */}
        <div className="flex-shrink-0">
          <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-br from-neutral-100 to-neutral-50 flex items-center justify-center overflow-hidden relative">
            {hasImage ? (
              <img
                src={doctor.image.url}
                alt={doctorName}
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                }}
              >
                <div className="text-center">
                  <div className="text-3xl sm:text-4xl">👨‍⚕️</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Doctor Basic Info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-base sm:text-h3 font-bold text-neutral-900 break-words">
            Dr. {doctorName}
          </h3>
          <p className="mt-0.5 text-caption text-neutral-500">
            {doctor.qualifications?.length ? doctor.qualifications.join(' • ') : 'MD • MBBS'}
          </p>

          {/* Specialization */}
          <p className="mt-1.5 sm:mt-md text-body-sm font-semibold text-upchar-600 break-words">
            {doctor.specialization}
          </p>

          {/* Quick Stats */}
          <div className="mt-1.5 sm:mt-md flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-neutral-600">
            <span>💼 {doctor.experienceYears || 0} yrs</span>
            <span className="text-neutral-400">•</span>
            <span>💰 ₹{doctor.consultationFee}</span>
          </div>

          {/* Availability Badge */}
          <div className="mt-2 sm:mt-md">
            {isAvailable ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success-50 border border-success-200">
                <span className="inline-block w-2 h-2 rounded-full bg-success-600" />
                <span className="text-success-700 font-semibold text-caption">Available today</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-danger-50 border border-danger-200">
                <span className="inline-block w-2 h-2 rounded-full bg-danger-600" />
                <span className="text-danger-700 font-semibold text-caption">Unavailable today</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-neutral-200 my-3 sm:my-lg" />

      {/* Bottom Section: Additional Info and Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-caption text-neutral-600 min-w-0">
          {doctor.hospital && (
            <p className="truncate">
              🏥 {typeof doctor.hospital === 'string' ? doctor.hospital : doctor.hospital.name}
            </p>
          )}
          {doctor.department && (
            <p className="mt-0.5 truncate">
              {typeof doctor.department === 'string' ? doctor.department : doctor.department.name}
            </p>
          )}
        </div>

        <Button
          onClick={() => onBook(doctor)}
          size="md"
          disabled={!isAvailable}
          className="w-full sm:w-auto sm:shrink-0"
        >
          Book Appointment
        </Button>
      </div>
    </Card>
  );
};

export default DoctorCard;
