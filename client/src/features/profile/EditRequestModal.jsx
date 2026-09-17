import { useMemo, useState } from 'react';
import { Modal } from '../../components/Modal.jsx';
import { Button } from '../../components/Button.jsx';
import { Input, Select, Textarea } from '../../components/Input.jsx';
import * as editRequestService from '../../services/editRequestService.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { formatDate } from '../../utils/formatters.js';

const FIELD_OPTIONS = [
  { value: 'PHONE', label: 'Phone Number' },
  { value: 'ADDRESS', label: 'Address' },
  { value: 'EMERGENCY_CONTACT', label: 'Emergency Contact' },
  { value: 'DATE_OF_BIRTH', label: 'Date of Birth' },
  { value: 'NAME', label: 'Name' },
  { value: 'OTHER', label: 'Other' },
];

function currentValueFor(field, profile) {
  switch (field) {
    case 'PHONE':
      return profile.phone || 'Not provided';
    case 'ADDRESS':
      return profile.address || 'Not provided';
    case 'EMERGENCY_CONTACT': {
      const c = profile.emergencyContact;
      return c?.name || c?.phone ? `${c.name || '—'} · ${c.phone || '—'} · ${c.relation || '—'}` : 'Not provided';
    }
    case 'DATE_OF_BIRTH':
      return profile.dateOfBirth ? formatDate(profile.dateOfBirth) : 'Not provided';
    case 'NAME':
      return `${profile.firstName} ${profile.lastName}`;
    default:
      return '';
  }
}

export function EditRequestModal({ open, onClose, profile, onSubmitted }) {
  const toast = useToast();
  const [field, setField] = useState('PHONE');
  const [requestedValue, setRequestedValue] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const currentValue = useMemo(() => currentValueFor(field, profile), [field, profile]);

  const handleClose = () => {
    setField('PHONE');
    setRequestedValue('');
    setReason('');
    setError('');
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await editRequestService.createEditRequest({ field, currentValue, requestedValue, reason });
      toast.success('Your request has been submitted to HR.');
      handleClose();
      onSubmitted();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not submit your request.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Raise Edit Request">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">{error}</p>}

        <Select label="Information Type" value={field} onChange={(e) => setField(e.target.value)}>
          {FIELD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>

        <Input label="Current Value" value={currentValue} disabled readOnly className="bg-slate-50 text-slate-500" />

        <Input
          label="Requested Value"
          value={requestedValue}
          onChange={(e) => setRequestedValue(e.target.value)}
          placeholder="Enter the new value"
          required
        />

        <Textarea
          label="Reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why are you requesting this change?"
          required
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Submit Request
          </Button>
        </div>
      </form>
    </Modal>
  );
}
