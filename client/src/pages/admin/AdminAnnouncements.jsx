import { useEffect, useState } from 'react';
import { Plus, Megaphone, Trash2, Pencil } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Button } from '../../components/Button.jsx';
import { Modal } from '../../components/Modal.jsx';
import { Input, Select, Textarea } from '../../components/Input.jsx';
import { Badge } from '../../components/Badge.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import * as announcementService from '../../services/announcementService.js';
import { formatDate, titleCase } from '../../utils/formatters.js';
import { PRIORITY_COLORS } from '../../utils/constants.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

const EMPTY_FORM = { title: '', content: '', priority: 'NORMAL', audience: 'ALL', expiryDate: '' };

export function AdminAnnouncements() {
  const toast = useToast();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalState, setModalState] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    announcementService
      .listAllAnnouncements()
      .then(setAnnouncements)
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setError('');
    setModalState({ mode: 'create' });
  };

  const openEdit = (a) => {
    setForm({
      title: a.title,
      content: a.content,
      priority: a.priority,
      audience: a.audience,
      expiryDate: a.expiryDate ? a.expiryDate.slice(0, 10) : '',
    });
    setError('');
    setModalState({ mode: 'edit', announcement: a });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = { ...form, expiryDate: form.expiryDate || null };
      if (modalState.mode === 'create') {
        await announcementService.createAnnouncement(payload);
        toast.success('Announcement published.');
      } else {
        await announcementService.updateAnnouncement(modalState.announcement._id, payload);
        toast.success('Announcement updated.');
      }
      setModalState(null);
      load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save announcement.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await announcementService.deleteAnnouncement(deleteTarget._id);
      toast.success('Announcement deleted.');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Announcements</h3>
        <Button size="sm" icon={Plus} onClick={openCreate}>
          New Announcement
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : announcements.length === 0 ? (
        <Card>
          <EmptyState icon={Megaphone} title="No announcements yet" />
        </Card>
      ) : (
        <div className="grid gap-4">
          {announcements.map((a) => (
            <Card key={a._id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-slate-900">{a.title}</h4>
                    <Badge color={PRIORITY_COLORS[a.priority] || 'slate'}>{titleCase(a.priority)}</Badge>
                    <Badge color="slate">{titleCase(a.audience)}</Badge>
                  </div>
                  <p className="text-sm text-slate-600 mt-2 line-clamp-2">{a.content}</p>
                  <p className="text-xs text-slate-400 mt-2">
                    Published {formatDate(a.publishDate)} {a.expiryDate && `· Expires ${formatDate(a.expiryDate)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button className="text-slate-400 hover:text-brand-700" onClick={() => openEdit(a)}>
                    <Pencil size={15} />
                  </button>
                  <button className="text-slate-400 hover:text-red-600" onClick={() => setDeleteTarget(a)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={Boolean(modalState)} onClose={() => setModalState(null)} title={modalState?.mode === 'create' ? 'New Announcement' : 'Edit Announcement'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">{error}</p>}
          <Input label="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
          <Textarea label="Content" rows={4} value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} required />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Priority" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </Select>
            <Select label="Audience" value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>
              <option value="ALL">Everyone</option>
              <option value="MANAGERS">Managers</option>
              <option value="DEPARTMENT">Department</option>
            </Select>
          </div>
          <Input
            label="Expiry Date (optional)"
            type="date"
            value={form.expiryDate}
            onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={() => setModalState(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Publish
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={submitting}
        title="Delete announcement?"
        description={`This will permanently delete "${deleteTarget?.title}".`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
