import { useState } from 'react';
import Card from './ui/PCard';

/**
 * Premium UpcharGanga City Card
 */
const CityCard = ({ city, onSelect }) => {
  const [imageError, setImageError] = useState(false);

  const hasImage = city.image?.url && !imageError;

  return (
    <Card
      as="button"
      onClick={() => onSelect(city)}
      className="w-full flex flex-col text-left hover:shadow-xl hover:border-upchar-300 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer overflow-hidden"
    >
      {/* Image/Avatar Section */}
      <div className="mb-md sm:mb-lg h-36 sm:h-40 w-full bg-gradient-to-br from-neutral-100 to-neutral-50 rounded-lg flex items-center justify-center overflow-hidden">
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
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            }}
          >
            <div className="text-center">
              <div className="text-4xl sm:text-5xl mb-1.5">🏙️</div>
              <p className="text-white/80 text-xs sm:text-sm font-medium">City</p>
            </div>
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="w-full flex-1 flex flex-col">
        <h3 className="text-lg sm:text-h3 font-bold text-neutral-900 line-clamp-2">
          {city.name}
        </h3>
        <p className="mt-1 text-body-sm text-neutral-600">
          {city.state}
          {city.country ? `, ${city.country}` : ''}
        </p>

        {/* Postal Codes */}
        {city.postalCodes && city.postalCodes.length > 0 && (
          <div className="mt-auto pt-md border-t border-neutral-200">
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
