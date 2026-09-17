import { useState } from 'react';
import { FileEdit } from 'lucide-react';
import { BasicInfoCard } from './BasicInfoCard.jsx';
import { ContactInfoCard } from './ContactInfoCard.jsx';
import { AdditionalInfoCard } from './AdditionalInfoCard.jsx';
import { EditRequestModal } from './EditRequestModal.jsx';
import { Card } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import { useToast } from '../../hooks/useToast.js';

export function PersonalInfoTab({ profile, email, onProfileUpdated }) {
  const toast = useToast();
  const [requestModalOpen, setRequestModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BasicInfoCard profile={profile} email={email} />
        <ContactInfoCard profile={profile} onUpdated={onProfileUpdated} />
      </div>

      <AdditionalInfoCard profile={profile} />

      <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-brand-50/60 border-brand-100">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-white text-brand-700 flex items-center justify-center shrink-0 border border-brand-100">
            <FileEdit size={20} />
          </div>
          <div>
            <p className="text-base font-bold text-slate-800">Request Information Update</p>
            <p className="text-sm text-slate-500 mt-0.5">
              Need to update your HR-managed information? Submit a request and our HR team will review it.
            </p>
          </div>
        </div>
        <Button icon={FileEdit} onClick={() => setRequestModalOpen(true)} className="shrink-0">
          Raise Edit Request
        </Button>
      </Card>

      <EditRequestModal
        open={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        profile={profile}
        onSubmitted={() => toast.info('You can track this request under the Edit Requests tab.')}
      />
    </div>
  );
}
