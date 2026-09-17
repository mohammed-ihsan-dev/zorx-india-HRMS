import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Card, CardHeader } from '../../components/Card.jsx';
import { InfoRow } from '../../components/InfoRow.jsx';
import { Button } from '../../components/Button.jsx';
import { Input, Textarea } from '../../components/Input.jsx';
import * as employeeService from '../../services/employeeService.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

function buildForm(profile) {
  return {
    phone: profile.phone || '',
    address: profile.address || '',
    emergencyName: profile.emergencyContact?.name || '',
    emergencyPhone: profile.emergencyContact?.phone || '',
    emergencyRelation: profile.emergencyContact?.relation || '',
  };
}

export function ContactInfoCard({ profile, onUpdated }) {
  const toast = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => buildForm(profile));

  const startEditing = () => {
    setForm(buildForm(profile));
    setIsEditing(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await employeeService.updateMyProfile({
        phone: form.phone,
        address: form.address,
        emergencyContact: { name: form.emergencyName, phone: form.emergencyPhone, relation: form.emergencyRelation },
      });
      onUpdated(updated);
      toast.success('Contact information updated.');
      setIsEditing(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update contact information.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Contact Information"
        subtitle="You can update these details yourself"
        action={
          !isEditing && (
            <Button size="sm" variant="outline" icon={Pencil} onClick={startEditing}>
              Edit
            </Button>
          )
        }
      />

      {!isEditing ? (
        <dl className="divide-y divide-slate-100">
          <InfoRow label="Phone" value={profile.phone} />
          <InfoRow label="Address" value={profile.address} />
          <InfoRow label="Emergency Contact Name" value={profile.emergencyContact?.name} />
          <InfoRow label="Emergency Contact Phone" value={profile.emergencyContact?.phone} />
          <InfoRow label="Relationship" value={profile.emergencyContact?.relation} />
        </dl>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <Input label="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          <Textarea label="Address" rows={2} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Emergency Contact Name"
              value={form.emergencyName}
              onChange={(e) => setForm((f) => ({ ...f, emergencyName: e.target.value }))}
            />
            <Input
              label="Emergency Contact Phone"
              value={form.emergencyPhone}
              onChange={(e) => setForm((f) => ({ ...f, emergencyPhone: e.target.value }))}
            />
          </div>
          <Input
            label="Relationship"
            value={form.emergencyRelation}
            onChange={(e) => setForm((f) => ({ ...f, emergencyRelation: e.target.value }))}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setIsEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save Changes
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
