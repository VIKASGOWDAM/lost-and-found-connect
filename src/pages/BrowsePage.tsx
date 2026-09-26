import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, parseQuery, parsePath, Link } from '@/lib/router';
import type { Category, Report, ReportPublicAttribute, ReportMedia } from '@/lib/types';
import { getCategoryIcon } from '@/lib/categoryIcons';
import { StatusBadge, TypeBadge } from '@/components/Badges';
import { Search, MapPin, Calendar, Filter, X, ChevronLeft, Eye } from 'lucide-react';

export function BrowsePage() {
  const { navigate, path } = useRouter();
  const query = parseQuery(path);
  const [categories, setCategories] = useState<Category[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterType, setFilterType] = useState(query.type ?? '');
  const [filterCategory, setFilterCategory] = useState(query.category ?? '');
  const [filterLocation, setFilterLocation] = useState(query.location ?? '');
  const [filterDateFrom, setFilterDateFrom] = useState(query.dateFrom ?? '');
  const [filterDateTo, setFilterDateTo] = useState(query.dateTo ?? '');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    supabase.from('categories').select('id, name, parent_id').order('name').then(({ data }) => {
      if (data) setCategories(data as Category[]);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    let q = supabase
      .from('reports')
      .select(`
        id, type, reporter_id, category_id, status, location_general, date_occurred, created_at, updated_at,
        category:categories(id, name, parent_id)
      `)
      .neq('status', 'flagged')
      .order('created_at', { ascending: false });

    if (filterType) q = q.eq('type', filterType);
    if (filterCategory) q = q.eq('category_id', filterCategory);
    if (filterLocation) q = q.ilike('location_general', `%${filterLocation}%`);
    if (filterDateFrom) q = q.gte('date_occurred', filterDateFrom);
    if (filterDateTo) q = q.lte('date_occurred', filterDateTo);

    q.then(({ data, error }) => {
      if (!error && data) setReports(data as unknown as Report[]);
      setLoading(false);
    });
  }, [filterType, filterCategory, filterLocation, filterDateFrom, filterDateTo]);

  const hasActiveFilters = useMemo(() =>
    !!(filterType || filterCategory || filterLocation || filterDateFrom || filterDateTo)
  , [filterType, filterCategory, filterLocation, filterDateFrom, filterDateTo]);

  const clearFilters = () => {
    setFilterType(''); setFilterCategory(''); setFilterLocation(''); setFilterDateFrom(''); setFilterDateTo('');
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Browse Reports</h1>
            <p className="text-sm text-gray-600 mt-1">Search lost and found items reported by the community.</p>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 lg:hidden"
          >
            <Filter className="h-4 w-4" /> Filters
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Filters sidebar */}
          <aside className={`${showFilters ? 'block' : 'hidden'} lg:block`}>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sticky top-20">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900">Filters</h2>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="text-xs text-sky-600 hover:text-sky-700 font-medium">Clear all</button>
                )}
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Type</label>
                  <div className="flex gap-2">
                    {['', 'lost', 'found'].map((t) => (
                      <button
                        key={t || 'all'}
                        onClick={() => setFilterType(t)}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                          filterType === t ? 'bg-sky-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {t || 'All'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Category</label>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none"
                  >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Location</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={filterLocation}
                      onChange={(e) => setFilterLocation(e.target.value)}
                      placeholder="Search location…"
                      className="w-full rounded-lg border border-gray-300 pl-10 pr-3 py-2 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Date range</label>
                  <div className="space-y-2">
                    <input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none"
                    />
                    <input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Results */}
          <div>
            {loading ? (
              <div className="text-center py-20 text-gray-400">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-sky-600 mb-3" />
                <p className="text-sm">Loading reports…</p>
              </div>
            ) : reports.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
                <Search className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No reports found</p>
                <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or check back later.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {reports.map((report) => {
                  const Icon = getCategoryIcon(report.category?.name ?? 'Other');
                  return (
                    <button
                      key={report.id}
                      onClick={() => navigate(`/report/${report.id}`)}
                      className="text-left bg-white rounded-2xl border border-gray-200 shadow-sm p-5 hover:shadow-md hover:border-sky-200 transition-all group"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 text-gray-500 group-hover:bg-sky-50 group-hover:text-sky-600 transition-colors">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <span className="text-sm font-semibold text-gray-900">{report.category?.name ?? 'Unknown'}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <TypeBadge type={report.type} />
                            </div>
                          </div>
                        </div>
                        <StatusBadge status={report.status} />
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {report.location_general}
                      </div>
                      {report.date_occurred && (
                        <div className="flex items-center gap-1.5 text-sm text-gray-400">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(report.date_occurred).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReportDetailPage({ reportId }: { reportId: string }) {
  const { navigate } = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [pubAttrs, setPubAttrs] = useState<ReportPublicAttribute[]>([]);
  const [media, setMedia] = useState<ReportMedia[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: r, error: rErr } = await supabase
        .from('reports')
        .select(`
          id, type, reporter_id, category_id, status, location_general, date_occurred, created_at, updated_at,
          category:categories(id, name, parent_id)
        `)
        .eq('id', reportId)
        .neq('status', 'flagged')
        .maybeSingle();

      if (rErr || !r) {
        setLoading(false);
        return;
      }
      setReport(r as unknown as Report);

      const [{ data: attrs }, { data: mediaData }] = await Promise.all([
        supabase.from('report_public_attributes').select('id, report_id, key, value').eq('report_id', reportId),
        supabase.from('report_media').select('id, report_id, url, visibility, media_type').eq('report_id', reportId).eq('visibility', 'public'),
      ]);

      if (attrs) setPubAttrs(attrs as ReportPublicAttribute[]);
      if (mediaData) setMedia(mediaData as ReportMedia[]);
      setLoading(false);
    })();
  }, [reportId]);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-sky-600" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500 font-medium">Report not found or no longer available.</p>
          <button onClick={() => navigate('/browse')} className="mt-4 text-sky-600 hover:text-sky-700 font-medium text-sm">Back to browse</button>
        </div>
      </div>
    );
  }

  const Icon = getCategoryIcon(report.category?.name ?? 'Other');

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
        <button onClick={() => navigate('/browse')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ChevronLeft className="h-4 w-4" /> Back to browse
        </button>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{report.category?.name ?? 'Item'}</h1>
                  <div className="flex items-center gap-2 mt-1">
                    <TypeBadge type={report.type} />
                    <StatusBadge status={report.status} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Media */}
          {media.length > 0 && (
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Photos</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {media.map((m) => (
                  <div key={m.id} className="rounded-xl overflow-hidden border border-gray-200">
                    <img src={m.url} alt="" className="h-40 w-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Location & Date */}
          <div className="p-6 border-b border-gray-100 space-y-3">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</dt>
                <dd className="text-sm text-gray-900 mt-0.5">{report.location_general}</dd>
              </div>
            </div>
            {report.date_occurred && (
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</dt>
                  <dd className="text-sm text-gray-900 mt-0.5">
                    {new Date(report.date_occurred).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </dd>
                </div>
              </div>
            )}
          </div>

          {/* Public attributes */}
          {pubAttrs.length > 0 && (
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <Eye className="h-4 w-4 text-emerald-600" />
                <h2 className="text-sm font-semibold text-gray-900">Public details</h2>
              </div>
              <dl className="grid gap-3 sm:grid-cols-2">
                {pubAttrs.map((attr) => (
                  <div key={attr.id} className="rounded-lg bg-gray-50 px-4 py-3">
                    <dt className="text-xs font-medium text-gray-500">{attr.key}</dt>
                    <dd className="text-sm font-medium text-gray-900 mt-0.5">{attr.value || '—'}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Privacy note */}
          <div className="p-6">
            <div className="rounded-xl bg-sky-50 border border-sky-100 px-4 py-3 flex items-start gap-3">
              <Eye className="h-5 w-5 text-sky-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-sky-900">Private details are hidden</p>
                <p className="text-xs text-sky-700 mt-0.5">
                  This report includes private verification details that are only visible to the
                  report owner. Matching and verification features will be available in a future step.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
