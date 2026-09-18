import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Dropdown } from '../../components/Dropdown.jsx';
import * as notificationService from '../../services/notificationService.js';
import { formatDateTime } from '../../utils/formatters.js';
import { EmptyState } from '../../components/EmptyState.jsx';

export function NotificationBell() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await notificationService.listNotifications({ limit: 8 });
      setNotifications(res.data);
      setUnreadCount(res.meta.unreadCount);
    } catch {
      // Silently ignore — the bell is a convenience surface, not critical path.
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  const handleItemClick = async (notification) => {
    if (!notification.read) {
      await notificationService.markAsRead(notification._id);
    }
    if (notification.link) navigate(notification.link);
    load();
  };

  const handleMarkAll = async (e) => {
    e.stopPropagation();
    await notificationService.markAllAsRead();
    load();
  };

  return (
    <Dropdown
      responsive
      trigger={
        <button className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors">
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center shadow-2xs">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      }
      className="sm:w-80"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <p className="text-sm font-extrabold text-slate-900">Notifications</p>
        {unreadCount > 0 && (
          <button onClick={handleMarkAll} className="text-xs text-brand-800 font-extrabold flex items-center gap-1 hover:underline">
            <CheckCheck size={14} /> Mark all read
          </button>
        )}
      </div>
      <div className="max-h-[60vh] sm:max-h-80 overflow-y-auto divide-y divide-slate-100">
        {notifications.length === 0 ? (
          <div className="py-8">
            <EmptyState title="No notifications" description="You're all caught up." />
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n._id}
              onClick={() => handleItemClick(n)}
              className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                !n.read ? 'bg-brand-50/50' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-extrabold text-slate-900 leading-snug">{n.title}</p>
                {!n.read && <span className="w-2 h-2 rounded-full bg-brand-700 shrink-0 mt-1" />}
              </div>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 line-clamp-2 leading-relaxed">{n.message}</p>
              <p className="text-[11px] font-semibold text-slate-400 mt-1.5">{formatDateTime(n.createdAt)}</p>
            </button>
          ))
        )}
      </div>
    </Dropdown>
  );
}
