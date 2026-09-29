import { useEffect, useState, useMemo } from 'react';
import {
  Plus,
  CalendarDays,
  LayoutList,
  Kanban,
  Pencil,
  Trash2,
  Search,
  X,
  Eye,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Building2,
} from 'lucide-react';
import { Card } from '../components/Card.jsx';
import { Table } from '../components/Table.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { Button } from '../components/Button.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { ContentCalendarItemModal } from '../features/contentCalendar/ContentCalendarItemModal.jsx';
import { ContentCalendarDetailsModal } from '../features/contentCalendar/ContentCalendarDetailsModal.jsx';
import * as contentCalendarService from '../services/contentCalendarService.js';
import { formatDate } from '../utils/formatters.js';
import { useAuth } from '../hooks/useAuth.js';
import { hasPermission } from '../utils/permissions.js';
import { PERMISSIONS } from '../utils/constants.js';
import { useToast } from '../hooks/useToast.js';
import { getErrorMessage } from '../services/apiClient.js';

export function ContentCalendar() {
  const toast = useToast();
  const { user } = useAuth();
  const canManage = hasPermission(user, PERMISSIONS.CONTENT_CALENDAR_MANAGE);

  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeView, setActiveView] = useState('list'); // 'calendar' | 'list' | 'board'
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [modalItem, setModalItem] = useState(undefined); // undefined = closed, null = create, object = edit
  const [detailsItem, setDetailsItem] = useState(null); // null = closed, object = view details
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Calendar month state
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Debounce search query input (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load assignable employees for dropdown using the new assignable endpoint
  useEffect(() => {
    setLoadingEmployees(true);
    contentCalendarService
      .getAssignableEmployees()
      .then((data) => setEmployees(data))
      .catch(() => {})
      .finally(() => setLoadingEmployees(false));
  }, []);

  // Main data load from backend with backend-powered search
  const load = () => {
    setLoading(true);
    contentCalendarService
      .listContentCalendarItems({
        search: debouncedSearch.trim() || undefined,
        page,
        limit: 50,
      })
      .then((res) => {
        setItems(res.data);
        setMeta(res.meta);
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [debouncedSearch, page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Quick Status change from Board or Details Modal
  const handleStatusChange = async (item, newStatus) => {
    try {
      const updated = await contentCalendarService.updateContentCalendarItem(item._id, { workStatus: newStatus });
      toast.success(`Status updated to ${newStatus}`);
      if (detailsItem && detailsItem._id === item._id) {
        setDetailsItem(updated);
      }
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await contentCalendarService.deleteContentCalendarItem(deleteTarget._id);
      toast.success('Content calendar item deleted.');
      setDeleteTarget(null);
      if (detailsItem && detailsItem._id === deleteTarget._id) {
        setDetailsItem(null);
      }
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Group items by status for Board View
  const boardData = useMemo(() => {
    const remaining = items.filter((i) => i.workStatus === 'REMAINING');
    const ongoing = items.filter((i) => i.workStatus === 'ONGOING');
    const completed = items.filter((i) => i.workStatus === 'COMPLETED');
    return { REMAINING: remaining, ONGOING: ongoing, COMPLETED: completed };
  }, [items]);

  // Columns definition for List View
  const columns = [
    {
      key: 'client',
      header: 'Client',
      render: (r) => (
        <button
          type="button"
          onClick={() => setDetailsItem(r)}
          className="font-semibold text-slate-900 hover:text-brand-700 text-left transition-colors"
        >
          {r.client}
        </button>
      ),
    },
    {
      key: 'work',
      header: 'Work Description',
      render: (r) => (
        <button
          type="button"
          onClick={() => setDetailsItem(r)}
          className="max-w-[260px] truncate block text-left text-slate-700 hover:text-brand-700 transition-colors"
        >
          {r.work}
        </button>
      ),
    },
    {
      key: 'assignedEmployee',
      header: 'Assigned Employee',
      render: (r) => {
        const emp = r.assignedEmployee;
        const name = emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : 'Unassigned';
        return (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
              {emp?.firstName ? emp.firstName[0].toUpperCase() : 'U'}
            </div>
            <span className="text-slate-800 text-sm">{name}</span>
          </div>
        );
      },
    },
    { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
    { key: 'deadline', header: 'Deadline', render: (r) => formatDate(r.deadline) },
    { key: 'priority', header: 'Priority', render: (r) => <PriorityBadge priority={r.priority} /> },
    { key: 'workStatus', header: 'Status', render: (r) => <StatusBadge status={r.workStatus} /> },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDetailsItem(r)}
            className="p-1.5 text-slate-500 hover:text-brand-700 hover:bg-slate-100 rounded-lg transition-colors"
            title="View Details (All 11 Fields)"
            aria-label="View Details"
          >
            <Eye size={16} />
          </button>
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => setModalItem(r)}
                className="p-1.5 text-slate-500 hover:text-brand-700 hover:bg-slate-100 rounded-lg transition-colors"
                title="Edit Work"
                aria-label="Edit"
              >
                <Pencil size={16} />
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(r)}
                className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                title="Delete Work"
                aria-label="Delete"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  // Calendar helpers
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday
    const daysInMonth = lastDayOfMonth.getDate();

    const days = [];
    // Previous month padding
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month - 1, prevMonthLastDay - i), isCurrentMonth: false });
    }
    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ date: new Date(year, month, d), isCurrentMonth: true });
    }
    // Next month padding to reach 35 or 42 grid cells
    const totalGrid = days.length > 35 ? 42 : 35;
    const remainingGrid = totalGrid - days.length;
    for (let i = 1; i <= remainingGrid; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }
    return days;
  }, [currentMonth]);

  const itemsByDateString = useMemo(() => {
    const map = {};
    items.forEach((item) => {
      if (item.date) {
        const dKey = new Date(item.date).toISOString().slice(0, 10);
        if (!map[dKey]) map[dKey] = [];
        map[dKey].push(item);
      }
    });
    return map;
  }, [items]);

  return (
    <div className="space-y-5">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Content Calendar</h2>
          <p className="text-sm text-slate-500 mt-1">
            {canManage
              ? 'ClickUp-inspired workspace to manage client content schedules, deliverables, and assignments.'
              : 'Workspace to view client content schedules, work details, and status updates.'}
          </p>
        </div>
        {canManage && (
          <Button icon={Plus} onClick={() => setModalItem(null)}>
            Add Work
          </Button>
        )}
      </div>

      {/* Main Workspace Card */}
      <Card padded={false} className="p-4 sm:p-6 border border-slate-200/80 shadow-sm">
        {/* Top Control Bar: Single Primary Search & View Switcher */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5 border-b border-slate-100 pb-4">
          {/* Primary Search Bar */}
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search size={17} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Search employee, client or work..."
              className="w-full pl-10 pr-9 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-brand-500 rounded-xl text-sm text-slate-800 placeholder-slate-400 transition-all outline-none focus:ring-2 focus:ring-brand-500/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* View Switcher Tabs (Calendar | List | Board) */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start md:self-auto shrink-0 border border-slate-200/60">
            <button
              type="button"
              onClick={() => setActiveView('calendar')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeView === 'calendar'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <CalendarDays size={14} />
              <span>Calendar</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('list')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeView === 'list'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <LayoutList size={14} />
              <span>List</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('board')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeView === 'board'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <Kanban size={14} />
              <span>Board</span>
            </button>
          </div>
        </div>

        {/* View 1: LIST VIEW */}
        {activeView === 'list' && (
          <div>
            <Table
              columns={columns}
              data={items}
              loading={loading}
              emptyState={
                <EmptyState
                  icon={CalendarDays}
                  title={debouncedSearch ? 'No matching work found.' : 'No content calendar items found'}
                  description={
                    debouncedSearch ? `No records matched "${debouncedSearch}". Try a different search term.` : 'Create a new content work entry to get started.'
                  }
                />
              }
            />
            <div className="mt-4">
              <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPageChange={setPage} />
            </div>
          </div>
        )}

        {/* View 2: BOARD VIEW (KANBAN) */}
        {activeView === 'board' && (
          <div>
            {loading ? (
              <div className="py-12 text-center text-slate-400">Loading board...</div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={Kanban}
                title={debouncedSearch ? 'No matching work found.' : 'No content calendar items found'}
                description={
                  debouncedSearch ? `No records matched "${debouncedSearch}".` : 'Create a new content work entry to populate the board.'
                }
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {[
                  { key: 'REMAINING', label: 'Remaining', color: 'border-t-slate-400 bg-slate-50/50' },
                  { key: 'ONGOING', label: 'Ongoing', color: 'border-t-blue-500 bg-blue-50/20' },
                  { key: 'COMPLETED', label: 'Completed', color: 'border-t-emerald-500 bg-emerald-50/20' },
                ].map((col) => {
                  const colItems = boardData[col.key] || [];
                  return (
                    <div key={col.key} className={`rounded-xl border border-slate-200 p-3.5 border-t-4 ${col.color}`}>
                      <div className="flex items-center justify-between mb-3 px-1">
                        <span className="font-bold text-slate-800 text-sm">{col.label}</span>
                        <span className="px-2 py-0.5 text-xs font-bold bg-white border border-slate-200 rounded-full text-slate-600">
                          {colItems.length}
                        </span>
                      </div>

                      <div className="space-y-3 min-h-[160px]">
                        {colItems.map((item) => (
                          <div
                            key={item._id}
                            onClick={() => setDetailsItem(item)}
                            className="p-3.5 bg-white border border-slate-200/90 hover:border-brand-500 rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer space-y-2.5 group"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                <Building2 size={12} className="text-slate-400" />
                                {item.client}
                              </span>
                              <PriorityBadge priority={item.priority} />
                            </div>

                            <h4 className="font-semibold text-slate-900 text-sm group-hover:text-brand-700 transition-colors line-clamp-2">
                              {item.work}
                            </h4>

                            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
                              <div className="flex items-center gap-1.5">
                                <User size={13} className="text-slate-400" />
                                <span className="truncate max-w-[110px]">
                                  {item.assignedEmployee?.firstName ? `${item.assignedEmployee.firstName} ${item.assignedEmployee.lastName}` : 'Unassigned'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock size={12} className="text-rose-400" />
                                <span>{formatDate(item.deadline)}</span>
                              </div>
                            </div>
                          </div>
                        ))}

                        {colItems.length === 0 && (
                          <div className="h-28 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-xs text-slate-400">
                            No {col.label.toLowerCase()} work
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* View 3: CALENDAR VIEW */}
        {activeView === 'calendar' && (
          <div className="space-y-4">
            {/* Calendar Month Header Controls */}
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200/80 p-3 rounded-xl">
              <h3 className="text-base font-extrabold text-slate-900">
                {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </h3>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentMonth(new Date())}
                >
                  Today
                </Button>
                <button
                  type="button"
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                  className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                  className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Grid Header Days */}
            <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-slate-500 uppercase tracking-wider py-1">
              <span>Sun</span>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
            </div>

            {/* Grid Cells */}
            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map((dObj, idx) => {
                const dateStr = dObj.date.toISOString().slice(0, 10);
                const dayItems = itemsByDateString[dateStr] || [];
                const isToday = new Date().toISOString().slice(0, 10) === dateStr;

                return (
                  <div
                    key={idx}
                    className={`min-h-[100px] sm:min-h-[110px] p-1.5 rounded-xl border transition-all ${
                      dObj.isCurrentMonth
                        ? isToday
                          ? 'bg-brand-50/40 border-brand-300'
                          : 'bg-white border-slate-200/80'
                        : 'bg-slate-50/60 border-slate-100 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1 px-1">
                      <span
                        className={`text-xs font-extrabold ${
                          isToday
                            ? 'w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center'
                            : dObj.isCurrentMonth
                            ? 'text-slate-700'
                            : 'text-slate-400'
                        }`}
                      >
                        {dObj.date.getDate()}
                      </span>
                      {dayItems.length > 0 && (
                        <span className="text-[10px] font-bold text-slate-400">{dayItems.length}</span>
                      )}
                    </div>

                    <div className="space-y-1 max-h-[80px] overflow-y-auto pr-0.5">
                      {dayItems.map((item) => (
                        <button
                          key={item._id}
                          type="button"
                          onClick={() => setDetailsItem(item)}
                          className="w-full text-left p-1 rounded-md bg-slate-100 hover:bg-brand-100 text-slate-800 hover:text-brand-900 text-[11px] font-medium truncate border border-slate-200/60 block transition-colors"
                        >
                          <span className="font-semibold text-slate-900 mr-1">{item.client}:</span>
                          {item.work}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* 11 Mandatory Fields View Details Modal */}
      <ContentCalendarDetailsModal
        open={Boolean(detailsItem)}
        onClose={() => setDetailsItem(null)}
        item={detailsItem}
        canManage={canManage}
        onEdit={(itemToEdit) => setModalItem(itemToEdit)}
        onDelete={(itemToDelete) => setDeleteTarget(itemToDelete)}
        onStatusChange={handleStatusChange}
      />

      {/* Create / Edit Modal for Management Users */}
      {canManage && (
        <>
          <ContentCalendarItemModal
            open={modalItem !== undefined}
            item={modalItem}
            employees={employees}
            loadingEmployees={loadingEmployees}
            onClose={() => setModalItem(undefined)}
            onSaved={() => {
              setModalItem(undefined);
              load();
            }}
          />

          <ConfirmDialog
            open={Boolean(deleteTarget)}
            onClose={() => setDeleteTarget(null)}
            onConfirm={handleDelete}
            loading={submitting}
            title="Delete this content calendar item?"
            description={`This will permanently delete the "${deleteTarget?.work}" entry for ${deleteTarget?.client}.`}
            confirmLabel="Delete"
            variant="danger"
          />
        </>
      )}
    </div>
  );
}
