"use client";

type FindDoctorModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function FindDoctorModal({
  isOpen,
  onClose,
}: FindDoctorModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>

        <div className="modal-body">
          <h2>Find a licensed optometrist near you</h2>

          <p>
            We’ll take you to the American Optometric Association’s official
            <strong> Find a Doctor</strong> directory to locate a licensed
            optometrist in your area.
          </p>

          <a
            href="https://www.aoa.org/healthy-eyes/find-a-doctor"
            target="_blank"
            rel="noopener noreferrer"
            className="modal-primary"
          >
            Find a Doctor on the AOA Website
          </a>

          <p className="modal-secondary">
            You can also{" "}
            <button type="button" className="modal-link" onClick={onClose}>
              close this
            </button>{" "}
            and continue shopping.
          </p>

          <div className="modal-divider" />

          <p className="modal-disclaimer">
            HonestLenses is not affiliated with the American Optometric
            Association.
          </p>
        </div>
      </div>
    </div>
  );
}
