import "../styles/globals.css";
import "../styles/cart.css";

import { HonestPostHogProvider } from "@/lib/posthog/PostHogProvider";

export const metadata = {
  title: "Honest Lenses",
  description: "Order contact lenses online. Prescription required.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
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
          {children}
        </HonestPostHogProvider>
      </body>
    </html>
  );
}
