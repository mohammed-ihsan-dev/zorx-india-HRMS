import { useState } from 'react';
import { UploadCloud, X } from 'lucide-react';
import { Modal } from '../../components/Modal.jsx';
import { Button } from '../../components/Button.jsx';
import { Input, Select } from '../../components/Input.jsx';
import { Avatar } from '../../components/Avatar.jsx';
import * as employeeService from '../../services/employeeService.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { ROLE_LABELS } from '../../utils/constants.js';

const PROFILE_PICTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PROFILE_PICTURE_BYTES = 2 * 1024 * 1024;

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
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setError('');
    setPhotoFile(null);
    setPhotoPreview('');
    onClose();
  };

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handlePhotoChange = (e) => {
    const selected = e.target.files?.[0];
    e.target.value = '';
    if (!selected) return;

    if (!PROFILE_PICTURE_TYPES.includes(selected.type)) {
      setError('Profile picture must be a JPG, PNG, or WEBP image.');
      return;
    }
    if (selected.size > MAX_PROFILE_PICTURE_BYTES) {
      setError('Profile picture must be 2MB or smaller.');
      return;
    }
    setError('');
    setPhotoFile(selected);
    setPhotoPreview(URL.createObjectURL(selected));
  };

  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password.length < 8) {
      setError('Temporary password must be at least 8 characters long.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await employeeService.createEmployee({ ...form, departmentId: form.departmentId || null });
      if (photoFile) {
        try {
          await employeeService.uploadProfilePicture(created._id, photoFile);
        } catch (photoErr) {
          toast.error(getErrorMessage(photoErr, 'Employee created, but the profile picture could not be uploaded.'));
        }
      }
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

        <div className="flex items-center gap-4">
          <Avatar src={photoPreview} firstName={form.firstName} lastName={form.lastName} size="w-16 h-16" textSize="text-xl" className="border border-slate-200" />
          <div className="flex-1">
            <span className="text-sm font-semibold text-slate-700 block mb-1.5">Profile Picture</span>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                <UploadCloud size={15} />
                {photoFile ? 'Change' : 'Upload'}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoChange} />
              </label>
              {photoFile && (
                <button
                  type="button"
                  onClick={removePhoto}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-red-600"
                >
                  <X size={14} /> Remove
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">JPG, PNG, or WEBP · Max 2MB</p>
          </div>
        </div>

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
            minLength={8}
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
