import { useState } from 'react';
import Card from './ui/PCard';

/**
 * Premium UpcharGanga City Card
 *
 * Beautiful card with city image/avatar for selection in booking flow.
 * Displays:
 * - City image or avatar
 * - City name
 * - Location (state, country)
 * - Postal codes count
 */
const CityCard = ({ city, onSelect }) => {
  const [imageError, setImageError] = useState(false);

  const hasImage = city.image?.url && !imageError;

  return (
    <Card
      as="button"
      onClick={() => onSelect(city)}
      className="text-left hover:shadow-xl hover:border-upchar-300 hover:scale-105 transition-all duration-300 cursor-pointer overflow-hidden"
    >
      {/* Image/Avatar Section */}
      <div className="mb-lg h-40 bg-gradient-to-br from-neutral-100 to-neutral-50 rounded-lg flex items-center justify-center overflow-hidden">
        {hasImage && (
          <img
            src={city.image.url}
            alt={city.name}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        )}
        {!hasImage && (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,
            }}
          >
            <div className="text-center">
              <div className="text-5xl mb-2">🏙️</div>
              <p className="text-white/80 text-sm font-medium">City</p>
            </div>
          </div>
        )}
      </div>

      {/* Content Section */}
      <div>
        <h3 className="text-h3 font-bold text-neutral-900 line-clamp-2">
          {city.name}
        </h3>
        <p className="mt-sm text-body-sm text-neutral-600">
          {city.state}{city.country ? `, ${city.country}` : ''}
        </p>

        {/* Postal Codes */}
        {city.postalCodes && city.postalCodes.length > 0 && (
          <div className="mt-md pt-md border-t border-neutral-200">
            <p className="text-caption text-neutral-500 font-medium">
              📍 {city.postalCodes.length} postal code{city.postalCodes.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
};

export default CityCard;
