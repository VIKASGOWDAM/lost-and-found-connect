import { Link, useRouter } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { LogOut, Plus, LayoutGrid, Home, Menu, X, Bell, type LucideProps } from 'lucide-react';
import { useState, useEffect, type ReactNode, type ComponentType } from 'react';
import type { Notification } from '@/lib/types';

function NotificationBell() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .is('read_at', null)
        .order('created_at', { ascending: false });
      if (data) setNotifications(data as Notification[]);
    })();

    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
        setNotifications((prev) => [payload.new as Notification, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  if (!user) return null;

  const unreadCount = notifications.length;

  const markAllRead = async () => {
    if (unreadCount === 0) return;
    const ids = notifications.map((n) => n.id);
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
    setNotifications([]);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-900">Notifications</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-sky-600 hover:text-sky-700 font-medium">Mark all read</button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">No new notifications</p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => { setOpen(false); navigate('/my-reports'); }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 mt-0.5">
                        <Bell className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">A possible match was found</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function Navbar() {
  const { user, profile, signOut } = useAuth();
  const { navigate, path } = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (p: string) => path === p || (p !== '/' && path.startsWith(p));

  const navLink = (to: string, label: string, icon: ReactNode) => (
    <button
      onClick={() => { navigate(to); setMobileOpen(false); }}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        isActive(to) ? 'bg-sky-50 text-sky-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white">
                <Home className="h-5 w-5" />
              </div>
              <span className="text-lg font-bold text-gray-900 tracking-tight">Lost &amp; Found Connect</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {navLink('/browse', 'Browse', <LayoutGrid className="h-4 w-4" />)}
              {user && navLink('/my-reports', 'My Reports', <LayoutGrid className="h-4 w-4" />)}
              {user && navLink('/report/lost', 'Report Lost', <Plus className="h-4 w-4" />)}
              {user && navLink('/report/found', 'Report Found', <Plus className="h-4 w-4" />)}
            </nav>
          </div>

          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <NotificationBell />
                <span className="text-sm text-gray-500">{profile?.full_name ?? user.email}</span>
                <button
                  onClick={() => signOut()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </>
            ) : (
              <>
                <button onClick={() => navigate('/login')} className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors">
                  Log in
                </button>
                <button onClick={() => navigate('/signup')} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 transition-colors shadow-sm">
                  Sign up
                </button>
              </>
            )}
          </div>

          <div className="md:hidden flex items-center gap-2">
            <NotificationBell />
            <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 rounded-lg hover:bg-gray-50">
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden border-t border-gray-100 py-3 space-y-1">
            {navLink('/browse', 'Browse', <LayoutGrid className="h-4 w-4" />)}
            {user && navLink('/my-reports', 'My Reports', <LayoutGrid className="h-4 w-4" />)}
            {user && navLink('/report/lost', 'Report Lost', <Plus className="h-4 w-4" />)}
            {user && navLink('/report/found', 'Report Found', <Plus className="h-4 w-4" />)}
            <div className="pt-2 border-t border-gray-100">
              {user ? (
                <button onClick={() => signOut()} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 w-full">
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              ) : (
                <div className="flex gap-2 px-3">
                  <button onClick={() => navigate('/login')} className="flex-1 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">Log in</button>
                  <button onClick={() => navigate('/signup')} className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700">Sign up</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
