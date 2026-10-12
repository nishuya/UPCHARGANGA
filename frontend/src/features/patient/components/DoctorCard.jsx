import { useState } from 'react';
import Button from './ui/PButton';
import Card from './ui/PCard';
import Avatar from '../../../components/Avatar';

/**
 * Premium UpcharGanga Doctor Card
 *
 * Beautiful card with doctor image for selection in booking flow.
 * Displays:
 * - Doctor image or avatar
 * - Doctor name and credentials
 * - Specialization
 * - Years of experience
 * - Consultation fee
 * - Availability status
 * - Book appointment button
 */
const DoctorCard = ({ doctor, onBook }) => {
  const [imageError, setImageError] = useState(false);

  const hasImage = doctor.image?.url && !imageError;
  const doctorName = doctor.user?.fullName || 'Doctor';
  const isAvailable = doctor.isAvailableToday !== false;

  return (
    <Card className="overflow-hidden hover:shadow-xl hover:border-upchar-300 hover:scale-105 transition-all duration-300">
      {/* Top Section: Image and Quick Info */}
      <div className="flex flex-col sm:flex-row gap-lg mb-lg">
        {/* Doctor Image/Avatar */}
        <div className="flex-shrink-0">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-br from-neutral-100 to-neutral-50 flex items-center justify-center overflow-hidden relative">
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
                  background: `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,
                }}
              >
                <div className="text-center">
                  <div className="text-4xl mb-1">👨‍⚕️</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Doctor Basic Info */}
        <div className="flex-1 min-w-0">
          {/* Name and Credentials */}
          <div>
            <h3 className="text-h3 font-bold text-neutral-900">
              Dr. {doctorName}
            </h3>
            <p className="mt-xs text-caption text-neutral-500">MD • MBBS</p>
          </div>

          {/* Specialization */}
          <p className="mt-md text-body-sm font-semibold text-upchar-600">
            {doctor.specialization}
          </p>

          {/* Quick Stats */}
          <div className="mt-md flex flex-wrap items-center gap-sm text-caption text-neutral-600">
            <span>💼 {doctor.experienceYears || 0} yrs</span>
            <span className="text-neutral-400">•</span>
            <span>💰 ₹{doctor.consultationFee}</span>
          </div>

          {/* Availability Badge */}
          <div className="mt-md">
            {isAvailable ? (
              <span className="inline-flex items-center gap-xs px-md py-sm rounded-full bg-success-50 border border-success-200">
                <span className="inline-block w-2 h-2 rounded-full bg-success-600"></span>
                <span className="text-success-700 font-semibold text-caption">Available today</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-xs px-md py-sm rounded-full bg-danger-50 border border-danger-200">
                <span className="inline-block w-2 h-2 rounded-full bg-danger-600"></span>
                <span className="text-danger-700 font-semibold text-caption">Unavailable today</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-neutral-200 my-lg" />

      {/* Bottom Section: Additional Info and Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-md">
        {/* Additional Details */}
        <div className="text-caption text-neutral-600">
          {doctor.hospital && (
            <p>
              🏥 {typeof doctor.hospital === 'string' ? doctor.hospital : doctor.hospital.name}
            </p>
          )}
          {doctor.department && (
            <p className="mt-xs">
              {typeof doctor.department === 'string' ? doctor.department : doctor.department.name}
            </p>
          )}
        </div>

        {/* Book Button */}
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


