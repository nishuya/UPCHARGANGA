import ImageWithFallback from '../../../components/ImageWithFallback';
import Avatar from '../../../components/Avatar';
import Button from '../../../components/ui/Button';

/**
 * Reusable Admin Card Component for displaying cities, hospitals, and doctors
 */
const AdminCard = ({ item, type, onEdit, onDeactivate, onManageUnavailability, isActive }) => {
  const isCity = type === 'city';
  const isHospital = type === 'hospital';
  const isDoctor = type === 'doctor';

  return (
    <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden hover:shadow-lg hover:border-upchar-300 transition-all duration-300 flex flex-col h-full">
      {/* Image Section */}
      <div className="relative h-40 bg-gradient-to-br from-neutral-100 to-neutral-50 flex items-center justify-center overflow-hidden group">
        {isCity && (
          <>
            <ImageWithFallback
              url={item.image?.url}
              alt={item.name}
              type="city"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-all opacity-0 group-hover:opacity-100" />
          </>
        )}
        {isHospital && (
          <>
            <ImageWithFallback
              url={item.image?.url}
              alt={item.name}
              type="hospital"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-all opacity-0 group-hover:opacity-100" />
          </>
        )}
        {isDoctor && (
          <>
            <ImageWithFallback
              url={item.image?.url}
              alt={item.user?.fullName}
              type="doctor"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-all opacity-0 group-hover:opacity-100" />
          </>
        )}

        {/* Status Badge */}
        <div className="absolute top-2 right-2 z-10">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
              item.isActive ? 'bg-success/90 text-white' : 'bg-neutral-600/90 text-white'
            }`}
          >
            {item.isActive ? '✓ Active' : '✕ Inactive'}
          </span>
        </div>
      </div>

      {/* Content Section */}
      <div className="flex-1 p-4 flex flex-col">
        {/* Name and Type */}
        <div className="mb-2">
          {isCity && (
            <>
              <h3 className="text-lg font-bold text-neutral-900 line-clamp-2">{item.name}</h3>
              <p className="text-sm text-neutral-600 mt-1">
                {item.state}{item.country ? `, ${item.country}` : ''}
              </p>
            </>
          )}

          {isHospital && (
            <>
              <h3 className="text-lg font-bold text-neutral-900 line-clamp-2">{item.name}</h3>
              <div className="mt-2 inline-flex">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  item.type === 'government' ? 'bg-blue-50 text-blue-700' :
                  item.type === 'private' ? 'bg-upchar-50 text-upchar-700' :
                  'bg-teal-50 text-teal-700'
                }`}>
                  {item.type?.charAt(0).toUpperCase() + item.type?.slice(1) || 'Hospital'}
                </span>
              </div>
              <p className="text-sm text-neutral-600 mt-2">
                {item.city?.name && `📍 ${item.city.name}`}
              </p>
            </>
          )}

          {isDoctor && (
            <>
              <h3 className="text-lg font-bold text-neutral-900">Dr. {item.user?.fullName}</h3>
              <p className="text-sm text-upchar-600 font-semibold mt-1">{item.specialization}</p>
              <div className="mt-2 flex items-center gap-2 text-xs text-neutral-600">
                <span>💼 {item.experienceYears || 0} yrs</span>
                <span>•</span>
                <span>💰 ₹{item.consultationFee}</span>
              </div>
            </>
          )}
        </div>

        {/* Additional Info */}
        <div className="mb-4 text-xs text-neutral-500 space-y-1">
          {isCity && item.postalCodes?.length > 0 && (
            <p>📧 {item.postalCodes.length} postal codes</p>
          )}
          {isHospital && item.contact?.phone && (
            <p>📞 {item.contact.phone}</p>
          )}
          {isDoctor && item.hospital && (
            <p>🏥 {typeof item.hospital === 'string' ? item.hospital : item.hospital.name}</p>
          )}
        </div>

        {/* Rating */}
        {(isHospital || isCity) && item.averageRating && item.averageRating > 0 && (
          <div className="mb-4 text-xs font-semibold text-yellow-600">
            ⭐ {item.averageRating.toFixed(1)} ({item.ratingCount || 0})
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-auto pt-3 border-t border-neutral-100 flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onEdit(item)}
            className="flex-1 min-w-fit"
          >
            Edit
          </Button>
          {isDoctor && onManageUnavailability && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onManageUnavailability(item)}
              className="flex-1 min-w-fit"
              title="Mark doctor unavailable for specific dates"
            >
              Unavailable
            </Button>
          )}
          {item.isActive && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDeactivate(item)}
              className="flex-1 min-w-fit"
            >
              Deactivate
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminCard;
