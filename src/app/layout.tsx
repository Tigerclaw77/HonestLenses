import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
