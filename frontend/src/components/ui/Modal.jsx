import { useEffect, createContext, useContext, Children, isValidElement } from 'react';

/**
 * Modal Context to manage onClose across subcomponents
 */
const ModalContext = createContext();

const useModalContext = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('Modal subcomponents must be used within Modal component');
  }
  return context;
};

/**
 * Modal.Header - Header section with title and close button
 */
const ModalHeader = ({ children, title }) => {
  const { onClose } = useModalContext();

  return (
    <div className="flex items-center justify-between border-b border-neutral-200 px-2xl py-lg">
      {children || (
        <>
          <h2 className="text-h3 font-semibold text-neutral-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors duration-fast"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </>
      )}
    </div>
  );
};

/**
 * Modal.Body - Body section with scrollable content
 */
const ModalBody = ({ children }) => {
  return <div className="px-2xl py-lg">{children}</div>;
};

/**
 * Modal.Footer - Footer section for actions
 */
const ModalFooter = ({ children }) => {
  return (
    <div className="border-t border-neutral-200 px-2xl py-lg flex justify-end gap-md">
      {children}
    </div>
  );
};

/**
 * Check if children use compound component pattern (Modal.Header, Modal.Body, Modal.Footer)
 */
const isCompoundComponentPattern = (children) => {
  let hasCompoundComponent = false;
  Children.forEach(children, (child) => {
    if (isValidElement(child)) {
      if (child.type === ModalHeader || child.type === ModalBody || child.type === ModalFooter) {
        hasCompoundComponent = true;
      }
    }
  });
  return hasCompoundComponent;
};

/**
 * Premium UpcharGanga Modal Component
 * Reusable dialog for all admin CRUD operations, details, and confirmations.
 * Features:
 * - Escape key to close
 * - Backdrop click to close
 * - Body scroll lock while open
 * - Multiple size options
 * - Supports both simple and compound component patterns
 *
 * Usage (simple pattern):
 *   <Modal title="Title" isOpen={isOpen} onClose={onClose}>Content</Modal>
 *
 * Usage (compound pattern):
 *   <Modal isOpen={isOpen} onClose={onClose}>
 *     <Modal.Header title="Title" />
 *     <Modal.Body>Content</Modal.Body>
 *     <Modal.Footer>Buttons</Modal.Footer>
 *   </Modal>
 */
const Modal = ({ isOpen, onClose, children, size = 'md', title }) => {
  useEffect(() => {
    // Always set up cleanup for scroll lock, even if not currently open
    // This ensures if component unmounts while open, scroll is restored
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      // Always restore scroll on cleanup, regardless of current isOpen state
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

  // Check if using compound component pattern
  const useCompoundPattern = isCompoundComponentPattern(children);

  // Render based on pattern
  const modalContent = useCompoundPattern ? (
    children
  ) : (
    <>
      {title && <ModalHeader title={title} />}
      <div className="px-2xl py-lg">{children}</div>
    </>
  );

  return (
    <ModalContext.Provider value={{ onClose }}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-lg">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-neutral-900/50"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Modal */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`relative z-10 max-h-[90vh] w-full ${widths[size]} overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-0 shadow-xl transition-all duration-fast`}
        >
          {modalContent}
        </div>
      </div>
    </ModalContext.Provider>
  );
};

// Attach subcomponents to Modal
Modal.Header = ModalHeader;
Modal.Body = ModalBody;
Modal.Footer = ModalFooter;

export default Modal;
