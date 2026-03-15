import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Xbox Game Pass Monitor',
  description: 'Real-time Reddit monitoring dashboard for Xbox Game Pass codes',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 antialiased">
        {children}
      </body>
    </html>
  );
}
