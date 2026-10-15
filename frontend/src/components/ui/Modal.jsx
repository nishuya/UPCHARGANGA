import { useEffect, createContext, useContext, Children, isValidElement } from 'react';

const ModalContext = createContext();

const useModalContext = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('Modal subcomponents must be used within Modal component');
  }
  return context;
};

const ModalHeader = ({ children, title }) => {
  const { onClose } = useModalContext();

  return (
    <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3.5 sm:px-6 sm:py-4">
      {children ? (
        <div className="flex-1 min-w-0">{children}</div>
      ) : (
        <h2 className="text-lg sm:text-h3 font-semibold text-neutral-900 break-words">{title}</h2>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close modal"
        className="shrink-0 rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors duration-fast"
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
    </div>
  );
};

const ModalBody = ({ children }) => {
  return <div className="px-4 py-4 sm:px-6 sm:py-5">{children}</div>;
};

const ModalFooter = ({ children }) => {
  return (
    <div className="border-t border-neutral-200 px-4 py-3.5 sm:px-6 sm:py-4 flex flex-col-reverse xs:flex-row justify-end gap-2.5">
      {children}
    </div>
  );
};

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

const Modal = ({ isOpen, onClose, children, size = 'md', title }) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };
  const useCompoundPattern = isCompoundComponentPattern(children);

  const modalContent = useCompoundPattern ? (
    children
  ) : (
    <>
      {title && <ModalHeader title={title} />}
      <div className="px-4 py-4 sm:px-6 sm:py-5">{children}</div>
    </>
  );

  return (
    <ModalContext.Provider value={{ onClose }}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
        <div
          className="absolute inset-0 bg-neutral-900/50"
          onClick={onClose}
          aria-hidden="true"
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`relative z-10 max-h-[92vh] w-full ${
            widths[size] || widths.md
          } overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-0 shadow-xl transition-all duration-fast`}
        >
          {modalContent}
        </div>
      </div>
    </ModalContext.Provider>
  );
};

Modal.Header = ModalHeader;
Modal.Body = ModalBody;
Modal.Footer = ModalFooter;

export default Modal;
