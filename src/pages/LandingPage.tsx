import { Link } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import { Search, PackagePlus, Package, Shield, Eye, Lock, ArrowRight } from 'lucide-react';

export function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-sky-50 to-white">
        <div className="absolute inset-0 bg-[radial-gradient(40%_60%_at_50%_0%,rgba(56,189,248,0.08),transparent)]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-4 py-1.5 text-sm font-medium text-sky-700 ring-1 ring-inset ring-sky-600/20 mb-6">
              <Shield className="h-4 w-4" />
              Privacy-first lost &amp; found recovery
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900">
              Reconnect people with what they've lost
            </h1>
            <p className="mt-6 text-lg text-gray-600 leading-relaxed">
              Lost &amp; Found Connect helps people report and search for items lost in
              airports, stations, campuses, malls, and public venues — with private
              verification details kept secure until the right match comes along.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/report/lost" className="flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold text-white bg-sky-600 hover:bg-sky-700 shadow-sm transition-all hover:shadow-md">
                <PackagePlus className="h-5 w-5" />
                Report Lost Item
              </Link>
              <Link to="/report/found" className="flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold text-white bg-teal-600 hover:bg-teal-700 shadow-sm transition-all hover:shadow-md">
                <Package className="h-5 w-5" />
                Report Found Item
              </Link>
              <Link to="/browse" className="flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold text-gray-700 bg-white ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-all">
                <Search className="h-5 w-5" />
                Browse Reports
              </Link>
            </div>
            {!user && (
              <p className="mt-4 text-sm text-gray-500">
                New here?{' '}
                <Link to="/signup" className="font-semibold text-sky-600 hover:text-sky-700">
                  Create an account
                </Link>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900">How it works</h2>
          <p className="mt-3 text-center text-gray-600 max-w-2xl mx-auto">
            Three simple steps to report, search, and recover lost belongings.
          </p>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              { icon: PackagePlus, title: 'Report an item', desc: 'Create a lost or found report with category-specific details. Photos and identifying info stay protected.' },
              { icon: Search, title: 'Browse & search', desc: 'Search public reports by category, location, and date. See what was lost or found near you.' },
              { icon: Shield, title: 'Verify & recover', desc: 'Private verification fields confirm the right owner. Sensitive details never appear publicly.' },
            ].map((step, i) => (
              <div key={i} className="relative rounded-2xl border border-gray-100 bg-gray-50/50 p-8 transition-all hover:shadow-md hover:border-sky-200">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-600 text-white mb-5">
                  <step.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy section */}
      <section className="py-20 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">
                Your privacy is built into the platform
              </h2>
              <p className="mt-4 text-gray-600 leading-relaxed">
                Not every detail about a lost item should be public. Lost &amp; Found Connect
                separates public attributes — what helps someone recognize their item — from
                private attributes that only the rightful owner would know.
              </p>
              <div className="mt-8 space-y-5">
                <div className="flex gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <Eye className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Public attributes</h3>
                    <p className="text-sm text-gray-600 mt-1">Brand, color, type, and general location — visible to everyone browsing.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Private verification fields</h3>
                    <p className="text-sm text-gray-600 mt-1">Serial numbers, IMEI, names on documents — never shown publicly, used only to confirm ownership.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                  <span className="text-sm font-medium text-gray-500">Mobile Phone Report</span>
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">PUBLIC</span>
                </div>
                {[
                  ['Brand', 'Apple'],
                  ['Model', 'iPhone 15 Pro'],
                  ['Color', 'Natural Titanium'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span className="text-gray-500">{k}</span>
                    <span className="font-medium text-gray-900">{v}</span>
                  </div>
                ))}
                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">IMEI Number</span>
                    <span className="text-xs font-semibold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full">PRIVATE</span>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-400 font-mono">
                    ••••••••••
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">Ready to get started?</h2>
          <p className="mt-3 text-gray-600">Browse existing reports or create your own in minutes.</p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/browse" className="flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold text-white bg-sky-600 hover:bg-sky-700 shadow-sm transition-all">
              Browse Reports
              <ArrowRight className="h-5 w-5" />
            </Link>
            {!user && (
              <Link to="/signup" className="px-6 py-3 rounded-xl text-base font-semibold text-gray-700 bg-white ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-all">
                Create an account
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
