import "../styles/globals.css";
import "../styles/cart.css";

import DeviceModeGate from "@/components/security/DeviceModeGate";
import { HonestPostHogProvider } from "@/lib/posthog/PostHogProvider";

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
        <HonestPostHogProvider>
          <DeviceModeGate />
          {children}
        </HonestPostHogProvider>
      </body>
    </html>
  );
}
