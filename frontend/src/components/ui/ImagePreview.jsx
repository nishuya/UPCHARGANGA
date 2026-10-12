import { useState } from 'react';

/**
 * Image upload and preview component for forms
 * Displays preview of selected image before upload
 */
const ImagePreview = ({ label = 'Image', onFileSelect, preview = null, isEditing = false }) => {
  const [localPreview, setLocalPreview] = useState(preview || null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        alert('Only JPEG, PNG, and WebP images are allowed');
        e.target.value = '';
        return;
      }

      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        e.target.value = '';
        return;
      }

      // Create preview
      const reader = new FileReader();
      reader.onload = (event) => {
        setLocalPreview(event.target.result);
      };
      reader.readAsDataURL(file);

      // Notify parent
      if (onFileSelect) {
        onFileSelect(file);
      }
    }
  };

  const handleRemove = () => {
    setLocalPreview(null);
    if (onFileSelect) {
      onFileSelect(null);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-ink">{label}</label>

      {/* Preview */}
      {localPreview ? (
        <div className="relative inline-block">
          <img
            src={localPreview}
            alt="Preview"
            className="h-32 w-32 rounded border border-surface-border object-cover"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white hover:bg-danger-dark"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center rounded border-2 border-dashed border-surface-border bg-surface-muted px-6 py-8">
          <div className="text-center">
            <p className="text-sm text-ink-muted">📷 No image selected</p>
            <p className="text-xs text-ink-subtle">JPEG, PNG, or WebP up to 5MB</p>
          </div>
        </div>
      )}

      {/* File input */}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="text-sm text-ink-subtle file:mr-3 file:rounded file:border file:border-surface-border file:bg-surface file:px-3 file:py-1 file:text-sm file:text-ink hover:file:bg-surface-hover"
      />
    </div>
  );
};

export default ImagePreview;
