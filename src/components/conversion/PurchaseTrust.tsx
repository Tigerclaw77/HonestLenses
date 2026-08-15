import Link from "next/link";
import styles from "./conversion.module.css";

export default function PurchaseTrust() {
  return (
    <aside className={styles.trust} aria-label="Purchase reassurance">
      <span>Genuine branded contacts</span>
      <span>Normal prescription verification</span>
      <span>Secure payment at checkout</span>
      <span>Clear fulfillment updates</span>
      <Link href="/contact">Questions? Contact us</Link>
    </aside>
  );
}
