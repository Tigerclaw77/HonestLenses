import "../styles/globals.css";
import "../styles/cart.css";

import type { Metadata } from "next";
import Script from "next/script";

import { HonestPostHogProvider } from "@/lib/posthog/PostHogProvider";

const siteUrl = "https://honestlenses.com";
const siteTitle = "Honest Lenses | Contact Lenses Online";
const siteDescription =
  "Order authentic contact lenses online with prescription verification and manufacturer-direct fulfillment.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: "%s | Honest Lenses",
  },
  description: siteDescription,
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Honest Lenses",
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: "/cl.png",
        width: 1200,
        height: 800,
        alt: "Life with clear vision",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/cl.png"],
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Honest Lenses",
  url: siteUrl,
  logo: `${siteUrl}/icon.svg`,
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Honest Lenses",
  url: siteUrl,
  description: siteDescription,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const clarityProjectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([organizationSchema, websiteSchema]),
          }}
        />
        {gaMeasurementId ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
              strategy="afterInteractive"
            />
            <Script id="ga4" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', ${JSON.stringify(gaMeasurementId)});
              `}
            </Script>
          </>
        ) : null}
        {clarityProjectId ? (
          <Script id="microsoft-clarity" strategy="afterInteractive">
            {`
              (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
              })(window, document, "clarity", "script", ${JSON.stringify(clarityProjectId)});
            `}
          </Script>
        ) : null}
        <HonestPostHogProvider>
          {children}
        </HonestPostHogProvider>
      </body>
    </html>
  );
}
