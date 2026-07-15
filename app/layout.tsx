import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'MEPL Stock Monitoring',
  description: 'Location-wise inventory for MEPL',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased text-slate-900 bg-slate-50">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
