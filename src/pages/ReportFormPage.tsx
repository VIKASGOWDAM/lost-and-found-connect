import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import type { Category, CategoryField, ReportType, MediaVisibility } from '@/lib/types';
import { getCategoryIcon } from '@/lib/categoryIcons';
import { ChevronRight, ChevronLeft, Upload, Eye, Lock, X, Check, AlertCircle, ImageIcon } from 'lucide-react';

interface PhotoItem {
  file: File;
  url: string;
  visibility: MediaVisibility;
}

export function ReportFormPage({ reportType }: { reportType: ReportType }) {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const [step, setStep] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [fields, setFields] = useState<CategoryField[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [locationGeneral, setLocationGeneral] = useState('');
  const [dateOccurred, setDateOccurred] = useState('');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    supabase.from('categories').select('id, name, parent_id').order('name').then(({ data }) => {
      if (data) setCategories(data as Category[]);
    });
  }, [user, navigate]);

  useEffect(() => {
    if (!selectedCategory) {
      setFields([]);
      return;
    }
    supabase
      .from('category_fields')
      .select('*')
      .eq('category_id', selectedCategory)
      .order('is_public_default', { ascending: false })
      .then(({ data }) => {
        if (data) setFields(data as CategoryField[]);
      });
  }, [selectedCategory]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const newPhotos: PhotoItem[] = files.map((file) => ({
      file,
      url: URL.createObjectURL(file),
      visibility: 'public' as MediaVisibility,
    }));
    setPhotos((prev) => [...prev, ...newPhotos]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[idx].url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const togglePhotoVisibility = (idx: number) => {
    setPhotos((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, visibility: p.visibility === 'public' ? 'private' : 'public' } : p))
    );
  };

  const publicFields = fields.filter((f) => f.is_public_default);
  const privateFields = fields.filter((f) => !f.is_public_default);
  const requiredFields = fields.filter((f) => f.is_required);
  const requiredFilled = requiredFields.every((f) => (fieldValues[f.field_key] ?? '').trim() !== '');

  const handleSubmit = async () => {
    if (!user || !selectedCategory) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data: report, error: reportError } = await supabase
        .from('reports')
        .insert({
          type: reportType,
          category_id: selectedCategory,
          location_general: locationGeneral,
          date_occurred: dateOccurred || null,
        })
        .select('id')
        .single();

      if (reportError || !report) throw new Error(reportError?.message ?? 'Failed to create report');

      const reportId = report.id;

      const pubAttrs = publicFields
        .filter((f) => fieldValues[f.field_key])
        .map((f) => ({ report_id: reportId, key: f.field_label, value: fieldValues[f.field_key] }));
      if (pubAttrs.length > 0) {
        const { error: e } = await supabase.from('report_public_attributes').insert(pubAttrs);
        if (e) throw new Error(e.message);
      }

      const privAttrs = privateFields
        .filter((f) => fieldValues[f.field_key])
        .map((f) => ({
          report_id: reportId,
          key: f.field_label,
          value: fieldValues[f.field_key],
          is_verification_challenge: true,
        }));
      if (privAttrs.length > 0) {
        const { error: e } = await supabase.from('report_private_attributes').insert(privAttrs);
        if (e) throw new Error(e.message);
      }

      for (const photo of photos) {
        const ext = photo.file.name.split('.').pop() ?? 'jpg';
        const fileName = `${reportId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('report-media')
          .upload(fileName, photo.file);
        if (uploadError) throw new Error(uploadError.message);

        const { data: urlData } = supabase.storage.from('report-media').getPublicUrl(fileName);
        const { error: mediaError } = await supabase.from('report_media').insert({
          report_id: reportId,
          url: urlData.publicUrl,
          visibility: photo.visibility,
          media_type: photo.file.type,
        });
        if (mediaError) throw new Error(mediaError.message);
      }

      try {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/match-engine`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ report_id: reportId }),
        });
      } catch {
        // Match engine runs in background — don't block navigation on failure
      }

      navigate('/my-reports');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  const steps = ['Category', 'Details', 'Photos', 'Review'];
  const canProceed = step === 0 ? !!selectedCategory : step === 1 ? !!locationGeneral && requiredFilled : true;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50 py-8">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Report {reportType === 'lost' ? 'Lost' : 'Found'} Item
        </h1>
        <p className="text-sm text-gray-600 mb-8">
          {reportType === 'lost'
            ? 'Tell us what you lost so others can help you find it.'
            : 'Report an item you found so its owner can claim it.'}
        </p>

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-8">
          {steps.map((label, i) => (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className={`flex items-center gap-2 ${i <= step ? 'text-sky-700' : 'text-gray-400'}`}>
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                  i < step ? 'bg-sky-600 text-white' : i === step ? 'bg-sky-50 text-sky-700 ring-2 ring-sky-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span className="text-sm font-medium hidden sm:inline">{label}</span>
              </div>
              {i < steps.length - 1 && <div className={`h-px flex-1 mx-2 ${i < step ? 'bg-sky-600' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8">
          {/* Step 0: Category */}
          {step === 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">What kind of item?</h2>
              <p className="text-sm text-gray-500 mb-6">Select the category that best matches your item.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {categories.map((cat) => {
                  const Icon = getCategoryIcon(cat.name);
                  const isSelected = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-all ${
                        isSelected ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-500/20' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className={`h-7 w-7 ${isSelected ? 'text-sky-600' : 'text-gray-500'}`} />
                      <span className={`text-sm font-medium text-center ${isSelected ? 'text-sky-700' : 'text-gray-700'}`}>{cat.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 1: Details */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Item details</h2>
                <p className="text-sm text-gray-500 mb-6">Fill in the fields for this category.</p>
              </div>

              {/* Location & Date */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    General location <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={locationGeneral}
                    onChange={(e) => setLocationGeneral(e.target.value)}
                    placeholder="Terminal 2, JFK Airport"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
                  />
                  <p className="mt-1 text-xs text-gray-400">This will be visible to everyone.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Date {reportType === 'lost' ? 'lost' : 'found'}</label>
                  <input
                    type="date"
                    value={dateOccurred}
                    onChange={(e) => setDateOccurred(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Public fields */}
              {publicFields.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                      <Eye className="h-4 w-4" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">Public attributes</h3>
                    <span className="text-xs text-gray-400">— visible to everyone browsing</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {publicFields.map((field) => (
                      <FieldInput key={field.id} field={field} value={fieldValues[field.field_key] ?? ''} onChange={(v) => setFieldValues((prev) => ({ ...prev, [field.field_key]: v }))} />
                    ))}
                  </div>
                </div>
              )}

              {/* Private fields */}
              {privateFields.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                      <Lock className="h-4 w-4" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">Private / verification fields</h3>
                  </div>
                  <div className="rounded-xl bg-sky-50/50 border border-sky-100 px-4 py-3 mb-4">
                    <p className="text-xs text-sky-800 leading-relaxed">
                      <AlertCircle className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                      These details are never shown publicly. They're used only to verify the
                      rightful owner when someone claims your item.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {privateFields.map((field) => (
                      <FieldInput key={field.id} field={field} value={fieldValues[field.field_key] ?? ''} onChange={(v) => setFieldValues((prev) => ({ ...prev, [field.field_key]: v }))} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Photos */}
          {step === 2 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Upload photos</h2>
              <p className="text-sm text-gray-500 mb-6">Tag each photo as public or private. Private photos are only visible to you.</p>

              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhotoSelect} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-gray-300 hover:border-sky-400 hover:bg-sky-50/50 transition-all p-8 text-center"
              >
                <ImageIcon className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700">Click to select photos</p>
                <p className="text-xs text-gray-400 mt-1">PNG, JPG up to 10MB each</p>
              </button>

              {photos.length > 0 && (
                <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {photos.map((photo, idx) => (
                    <div key={idx} className="relative group rounded-xl overflow-hidden border border-gray-200">
                      <img src={photo.url} alt="" className="h-32 w-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                      <button
                        onClick={() => removePhoto(idx)}
                        className="absolute top-2 right-2 rounded-full bg-black/40 hover:bg-black/60 p-1.5 text-white transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => togglePhotoVisibility(idx)}
                        className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                      >
                        {photo.visibility === 'public' ? (
                          <span className="bg-emerald-500/90 text-white flex items-center gap-1 rounded-full px-2.5 py-1">
                            <Eye className="h-3 w-3" /> Public
                          </span>
                        ) : (
                          <span className="bg-sky-500/90 text-white flex items-center gap-1 rounded-full px-2.5 py-1">
                            <Lock className="h-3 w-3" /> Private
                          </span>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Review your report</h2>
              <p className="text-sm text-gray-500 mb-6">Check everything looks right before submitting.</p>

              <div className="space-y-4">
                <ReviewSection title="Category">
                  {categories.find((c) => c.id === selectedCategory)?.name}
                </ReviewSection>
                <ReviewSection title="Location">{locationGeneral}</ReviewSection>
                {dateOccurred && <ReviewSection title="Date">{dateOccurred}</ReviewSection>}

                {publicFields.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Eye className="h-4 w-4 text-emerald-600" />
                      <h3 className="text-sm font-semibold text-gray-900">Public attributes</h3>
                    </div>
                    <dl className="rounded-lg bg-gray-50 divide-y divide-gray-100">
                      {publicFields.map((f) => (
                        <div key={f.id} className="flex justify-between px-4 py-2.5 text-sm">
                          <dt className="text-gray-500">{f.field_label}</dt>
                          <dd className="font-medium text-gray-900">{fieldValues[f.field_key] || '—'}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                {privateFields.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Lock className="h-4 w-4 text-sky-600" />
                      <h3 className="text-sm font-semibold text-gray-900">Private attributes</h3>
                    </div>
                    <dl className="rounded-lg bg-sky-50/50 divide-y divide-sky-100">
                      {privateFields.map((f) => (
                        <div key={f.id} className="flex justify-between px-4 py-2.5 text-sm">
                          <dt className="text-gray-500">{f.field_label}</dt>
                          <dd className="font-medium text-gray-900">{fieldValues[f.field_key] ? '••••••' : '—'}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                {photos.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Photos ({photos.length})</h3>
                    <div className="flex gap-2 flex-wrap">
                      {photos.map((p, i) => (
                        <img key={i} src={p.url} alt="" className="h-16 w-16 rounded-lg object-cover border border-gray-200" />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-0 transition-all"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            {step < 3 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canProceed}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Submitting…' : 'Submit report'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: CategoryField; value: string; onChange: (v: string) => void }) {
  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all';

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {field.field_label}
        {field.is_required && <span className="text-red-500"> *</span>}
      </label>
      {field.field_type === 'boolean' ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">Select…</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      ) : field.field_type === 'select' ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">Select…</option>
          <option value="Debit">Debit</option>
          <option value="Credit">Credit</option>
          <option value="ATM">ATM</option>
          <option value="Passport">Passport</option>
          <option value="ID Card">ID Card</option>
          <option value="License">License</option>
          <option value="Other">Other</option>
        </select>
      ) : (
        <input
          type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )}
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center rounded-lg bg-gray-50 px-4 py-3">
      <span className="text-sm font-medium text-gray-500">{title}</span>
      <span className="text-sm font-semibold text-gray-900">{children}</span>
    </div>
  );
}
