import { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal.jsx';
import { Button } from '../../components/Button.jsx';
import { Input, Select, Textarea } from '../../components/Input.jsx';
import * as onsiteService from '../../services/onsiteWorkService.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { getTodayDateInputValue } from '../../utils/calendarDate.js';
import { ONSITE_REASONS, onsiteDateInputValue, validateOnsiteForm } from './onsiteFormat.js';

const EMPTY_FORM = { date: '', reason: ONSITE_REASONS[0], otherReason: '', workLocation: '', description: '' };
const OTHER = '__other__';

/** New request, or editing a PENDING one (`editing` = the request). */
export function OnsiteRequestModal({ open, editing = null, onClose, onSaved }) {
  const toast = useToast();
  const todayYMD = getTodayDateInputValue();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    if (editing) {
      const preset = ONSITE_REASONS.includes(editing.reason);
      setForm({
        date: onsiteDateInputValue(editing.date),
        reason: preset ? editing.reason : OTHER,
        otherReason: preset ? '' : editing.reason,
        workLocation: editing.workLocation || '',
        description: editing.description || '',
      });
    } else {
      setForm({ ...EMPTY_FORM, date: todayYMD });
    }
  }, [open, editing, todayYMD]);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const reasonValue = form.reason === OTHER ? form.otherReason : form.reason;

  const handleClose = () => {
    if (!submitting) onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { date: form.date, reason: reasonValue.trim(), workLocation: form.workLocation.trim(), description: form.description.trim() };
    const problem = validateOnsiteForm(payload, todayYMD);
    if (problem) return setError(problem);
    setError('');
    setSubmitting(true);
    try {
      if (editing) {
        await onsiteService.updateMyOnsite(editing._id, payload);
        toast.success('Onsite work request updated.');
      } else {
        await onsiteService.createOnsite(payload);
        toast.success('Onsite work request submitted.');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to save the onsite work request.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title={editing ? 'Edit Onsite Work Request' : 'Request Onsite Work'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5" role="alert">
            {error}
          </p>
        )}

        <Input id="onsite-date" type="date" label="Date" min={todayYMD} value={form.date} onChange={update('date')} required />

        <Select id="onsite-reason" label="Reason" value={form.reason} onChange={update('reason')} required>
          {ONSITE_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
          <option value={OTHER}>Other…</option>
        </Select>
        {form.reason === OTHER && (
          <Input id="onsite-other-reason" label="Other reason" maxLength={200} placeholder="e.g. Event coverage" value={form.otherReason} onChange={update('otherReason')} required />
        )}

        <Input
          id="onsite-location"
          label="Work Location"
          maxLength={300}
          placeholder="e.g. Dubai Marina — client office"
          value={form.workLocation}
          onChange={update('workLocation')}
          required
        />

        <Textarea
          id="onsite-notes"
          label="Description / Notes (optional)"
          rows={3}
          maxLength={1000}
          placeholder="Shooting with the videographer from 11 AM."
          value={form.description}
          onChange={update('description')}
        />

        <p className="text-xs text-slate-500">
          After approval you can check in and out from the onsite location on that date. Your GPS location is still recorded. You are marked present only when you
          check in.
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {editing ? 'Save Changes' : 'Submit Request'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
