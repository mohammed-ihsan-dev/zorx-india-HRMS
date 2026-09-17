import { useState } from 'react';
import { Modal } from '../../components/Modal.jsx';
import { Button } from '../../components/Button.jsx';
import { Input, Select } from '../../components/Input.jsx';
import * as employeeService from '../../services/employeeService.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { ROLE_LABELS } from '../../utils/constants.js';

const EMPTY_FORM = {
  email: '',
  password: '',
  role: 'EMPLOYEE',
  firstName: '',
  lastName: '',
  phone: '',
  designation: '',
  departmentId: '',
  joiningDate: '',
  employmentType: 'FULL_TIME',
};

export function CreateEmployeeModal({ open, onClose, departments, onCreated }) {
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
      await employeeService.createEmployee({ ...form, departmentId: form.departmentId || null });
      toast.success('Employee created successfully.');
      handleClose();
      onCreated();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not create employee.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Add Employee" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <Input label="First Name" value={form.firstName} onChange={handleChange('firstName')} required />
          <Input label="Last Name" value={form.lastName} onChange={handleChange('lastName')} required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Email" type="email" value={form.email} onChange={handleChange('email')} required />
          <Input
            label="Temporary Password"
            type="text"
            value={form.password}
            onChange={handleChange('password')}
            hint="At least 8 characters. Share securely with the employee."
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select label="Role" value={form.role} onChange={handleChange('role')}>
            {Object.keys(ROLE_LABELS).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
          <Select label="Department" value={form.departmentId} onChange={handleChange('departmentId')}>
            <option value="">Unassigned</option>
            {departments.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Designation" value={form.designation} onChange={handleChange('designation')} />
          <Input label="Phone" value={form.phone} onChange={handleChange('phone')} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Joining Date" type="date" value={form.joiningDate} onChange={handleChange('joiningDate')} required />
          <Select label="Employment Type" value={form.employmentType} onChange={handleChange('employmentType')}>
            <option value="FULL_TIME">Full Time</option>
            <option value="PART_TIME">Part Time</option>
            <option value="CONTRACT">Contract</option>
            <option value="INTERN">Intern</option>
          </Select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create Employee
          </Button>
        </div>
      </form>
    </Modal>
  );
}
