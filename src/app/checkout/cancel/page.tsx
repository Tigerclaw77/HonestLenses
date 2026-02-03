import Link from "next/link";

export default function CheckoutCancelPage() {
  return (
    <main style={{ padding: "2rem", maxWidth: 720 }}>
      <h1>Checkout canceled</h1>

      <p>Your order was not completed. Your cart is still saved.</p>

      <p style={{ marginTop: "1.25rem" }}>
        <strong>Need to add more lenses?</strong>
        <br />
        <Link href="/shop">Continue shopping</Link>
      </p>
    </main>
  );
}
