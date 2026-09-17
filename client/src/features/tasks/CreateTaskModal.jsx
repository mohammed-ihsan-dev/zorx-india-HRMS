import { useState } from 'react';
import { Modal } from '../../components/Modal.jsx';
import { Button } from '../../components/Button.jsx';
import { Input, Select, Textarea } from '../../components/Input.jsx';
import * as taskService from '../../services/taskService.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

const EMPTY_FORM = { title: '', description: '', assignedTo: '', priority: 'MEDIUM', startDate: '', dueDate: '' };

export function CreateTaskModal({ open, onClose, employees, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setError('');
    onClose();
  };

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await taskService.createTask(form);
      toast.success('Task assigned successfully.');
      handleClose();
      onCreated();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not create task.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Assign Task">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">{error}</p>}
        <Input label="Title" value={form.title} onChange={handleChange('title')} required />
        <Textarea label="Description" rows={3} value={form.description} onChange={handleChange('description')} />
        <Select label="Assign To" value={form.assignedTo} onChange={handleChange('assignedTo')} required>
          <option value="">Select an employee…</option>
          {employees.map((e) => (
            <option key={e._id} value={e._id}>
              {e.firstName} {e.lastName}
            </option>
          ))}
        </Select>
        <Select label="Priority" value={form.priority} onChange={handleChange('priority')}>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="URGENT">Urgent</option>
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Start Date" type="date" value={form.startDate} onChange={handleChange('startDate')} />
          <Input label="Due Date" type="date" value={form.dueDate} onChange={handleChange('dueDate')} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Assign Task
          </Button>
        </div>
      </form>
    </Modal>
  );
}
