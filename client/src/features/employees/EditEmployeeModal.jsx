import { useState, useEffect } from 'react';
import { Modal } from '../../components/Modal.jsx';
import { Button } from '../../components/Button.jsx';
import { Input, Select, Textarea } from '../../components/Input.jsx';
import * as employeeService from '../../services/employeeService.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

export function EditEmployeeModal({ open, onClose, employee, departments, onUpdated }) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    designation: '',
    departmentId: '',
    employmentType: 'FULL_TIME',
    joiningDate: '',
    dateOfBirth: '',
    phone: '',
    address: '',
    emergencyName: '',
    emergencyPhone: '',
    emergencyRelation: '',
  });

  useEffect(() => {
    if (employee) {
      setForm({
        firstName: employee.firstName || '',
        lastName: employee.lastName || '',
        designation: employee.designation || '',
        departmentId: employee.departmentId?._id || employee.departmentId || '',
        employmentType: employee.employmentType || 'FULL_TIME',
        joiningDate: employee.joiningDate ? new Date(employee.joiningDate).toISOString().split('T')[0] : '',
        dateOfBirth: employee.dateOfBirth ? new Date(employee.dateOfBirth).toISOString().split('T')[0] : '',
        phone: employee.phone || '',
        address: employee.address || '',
        emergencyName: employee.emergencyContact?.name || '',
        emergencyPhone: employee.emergencyContact?.phone || '',
        emergencyRelation: employee.emergencyContact?.relation || '',
      });
    }
  }, [employee]);

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        designation: form.designation,
        departmentId: form.departmentId || null,
        employmentType: form.employmentType,
        joiningDate: form.joiningDate ? new Date(form.joiningDate) : undefined,
        dateOfBirth: form.dateOfBirth ? new Date(form.dateOfBirth) : null,
        phone: form.phone,
        address: form.address,
        emergencyContact: {
          name: form.emergencyName,
          phone: form.emergencyPhone,
          relation: form.emergencyRelation,
        },
      };

      const updated = await employeeService.updateEmployee(employee._id, payload);
      toast.success('Employee profile updated successfully.');
      onClose();
      if (onUpdated) onUpdated(updated.data || updated);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update employee profile.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit Employee Profile" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">{error}</p>}

        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Personal & Work Details</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="First Name" value={form.firstName} onChange={handleChange('firstName')} required />
            <Input label="Last Name" value={form.lastName} onChange={handleChange('lastName')} required />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Designation" value={form.designation} onChange={handleChange('designation')} />
            <Select label="Department" value={form.departmentId} onChange={handleChange('departmentId')}>
              <option value="">Unassigned</option>
              {departments.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select label="Employment Type" value={form.employmentType} onChange={handleChange('employmentType')}>
              <option value="FULL_TIME">Full Time</option>
              <option value="PART_TIME">Part Time</option>
              <option value="CONTRACT">Contract</option>
              <option value="INTERN">Intern</option>
            </Select>
            <Input label="Joining Date" type="date" value={form.joiningDate} onChange={handleChange('joiningDate')} />
            <Input label="Date of Birth" type="date" value={form.dateOfBirth} onChange={handleChange('dateOfBirth')} />
          </div>
        </div>

        <div className="space-y-3 pt-3 border-t border-slate-100">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Contact Information</p>

          <Input label="Phone" value={form.phone} onChange={handleChange('phone')} />
          <Textarea label="Address" rows={2} value={form.address} onChange={handleChange('address')} />
        </div>

        <div className="space-y-3 pt-3 border-t border-slate-100">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Emergency Contact</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Emergency Contact Name" value={form.emergencyName} onChange={handleChange('emergencyName')} />
            <Input label="Emergency Contact Phone" value={form.emergencyPhone} onChange={handleChange('emergencyPhone')} />
          </div>
          <Input label="Relationship" value={form.emergencyRelation} onChange={handleChange('emergencyRelation')} />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
          <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
