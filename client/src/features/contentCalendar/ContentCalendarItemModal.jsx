import { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal.jsx';
import { Button } from '../../components/Button.jsx';
import { Input, Select, Textarea } from '../../components/Input.jsx';
import * as contentCalendarService from '../../services/contentCalendarService.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

const EMPTY_FORM = {
  client: '',
  date: '',
  assignedEmployee: '',
  work: '',
  assignmentRemark: '',
  deadline: '',
  priority: 'MEDIUM',
  workStatus: 'REMAINING',
  completionRemark: '',
  clientFeedback: '',
};

function toDateInput(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

export function ContentCalendarItemModal({ open, onClose, item, employees = [], loadingEmployees = false, onSaved }) {
  const toast = useToast();
  const isEdit = Boolean(item);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (item) {
      const empId = typeof item.assignedEmployee === 'object' ? item.assignedEmployee?._id : item.assignedEmployee;
      setForm({
        client: item.client || '',
        date: toDateInput(item.date),
        assignedEmployee: empId ? String(empId) : '',
        work: item.work || '',
        assignmentRemark: item.assignmentRemark || '',
        deadline: toDateInput(item.deadline),
        priority: item.priority || 'MEDIUM',
        workStatus: item.workStatus || 'REMAINING',
        completionRemark: item.completionRemark || '',
        clientFeedback: item.clientFeedback || '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError('');
  }, [item, open]);

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  // Ensure current assigned employee on edit is included in dropdown list even if not in active array
  const currentAssignedEmp = typeof item?.assignedEmployee === 'object' ? item.assignedEmployee : null;
  const currentEmpId = currentAssignedEmp?._id ? String(currentAssignedEmp._id) : (form.assignedEmployee || '');

  const availableEmployees = [...employees];
  if (currentAssignedEmp && currentEmpId && !availableEmployees.some((e) => String(e._id) === currentEmpId)) {
    availableEmployees.unshift(currentAssignedEmp);
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.assignedEmployee) {
      setError('Please select an assigned employee.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      if (isEdit) {
        await contentCalendarService.updateContentCalendarItem(item._id, form);
        toast.success('Content calendar item updated.');
      } else {
        await contentCalendarService.createContentCalendarItem(form);
        toast.success('Content calendar item created.');
      }
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save this content calendar item.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Content Work' : 'Add Content Work'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">{error}</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Client" value={form.client} onChange={handleChange('client')} placeholder="e.g. Acme Corp" required />
          <Select label="Assigned Employee" value={form.assignedEmployee} onChange={handleChange('assignedEmployee')} required>
            <option value="">{loadingEmployees ? 'Loading employees…' : 'Select an employee…'}</option>
            {availableEmployees.map((e) => (
              <option key={String(e._id)} value={String(e._id)}>
                {e.firstName} {e.lastName} {e.employeeCode ? `(${e.employeeCode})` : ''}
              </option>
            ))}
          </Select>
        </div>

        <Textarea label="Work Description" rows={2} value={form.work} onChange={handleChange('work')} placeholder="Describe the content work to be done…" required />
        <Textarea label="Assignment Remark" rows={2} value={form.assignmentRemark} onChange={handleChange('assignmentRemark')} placeholder="Initial instructions or remarks…" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Date" type="date" value={form.date} onChange={handleChange('date')} required />
          <Input label="Deadline" type="date" value={form.deadline} onChange={handleChange('deadline')} required />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select label="Priority" value={form.priority} onChange={handleChange('priority')}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </Select>
          <Select label="Work Status" value={form.workStatus} onChange={handleChange('workStatus')}>
            <option value="REMAINING">Remaining</option>
            <option value="ONGOING">Ongoing</option>
            <option value="COMPLETED">Completed</option>
          </Select>
        </div>

        <Textarea label="Completion Remark" rows={2} value={form.completionRemark} onChange={handleChange('completionRemark')} placeholder="Notes when work is completed…" />
        <Textarea label="Client Feedback" rows={2} value={form.clientFeedback} onChange={handleChange('clientFeedback')} placeholder="Feedback from client…" />

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {isEdit ? 'Save Changes' : 'Add Work'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
