import Link from "next/link";
import styles from "./conversion.module.css";

export default function PurchaseTrust() {
  return (
    <aside className={styles.trust} aria-label="Purchase reassurance">
      <span>Genuine branded contacts</span>
      <span>Clear pricing before checkout</span>
      <span>Secure payment at checkout</span>
      <Link href="/contact">Questions? Contact us</Link>
    </aside>
  );
}
