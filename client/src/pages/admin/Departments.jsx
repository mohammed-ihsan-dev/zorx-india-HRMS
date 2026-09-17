import { useEffect, useState } from 'react';
import { Plus, Building2, Trash2, Pencil } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { Table } from '../../components/Table.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Button } from '../../components/Button.jsx';
import { Modal } from '../../components/Modal.jsx';
import { Input, Textarea } from '../../components/Input.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import * as departmentService from '../../services/departmentService.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

const EMPTY_FORM = { name: '', description: '' };

export function Departments() {
  const toast = useToast();
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalState, setModalState] = useState(null); // { mode: 'create' | 'edit', department }
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    departmentService
      .listDepartments()
      .then(setDepartments)
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setError('');
    setModalState({ mode: 'create' });
  };

  const openEdit = (department) => {
    setForm({ name: department.name, description: department.description || '' });
    setError('');
    setModalState({ mode: 'edit', department });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (modalState.mode === 'create') {
        await departmentService.createDepartment(form);
        toast.success('Department created.');
      } else {
        await departmentService.updateDepartment(modalState.department._id, form);
        toast.success('Department updated.');
      }
      setModalState(null);
      load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save department.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await departmentService.deleteDepartment(deleteTarget._id);
      toast.success('Department deleted.');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { key: 'name', header: 'Department', render: (r) => <span className="font-medium text-slate-800">{r.name}</span> },
    { key: 'description', header: 'Description', render: (r) => r.description || '—' },
    { key: 'manager', header: 'Manager', render: (r) => (r.managerId ? `${r.managerId.firstName} ${r.managerId.lastName}` : '—') },
    { key: 'employeeCount', header: 'Employees' },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div className="flex items-center gap-3">
          <button className="text-slate-400 hover:text-brand-700" onClick={() => openEdit(r)}>
            <Pencil size={15} />
          </button>
          <button className="text-slate-400 hover:text-red-600" onClick={() => setDeleteTarget(r)}>
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <Card padded={false} className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">Departments</h3>
        <Button size="sm" icon={Plus} onClick={openCreate}>
          Add Department
        </Button>
      </div>
      <Table columns={columns} data={departments} loading={loading} emptyState={<EmptyState icon={Building2} title="No departments yet" />} />

      <Modal open={Boolean(modalState)} onClose={() => setModalState(null)} title={modalState?.mode === 'create' ? 'Add Department' : 'Edit Department'} size="sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">{error}</p>}
          <Input label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          <Textarea label="Description" rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={() => setModalState(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={submitting}
        title="Delete department?"
        description={`This will permanently delete "${deleteTarget?.name}". This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </Card>
  );
}
