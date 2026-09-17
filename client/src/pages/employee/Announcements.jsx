import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { Card } from '../../components/Card.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Badge } from '../../components/Badge.jsx';
import { PRIORITY_COLORS } from '../../utils/constants.js';
import * as announcementService from '../../services/announcementService.js';
import { formatDate, titleCase } from '../../utils/formatters.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

export function Announcements() {
  const toast = useToast();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    announcementService
      .listAnnouncements()
      .then(setAnnouncements)
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [toast]);

  if (loading) {
    return (
      <div className="grid gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (announcements.length === 0) {
    return (
      <Card>
        <EmptyState icon={Megaphone} title="No announcements" description="Company announcements will appear here." />
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {announcements.map((a) => (
        <Card key={a._id}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold text-slate-900">{a.title}</h3>
            <Badge color={PRIORITY_COLORS[a.priority] || 'slate'}>{titleCase(a.priority)}</Badge>
          </div>
          <p className="text-sm text-slate-600 mt-2 whitespace-pre-line">{a.content}</p>
          <p className="text-xs text-slate-400 mt-3">Published {formatDate(a.publishDate)}</p>
        </Card>
      ))}
    </div>
  );
}
