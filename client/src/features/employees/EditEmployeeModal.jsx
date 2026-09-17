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
    employeeCode: '',
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
        employeeCode: employee.employeeCode || '',
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

  const clearField = (field) => {
    setForm((f) => ({ ...f, [field]: '' }));
  };

  const clearEmergency = () => {
    setForm((f) => ({ ...f, emergencyName: '', emergencyPhone: '', emergencyRelation: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const payload = {
        employeeCode: form.employeeCode.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        designation: form.designation.trim(),
        departmentId: form.departmentId || null,
        employmentType: form.employmentType,
        joiningDate: form.joiningDate ? new Date(form.joiningDate) : undefined,
        dateOfBirth: form.dateOfBirth ? new Date(form.dateOfBirth) : null,
        phone: form.phone.trim(),
        address: form.address.trim(),
        emergencyContact: {
          name: form.emergencyName.trim(),
          phone: form.emergencyPhone.trim(),
          relation: form.emergencyRelation.trim(),
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-slate-700">Employee ID / Code</span>
                {form.employeeCode && (
                  <button type="button" onClick={() => clearField('employeeCode')} className="text-xs text-brand-700 hover:underline">
                    Mark Not Provided
                  </button>
                )}
              </div>
              <Input value={form.employeeCode} onChange={handleChange('employeeCode')} placeholder="Not Provided" />
            </div>
            <Input label="First Name" value={form.firstName} onChange={handleChange('firstName')} required />
            <Input label="Last Name" value={form.lastName} onChange={handleChange('lastName')} required />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-slate-700">Designation</span>
                {form.designation && (
                  <button type="button" onClick={() => clearField('designation')} className="text-xs text-brand-700 hover:underline">
                    Mark Not Provided
                  </button>
                )}
              </div>
              <Input value={form.designation} onChange={handleChange('designation')} placeholder="e.g. Software Engineer" />
            </div>

            <Select label="Department" value={form.departmentId} onChange={handleChange('departmentId')}>
              <option value="">Unassigned (Not Provided)</option>
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
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-slate-700">Date of Birth</span>
                {form.dateOfBirth && (
                  <button type="button" onClick={() => clearField('dateOfBirth')} className="text-xs text-brand-700 hover:underline">
                    Clear
                  </button>
                )}
              </div>
              <Input type="date" value={form.dateOfBirth} onChange={handleChange('dateOfBirth')} />
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Contact Information</p>
            {(form.phone || form.address) && (
              <button
                type="button"
                onClick={() => {
                  clearField('phone');
                  clearField('address');
                }}
                className="text-xs text-brand-700 font-semibold hover:underline"
              >
                Clear Contact Info
              </button>
            )}
          </div>

          <Input label="Phone" value={form.phone} onChange={handleChange('phone')} placeholder="Not Provided" />
          <Textarea label="Address" rows={2} value={form.address} onChange={handleChange('address')} placeholder="Not Provided" />
        </div>

        <div className="space-y-3 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Emergency Contact</p>
            {(form.emergencyName || form.emergencyPhone || form.emergencyRelation) && (
              <button type="button" onClick={clearEmergency} className="text-xs text-brand-700 font-semibold hover:underline">
                Mark Emergency Contact Not Provided
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Emergency Contact Name" value={form.emergencyName} onChange={handleChange('emergencyName')} placeholder="Not Provided" />
            <Input label="Emergency Contact Phone" value={form.emergencyPhone} onChange={handleChange('emergencyPhone')} placeholder="Not Provided" />
          </div>
          <Input label="Relationship" value={form.emergencyRelation} onChange={handleChange('emergencyRelation')} placeholder="Not Provided" />
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
