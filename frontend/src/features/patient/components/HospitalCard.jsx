import { useState } from 'react';
import Card from './ui/PCard';

const HOSPITAL_TYPE_LABELS = {
  government: 'Government',
  private: 'Private',
  clinic: 'Clinic',
};

const TYPE_COLORS = {
  government: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  private: { bg: 'bg-upchar-50', text: 'text-upchar-700', border: 'border-upchar-200' },
  clinic: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
};

/**
 * Premium UpcharGanga Hospital Card
 */
const HospitalCard = ({ hospital, onSelect }) => {
  const [imageError, setImageError] = useState(false);

  const typeConfig = TYPE_COLORS[hospital.type] || TYPE_COLORS.private;
  const hasImage = hospital.image?.url && !imageError;

  return (
    <Card
      as="button"
      onClick={() => onSelect(hospital)}
      className="w-full flex flex-col text-left hover:shadow-xl hover:border-upchar-300 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer overflow-hidden"
    >
      {/* Image/Logo Section */}
      <div className="mb-md sm:mb-lg h-40 sm:h-48 w-full bg-gradient-to-br from-neutral-100 to-neutral-50 rounded-lg flex items-center justify-center overflow-hidden relative">
        {hasImage && (
          <img
            src={hospital.image.url}
            alt={hospital.name}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        )}
        {!hasImage && (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${
                typeConfig.bg === 'bg-blue-50'
                  ? '#3b82f6'
                  : typeConfig.bg === 'bg-upchar-50'
                    ? '#8b5cf6'
                    : '#14b8a6'
              } 0%, ${
                typeConfig.bg === 'bg-blue-50'
                  ? '#1e40af'
                  : typeConfig.bg === 'bg-upchar-50'
                    ? '#6d28d9'
                    : '#0d9488'
              } 100%)`,
            }}
          >
            <div className="text-center">
              <div className="text-5xl sm:text-6xl mb-2">🏥</div>
              <p className="text-white/80 text-xs sm:text-sm font-medium">
                {HOSPITAL_TYPE_LABELS[hospital.type] || hospital.type}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Header: Name and Type Badge */}
      <div className="w-full flex flex-wrap items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg sm:text-h3 font-bold text-neutral-900 line-clamp-2 break-words">
            {hospital.name}
          </h3>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-caption font-semibold border ${typeConfig.bg} ${typeConfig.text} ${typeConfig.border} whitespace-nowrap`}
        >
          {HOSPITAL_TYPE_LABELS[hospital.type] || hospital.type}
        </span>
      </div>

      {/* Address */}
      <p className="w-full text-body-sm text-neutral-600 line-clamp-2 break-words">
        📍 {hospital.address?.line1}
        {hospital.address?.pincode ? `, ${hospital.address.pincode}` : ''}
      </p>

      {/* City */}
      {hospital.city && (
        <p className="mt-1 text-caption text-neutral-500">
          {hospital.city.name || hospital.city}
        </p>
      )}

      {/* Divider */}
      <div className="w-full my-md border-t border-neutral-200" />

      {/* Footer: Phone and Rating */}
      <div className="w-full mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {hospital.contact?.phone && (
          <span className="text-caption font-medium text-neutral-600">
            📞 {hospital.contact.phone}
          </span>
        )}

        {hospital.averageRating && hospital.averageRating > 0 && (
          <span className="text-caption font-medium text-yellow-600">
            ⭐ {hospital.averageRating.toFixed(1)} ({hospital.ratingCount || 0} reviews)
          </span>
        )}

        {hospital.bedsCount && (
          <span className="text-caption font-medium text-neutral-600">
            🛏️ {hospital.bedsCount} beds
          </span>
        )}
      </div>
    </Card>
  );
};

export default HospitalCard;
