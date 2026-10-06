import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Modal } from '../../components/Modal.jsx';
import { Button } from '../../components/Button.jsx';
import { Input, Select, Textarea } from '../../components/Input.jsx';
import * as contentCalendarService from '../../services/contentCalendarService.js';
import * as clientService from '../../services/clientService.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

const EMPTY_FORM = {
  clientId: '',
  client: '',
  date: '', // Assignment Date
  assignedEmployee: '',
  work: '',
  assignmentRemark: '',
  deadline: '',
  outputDate: '', // when the finished work is scheduled to go out to the client
  priority: 'MEDIUM',
  workStatus: 'REMAINING',
  completionRemark: '',
  clientFeedback: '',
};

function toDateInput(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

function getTodayInputString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function ContentCalendarItemModal({ open, onClose, item, employees = [], loadingEmployees = false, clients = [], onSaved, onClientCreated }) {
  const toast = useToast();
  const isEdit = Boolean(item);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isAddingNewClient, setIsAddingNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');

  useEffect(() => {
    if (item) {
      const empId = typeof item.assignedEmployee === 'object' ? item.assignedEmployee?._id : item.assignedEmployee;
      const cId = typeof item.clientId === 'object' ? item.clientId?._id : item.clientId;
      const cName = typeof item.clientId === 'object' ? item.clientId?.name : item.client;

      setForm({
        clientId: cId ? String(cId) : '',
        client: cName || '',
        date: toDateInput(item.date),
        assignedEmployee: empId ? String(empId) : '',
        work: item.work || '',
        assignmentRemark: item.assignmentRemark || '',
        deadline: toDateInput(item.deadline),
        // Legacy items created before this field existed intentionally stay
        // blank here rather than being guessed from another date.
        outputDate: toDateInput(item.outputDate),
        priority: item.priority || 'MEDIUM',
        workStatus: item.workStatus || 'REMAINING',
        completionRemark: item.completionRemark || '',
        clientFeedback: item.clientFeedback || '',
      });
    } else {
      const todayStr = getTodayInputString();
      setForm({
        ...EMPTY_FORM,
        date: todayStr,
        deadline: todayStr,
        // Output Date is a deliberate scheduling decision, never defaulted.
      });
    }
    setError('');
    setIsAddingNewClient(false);
    setNewClientName('');
  }, [item, open]);

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleClientSelectChange = (e) => {
    const val = e.target.value;
    if (val === '__ADD_NEW__') {
      setIsAddingNewClient(true);
      setForm((f) => ({ ...f, clientId: '', client: '' }));
    } else {
      setIsAddingNewClient(false);
      const selectedObj = clients.find((c) => String(c._id) === val);
      setForm((f) => ({
        ...f,
        clientId: val,
        client: selectedObj ? selectedObj.name : '',
      }));
    }
  };

  const handleCreateNewClient = async () => {
    if (!newClientName.trim()) return;
    try {
      const created = await clientService.createClient({ name: newClientName.trim() });
      toast.success(`Client "${created.name}" added to Client Master.`);
      if (onClientCreated) await onClientCreated();
      setForm((f) => ({ ...f, clientId: String(created._id), client: created.name }));
      setIsAddingNewClient(false);
      setNewClientName('');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create client.'));
    }
  };

  // Ensure current assigned employee on edit is included in dropdown list even if inactive
  const currentAssignedEmp = typeof item?.assignedEmployee === 'object' ? item.assignedEmployee : null;
  const currentEmpId = currentAssignedEmp?._id ? String(currentAssignedEmp._id) : (form.assignedEmployee || '');

  const availableEmployees = [...employees];
  if (currentAssignedEmp && currentEmpId && !availableEmployees.some((e) => String(e._id) === currentEmpId)) {
    availableEmployees.unshift(currentAssignedEmp);
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.clientId && !form.client && !isAddingNewClient) {
      setError('Please select a client from Client Master.');
      return;
    }
    if (!form.assignedEmployee) {
      setError('Please select an assigned employee.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      let payload = {
        ...form,
        outputDate: form.outputDate ? form.outputDate : null,
      };
      if (isAddingNewClient && newClientName.trim()) {
        const created = await clientService.createClient({ name: newClientName.trim() });
        payload.clientId = created._id;
        payload.client = created.name;
        if (onClientCreated) await onClientCreated();
      }

      if (isEdit) {
        await contentCalendarService.updateContentCalendarItem(item._id, payload);
        toast.success('Content calendar item updated.');
      } else {
        await contentCalendarService.createContentCalendarItem(payload);
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
          {/* Client Selector (Client Master) */}
          <div>
            {!isAddingNewClient ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-semibold text-slate-700">
                    Client <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsAddingNewClient(true)}
                    className="text-xs font-bold text-brand-700 hover:text-brand-900 flex items-center gap-1"
                  >
                    <Plus size={12} /> New Client
                  </button>
                </div>
                <Select value={form.clientId} onChange={handleClientSelectChange} required>
                  <option value="">Select Client…</option>
                  {clients.map((c) => (
                    <option key={String(c._id)} value={String(c._id)}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__ADD_NEW__">+ Add New Client Master record…</option>
                </Select>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-semibold text-slate-700">
                    New Client Name <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsAddingNewClient(false)}
                    className="text-xs font-bold text-slate-500 hover:text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Enter new client name"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    required
                  />
                  <Button type="button" size="sm" onClick={handleCreateNewClient}>
                    Add
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Employee Selector */}
          <Select label="Assigned Employee" value={form.assignedEmployee} onChange={handleChange('assignedEmployee')} required>
            <option value="">{loadingEmployees ? 'Loading employees…' : 'Select Employee…'}</option>
            {availableEmployees.map((e) => (
              <option key={String(e._id)} value={String(e._id)}>
                {`${e.firstName || ''} ${e.lastName || ''}`.trim()} {e.employeeCode ? `(${e.employeeCode})` : ''}
              </option>
            ))}
          </Select>
        </div>

        <Textarea label="Work Description" rows={2} value={form.work} onChange={handleChange('work')} placeholder="Describe the content work to be done…" required />
        <Textarea label="Assignment Remark" rows={2} value={form.assignmentRemark} onChange={handleChange('assignmentRemark')} placeholder="Initial instructions or remarks…" />

        {/* Three distinct business dates — never merge or auto-copy between them. */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            label="Assignment Date"
            type="date"
            value={form.date}
            onChange={handleChange('date')}
            hint="Date the work is assigned to the employee."
            required
          />
          <Input
            label="Deadline"
            type="date"
            value={form.deadline}
            onChange={handleChange('deadline')}
            hint="Date by which the employee must submit the completed work."
            required
          />
          <Input
            label="Output Date"
            type="date"
            value={form.outputDate}
            onChange={handleChange('outputDate')}
            hint="Date the completed work is scheduled to go out to the client (optional)."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select label="Priority" value={form.priority} onChange={handleChange('priority')}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </Select>
          <Select label="Work Status" value={form.workStatus} onChange={handleChange('workStatus')}>
            <option value="REMAINING">Upcoming</option>
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
