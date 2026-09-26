import { AuthProvider, useAuth } from '@/lib/auth';
import { RouterProvider, useRouter, parsePath } from '@/lib/router';
import { Navbar } from '@/components/Navbar';
import { LandingPage } from '@/pages/LandingPage';
import { AuthPage } from '@/pages/AuthPage';
import { ReportFormPage } from '@/pages/ReportFormPage';
import { BrowsePage, ReportDetailPage } from '@/pages/BrowsePage';
import { MyReportsPage } from '@/pages/MyReportsPage';
import { VerifyPage } from '@/pages/VerifyPage';
import { MessagesPage } from '@/pages/MessagesPage';
import type { ReportType } from '@/lib/types';

function Routes() {
  const { path } = useRouter();
  const { user, loading } = useAuth();
  const cleanPath = parsePath(path);

  if (loading && user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-sky-600" />
      </div>
    );
  }

  let page;
  switch (cleanPath) {
    case '/':
      page = <LandingPage />;
      break;
    case '/login':
      page = user ? <LandingPage /> : <AuthPage mode="login" />;
      break;
    case '/signup':
      page = user ? <LandingPage /> : <AuthPage mode="signup" />;
      break;
    case '/browse':
      page = <BrowsePage />;
      break;
    case '/my-reports':
      page = user ? <MyReportsPage /> : <AuthPage mode="login" />;
      break;
    case '/messages':
      page = user ? <MessagesPage /> : <AuthPage mode="login" />;
      break;
    case '/report/lost':
      page = user ? <ReportFormPage reportType="lost" /> : <AuthPage mode="login" />;
      break;
    case '/report/found':
      page = user ? <ReportFormPage reportType="found" /> : <AuthPage mode="login" />;
      break;
    default:
      if (cleanPath.startsWith('/report/') && cleanPath !== '/report/lost' && cleanPath !== '/report/found') {
        const id = cleanPath.split('/').pop() ?? '';
        page = <ReportDetailPage reportId={id} />;
      } else if (cleanPath.startsWith('/verify/')) {
        const id = cleanPath.split('/').pop() ?? '';
        page = user ? <VerifyPage sessionId={id} /> : <AuthPage mode="login" />;
      } else if (cleanPath.startsWith('/messages/')) {
        page = user ? <MessagesPage /> : <AuthPage mode="login" />;
      } else {
        page = <LandingPage />;
      }
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      {page}
      <footer className="border-t border-gray-100 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-400">
          Lost &amp; Found Connect — Reconnecting people with what they've lost.
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider>
        <Routes />
      </RouterProvider>
    </AuthProvider>
  );
}
