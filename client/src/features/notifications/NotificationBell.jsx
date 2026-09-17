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
      trigger={
        <button className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100">
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      }
      className="w-80"
    >
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-100">
        <p className="text-sm font-semibold text-slate-800">Notifications</p>
        {unreadCount > 0 && (
          <button onClick={handleMarkAll} className="text-xs text-brand-700 font-medium flex items-center gap-1 hover:underline">
            <CheckCheck size={13} /> Mark all read
          </button>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto scrollbar-thin">
        {notifications.length === 0 ? (
          <div className="py-6">
            <EmptyState title="No notifications" description="You're all caught up." />
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n._id}
              onClick={() => handleItemClick(n)}
              className={`w-full text-left px-3.5 py-2.5 hover:bg-slate-50 border-b border-slate-50 last:border-0 ${
                !n.read ? 'bg-brand-50/50' : ''
              }`}
            >
              <p className="text-sm font-medium text-slate-800">{n.title}</p>
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
              <p className="text-[11px] text-slate-400 mt-1">{formatDateTime(n.createdAt)}</p>
            </button>
          ))
        )}
      </div>
    </Dropdown>
  );
}
