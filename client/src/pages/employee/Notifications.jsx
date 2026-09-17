import { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { Card, CardHeader } from '../../components/Card.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { Button } from '../../components/Button.jsx';
import * as notificationService from '../../services/notificationService.js';
import { formatDateTime } from '../../utils/formatters.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { useNavigate } from 'react-router-dom';

export function Notifications() {
  const toast = useToast();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    notificationService
      .listNotifications({ limit: 50 })
      .then((res) => setNotifications(res.data))
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClick = async (n) => {
    if (!n.read) await notificationService.markAsRead(n._id);
    if (n.link) navigate(n.link);
    load();
  };

  const handleMarkAll = async () => {
    await notificationService.markAllAsRead();
    load();
  };

  return (
    <Card padded={false} className="p-5">
      <CardHeader
        title="Notifications"
        action={
          <Button size="sm" variant="outline" icon={CheckCheck} onClick={handleMarkAll}>
            Mark all read
          </Button>
        }
      />
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" description="You're all caught up." />
      ) : (
        <div className="divide-y divide-slate-100">
          {notifications.map((n) => (
            <button
              key={n._id}
              onClick={() => handleClick(n)}
              className={`w-full text-left py-3.5 px-2 -mx-2 rounded-lg hover:bg-slate-50 ${!n.read ? 'bg-brand-50/40' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                {!n.read && <span className="w-2 h-2 rounded-full bg-brand-600 mt-1.5 shrink-0" />}
              </div>
              <p className="text-sm text-slate-500 mt-0.5">{n.message}</p>
              <p className="text-xs text-slate-400 mt-1">{formatDateTime(n.createdAt)}</p>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
