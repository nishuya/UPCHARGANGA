import React, { useState, useEffect, useRef } from 'react';

/**
 * Reusable Image Component with Fallback Support and Lazy Loading
 * Displays uploaded images with intelligent fallback handling
 * and Intersection Observer-based lazy loading for below-fold images.
 *
 * @param {Object} props
 * @param {String} props.src - Image URL from Cloudinary (or use url prop)
 * @param {String} props.url - Image URL from Cloudinary (alternative to src)
 * @param {String} props.alt - Alt text for accessibility
 * @param {String} props.type - Type of image: 'city', 'hospital', 'doctor'
 * @param {String} props.className - CSS classes for styling
 * @param {String} props.fallbackClassName - CSS classes for fallback display
 * @param {Boolean} props.lazy - Enable lazy loading (default: true)
 * @returns {JSX.Element}
 */
const ImageWithFallback = ({
  src,
  url,
  alt = 'Image',
  type = 'hospital',
  className = 'w-full h-full object-cover',
  fallbackClassName = 'w-full h-full flex items-center justify-center bg-neutral-100',
  lazy = true,
}) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(!lazy);
  const imgRef = useRef(null);

  // Accept either src or url prop
  const imageUrl = src || url;

  // Set up Intersection Observer for lazy loading
  useEffect(() => {
    if (!lazy || shouldLoad || !imgRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '50px' } // Start loading 50px before entering viewport
    );

    observer.observe(imgRef.current);

    return () => observer.disconnect();
  }, [lazy, shouldLoad]);

  // Default fallback icons/initials based on type
  const getFallbackContent = () => {
    switch (type) {
      case 'city':
        return (
          <div className="flex flex-col items-center justify-center">
            <svg className="w-12 h-12 text-neutral-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
            </svg>
            <span className="text-xs text-neutral-500 font-medium">No image</span>
          </div>
        );
      case 'hospital':
        return (
          <div className="flex flex-col items-center justify-center">
            <svg className="w-12 h-12 text-neutral-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
            </svg>
            <span className="text-xs text-neutral-500 font-medium">Hospital</span>
          </div>
        );
      case 'doctor':
        return (
          <div className="flex flex-col items-center justify-center">
            <svg className="w-12 h-12 text-neutral-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-xs text-neutral-500 font-medium">Dr.</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center justify-center">
            <svg className="w-12 h-12 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        );
    }
  };

  // If no image URL or already errored, show fallback
  if (!imageUrl || imageError) {
    return <div className={fallbackClassName}>{getFallbackContent()}</div>;
  }

  return (
    <div ref={imgRef} className={`relative ${!imageLoaded ? 'overflow-hidden' : ''}`}>
      {/* Image element - only renders if shouldLoad is true (lazy) or lazy is disabled */}
      {shouldLoad && (
        <img
          src={imageUrl}
          alt={alt}
          className={`${className} ${!imageLoaded ? 'hidden' : ''}`}
          onLoad={() => setImageLoaded(true)}
          onError={() => {
            console.warn(`Failed to load image: ${imageUrl}`);
            setImageError(true);
          }}
        />
      )}
      {/* Loading placeholder */}
      {!imageLoaded && shouldLoad && (
        <div className={`${fallbackClassName} animate-pulse`} />
      )}
      {/* Placeholder while waiting to lazy load */}
      {!shouldLoad && lazy && (
        <div className={fallbackClassName} />
      )}
    </div>
  );
};

export default React.memo(ImageWithFallback);
