import "../styles/globals.css";
import "../styles/cart.css";

import SmallScreenGuard from "@/components/SmallScreenGuard";
import DeviceModeGate from "@/components/security/DeviceModeGate";

export const metadata = {
  title: "Honest Lenses",
  description: "Order contact lenses online. Prescription required.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <DeviceModeGate />
        <SmallScreenGuard>{children}</SmallScreenGuard>
      </body>
    </html>
  );
}