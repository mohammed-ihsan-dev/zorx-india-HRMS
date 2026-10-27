import { useCallback, useEffect, useState } from 'react';
import { PartyPopper, Plus, Trash2 } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { Table } from '../../components/Table.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Input, Select } from '../../components/Input.jsx';
import { Button } from '../../components/Button.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import * as holidayService from '../../services/holidayService.js';
import { formatDate } from '../../utils/formatters.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

const holidayDay = (h) => formatDate(h.date, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
const THIS_YEAR = new Date().getFullYear();
const YEARS = [THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1].map(String);

/** HR/Admin: company holidays. Adding or removing one never changes attendance records. */
export function AdminHolidays() {
  const toast = useToast();
  const [year, setYear] = useState(String(THIS_YEAR));
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ date: '', name: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError('');
    holidayService
      .listHolidays({ from: `${year}-01-01`, to: `${year}-12-31` })
      .then(setHolidays)
      .catch((err) => setLoadError(getErrorMessage(err, 'Unable to load holidays.')))
      .finally(() => setLoading(false));
  }, [year]);

  useEffect(load, [load]);

  const add = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.date) return setFormError('Please choose a date.');
    if (form.name.trim().length < 2) return setFormError('Please enter the holiday name.');
    setSaving(true);
    try {
      await holidayService.createHoliday({ date: form.date, name: form.name.trim() });
      toast.success('Holiday added.');
      setForm({ date: '', name: '' });
      if (form.date.slice(0, 4) !== year) setYear(form.date.slice(0, 4));
      else load();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Unable to add the holiday.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      await holidayService.deleteHoliday(removeTarget._id);
      toast.success('Holiday removed.');
      setRemoveTarget(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Unable to remove the holiday.'));
    } finally {
      setRemoving(false);
    }
  };

  const columns = [
    { key: 'date', header: 'Date', render: (h) => <span className="font-medium text-slate-800">{holidayDay(h)}</span> },
    { key: 'name', header: 'Holiday', render: (h) => h.name },
    {
      key: 'actions',
      header: 'Actions',
      render: (h) => (
        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setRemoveTarget(h)}>
          Remove
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Holidays</h2>
        <p className="text-base text-slate-500 mt-1">Company holidays appear on employees&apos; calendars, and nobody is counted absent on them.</p>
      </div>

      <Card padded={false} className="p-5">
        <h3 className="font-semibold text-slate-900 mb-4">Add Holiday</h3>
        <form onSubmit={add} className="grid grid-cols-1 md:grid-cols-[220px_1fr_auto] gap-4 items-end">
          <Input type="date" label="Date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          <Input label="Holiday Name" placeholder="e.g. Diwali" maxLength={80} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Button type="submit" icon={Plus} loading={saving}>
            Add Holiday
          </Button>
        </form>
        {formError && <p className="mt-3 text-sm font-medium text-red-600" role="alert">{formError}</p>}
      </Card>

      <Card padded={false} className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="font-semibold text-slate-900">Holidays in {year}</h3>
          <Select className="sm:w-32" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
        {loadError ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-red-800">{loadError}</p>
            <Button size="sm" variant="outline" onClick={load}>
              Try again
            </Button>
          </div>
        ) : (
          <Table
            columns={columns}
            data={holidays}
            loading={loading}
            emptyState={<EmptyState icon={PartyPopper} title="No holidays yet" description={`No company holidays have been added for ${year}.`} />}
          />
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={remove}
        loading={removing}
        title="Remove holiday?"
        description={removeTarget ? `${holidayDay(removeTarget)} (${removeTarget.name}) will no longer be a holiday. Attendance records are not changed.` : ''}
        confirmLabel="Remove"
        variant="danger"
      />
    </div>
  );
}
