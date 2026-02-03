import ModalShell from "./ModalShell";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onJustLooking: () => void;
  onHasPrescription: () => void;
};

export default function ShopIntentModal({
  isOpen,
  onClose,
  onJustLooking,
  onHasPrescription,
}: Props) {
  return (
    <ModalShell isOpen={isOpen} onClose={onClose} labelledBy="shop-intent-title">
      <div className="modal-body">
        <h2 className="shop-intent-title">How would you like to browse?</h2>

        <p className="shop-intent-sub">
          We can show you prices and options, or help you place an order using
          your prescription.
        </p>

        <div className="modal-divider" />

        <button className="modal-primary shop-intent-primary" onClick={onJustLooking}>
          Browse lenses & prices
        </button>

        <div className="modal-divider" />

        <button className="modal-link shop-intent-secondary" onClick={onHasPrescription}>
          I have a prescription
        </button>

        <p className="modal-disclaimer">
          A valid prescription is required before lenses can ship.
        </p>
      </div>
    </ModalShell>
  );
}
