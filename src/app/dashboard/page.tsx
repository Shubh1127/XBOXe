import type { Metadata } from 'next';
import Dashboard from '@/components/Dashboard';

export const metadata: Metadata = {
  title: 'Xbox Game Pass Monitor',
  description: 'Real-time Reddit monitoring dashboard for Xbox Game Pass codes',
};

export default function DashboardPage() {
  return <Dashboard />;
}
