"use client";

import ModalShell from "./ModalShell";

type FindDoctorModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function FindDoctorModal({
  isOpen,
  onClose,
}: FindDoctorModalProps) {
  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="find-doctor-title"
    >
      <div className="modal-body">
        <h2 id="find-doctor-title">
          Find a licensed optometrist near you
        </h2>

        <p>
          We’ll take you to the American Optometric Association’s official{" "}
          <strong>Find a Doctor</strong> directory to locate a licensed
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
          <button
            type="button"
            className="modal-link"
            onClick={onClose}
          >
            close this
          </button>{" "}
          and continue shopping.
        </p>

        <div className="modal-divider" />

        <p className="modal-disclaimer">
          Honest Lenses is not affiliated with the American Optometric
          Association.
        </p>
      </div>
    </ModalShell>
  );
}
