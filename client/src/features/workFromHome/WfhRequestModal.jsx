import { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal.jsx';
import { Button } from '../../components/Button.jsx';
import { Input, Textarea } from '../../components/Input.jsx';
import * as wfhService from '../../services/wfhService.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { getTodayDateInputValue } from '../../utils/calendarDate.js';

const EMPTY_FORM = { date: '', reason: '', workPlan: '', remark: '' };

export function WfhRequestModal({ open, onClose, onSubmitted }) {
  const toast = useToast();
  const todayYMD = getTodayDateInputValue();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_FORM, date: todayYMD });
      setError('');
    }
  }, [open, todayYMD]);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.date) return setError('Please select a WFH date.');
    if (form.date < todayYMD) return setError('You cannot request WFH for a past date.');
    if (form.reason.trim().length < 3) return setError('Please provide a reason.');
    if (form.workPlan.trim().length < 3) return setError('Please describe your work plan.');

    setSubmitting(true);
    try {
      await wfhService.createWfh({
        date: form.date,
        reason: form.reason.trim(),
        workPlan: form.workPlan.trim(),
        remark: form.remark.trim(),
      });
      toast.success('WFH request submitted successfully.');
      onSubmitted();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to submit WFH request.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Request Work From Home">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">{error}</p>}

        <Input type="date" label="WFH Date" min={todayYMD} value={form.date} onChange={update('date')} required />

        <Textarea
          label="Reason"
          rows={2}
          maxLength={500}
          placeholder="Personal work at home"
          value={form.reason}
          onChange={update('reason')}
          required
        />

        <Textarea
          label="Work Plan"
          rows={3}
          maxLength={1000}
          placeholder="Complete assigned Content Calendar tasks and client work."
          value={form.workPlan}
          onChange={update('workPlan')}
          required
        />

        <Textarea
          label="Additional Remark (optional)"
          rows={2}
          maxLength={500}
          placeholder="Available during normal office hours."
          value={form.remark}
          onChange={update('remark')}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {submitting ? 'Submitting…' : 'Submit Request'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
