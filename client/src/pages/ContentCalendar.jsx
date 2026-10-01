import { useEffect, useState, useMemo, useRef } from 'react';
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
  Users,
  Building2,
  Filter as FilterIcon,
  RotateCcw,
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
import * as clientService from '../services/clientService.js';
import { formatDate } from '../utils/formatters.js';
import { buildMonthGrid, dayNumber, utcYMD, WEEKDAY_LABELS } from '../utils/calendarDate.js';
import { useAuth } from '../hooks/useAuth.js';
import { hasPermission } from '../utils/permissions.js';
import { PERMISSIONS, BACK_OFFICE_ROLES } from '../utils/constants.js';
import { useToast } from '../hooks/useToast.js';
import { getErrorMessage } from '../services/apiClient.js';

export function ContentCalendar() {
  const toast = useToast();
  const { user } = useAuth();
  const canManage = hasPermission(user, PERMISSIONS.CONTENT_CALENDAR_MANAGE);

  // Resolved from the authenticated session's Employee link — never from
  // name/email — so "My Calendar" can never be spoofed or broken by a rename.
  const currentEmployeeId = user?.employee?._id ? String(user.employee._id) : '';
  const currentEmployeeName = user?.employee ? `${user.employee.firstName || ''} ${user.employee.lastName || ''}`.trim() : 'your';
  // Back-office roles (SUPER_ADMIN/ADMIN) already saw the full, unfiltered
  // Content Calendar by default before "My Calendar" existed — that's
  // preserved as-is below, and they never get the toggle (unchanged).
  const isBackOffice = BACK_OFFICE_ROLES.includes(user?.role);

  // A user whose job is to MANAGE Content Calendar work across employees
  // (a "Creator" — EMPLOYEE role + the CONTENT_CALENDAR_MANAGE permission
  // grant, not a separate role) must default to the full dataset too, or
  // their own "My Calendar" is frequently empty (they're assigning work to
  // others, not necessarily to themselves). Derived purely from the existing
  // permission system — never from email, name, or a hard-coded ID list.
  const defaultsToFullCalendar = isBackOffice || canManage;

  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [clients, setClients] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 });

  // Single source of truth for the view scope — 'mine' | 'all'. Never
  // persisted (no existing Content Calendar filter is URL/storage-persisted
  // either), so a refresh or fresh navigation always lands back on the safe
  // default rather than silently keeping a previous "all" choice.
  const [viewMode, setViewMode] = useState(defaultsToFullCalendar ? 'all' : 'mine');

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);

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

  // Close filter popover on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounce search input (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load Client Master collection
  const loadClients = async () => {
    try {
      const data = await clientService.listClients();
      setClients(data);
    } catch (err) {
      // quiet fail or toast error
    }
  };

  // Load assignable employees & clients on mount
  useEffect(() => {
    setLoadingEmployees(true);
    Promise.all([
      contentCalendarService.getAssignableEmployees(),
      clientService.listClients(),
    ])
      .then(([empData, clientData]) => {
        setEmployees(empData);
        setClients(clientData);
      })
      .catch(() => {})
      .finally(() => setLoadingEmployees(false));
  }, []);

  // "My Calendar" locks the scope to the current employee; "Full Calendar"
  // hands control back to the existing free-form Employee filter. This is
  // the ONLY thing that differs — the same `assignedEmployee` query param
  // and the same backend filtering/pagination the Employee filter already
  // used, so nothing about the API contract or RBAC changes.
  const effectiveAssignedEmployee = viewMode === 'mine' ? currentEmployeeId || undefined : selectedEmployee || undefined;

  // Main data load from backend with backend-powered search & filter combinations
  const load = () => {
    setLoading(true);
    contentCalendarService
      .listContentCalendarItems({
        search: debouncedSearch.trim() || undefined,
        clientId: selectedClient || undefined,
        assignedEmployee: effectiveAssignedEmployee,
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

  useEffect(load, [debouncedSearch, selectedClient, selectedEmployee, viewMode, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearAllFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setSelectedClient('');
    setSelectedEmployee('');
    setPage(1);
  };

  const changeViewMode = (mode) => {
    setViewMode(mode);
    setPage(1);
  };

  // The implicit "mine" scope is the default, not a filter the user applied —
  // only count the Employee filter as "active" when it's actually usable
  // (Full Calendar mode).
  const isFilterActive = Boolean(selectedClient || (viewMode === 'all' && selectedEmployee));
  const activeClientObj = clients.find((c) => String(c._id) === selectedClient);
  const activeEmpObj = viewMode === 'all' ? employees.find((e) => String(e._id) === selectedEmployee) : null;

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

  // Group items by status for Board View (Completed limited to latest 5 records)
  const boardData = useMemo(() => {
    const remaining = items.filter((i) => i.workStatus === 'REMAINING');
    const ongoing = items.filter((i) => i.workStatus === 'ONGOING');
    const allCompleted = items.filter((i) => i.workStatus === 'COMPLETED');

    const sortedCompleted = [...allCompleted].sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.date || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.date || b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    const latest5Completed = sortedCompleted.slice(0, 5);

    return {
      REMAINING: remaining,
      ONGOING: ongoing,
      COMPLETED: latest5Completed,
      totalCompletedCount: allCompleted.length,
    };
  }, [items]);

  // Columns definition for List View
  const columns = [
    {
      key: 'client',
      header: 'Client',
      render: (r) => {
        const name = typeof r.clientId === 'object' ? r.clientId?.name : r.client;
        return (
          <button
            type="button"
            onClick={() => setDetailsItem(r)}
            className="font-semibold text-slate-900 hover:text-brand-700 text-left transition-colors"
          >
            {name || '—'}
          </button>
        );
      },
    },
    {
      key: 'work',
      header: 'Work Description',
      render: (r) => (
        <button
          type="button"
          onClick={() => setDetailsItem(r)}
          className="max-w-[260px] truncate block text-left text-slate-700 hover:text-brand-700 transition-colors font-medium"
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
            <span className="text-slate-800 text-sm font-medium">{name}</span>
          </div>
        );
      },
    },
    { key: 'date', header: 'Assignment Date', render: (r) => formatDate(r.date) },
    { key: 'deadline', header: 'Deadline', render: (r) => formatDate(r.deadline) },
    {
      key: 'outputDate',
      header: 'Output Date',
      render: (r) => (r.outputDate ? formatDate(r.outputDate) : <span className="text-slate-400 font-normal">Not set</span>),
    },
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
            title="View Work Details (12 Fields)"
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

  // Calendar helpers.
  //
  // ROOT CAUSE of the old date-shift bug: the grid cells were built with
  // `new Date(year, month, d)` (local-timezone midnight), then keyed with
  // `.toISOString().slice(0, 10)` (UTC). In any timezone ahead of UTC (e.g.
  // Asia/Kolkata, UTC+5:30), that conversion silently rolls a cell's date
  // backward by one calendar day, while an item's own date — parsed from a
  // plain "YYYY-MM-DD" input as UTC midnight — keeps its correct UTC day. The
  // two keys then disagree by exactly one day, every time, in that timezone.
  //
  // Fix: never construct a real Date for a grid cell at all, and never read a
  // business date back out through local getters. `buildMonthGrid`/`dayNumber`
  // (the same utility the Leave Calendar already uses correctly) work purely
  // with integer Y/M/D — no timezone conversion step exists to go wrong.
  const weeks = useMemo(() => buildMonthGrid(currentMonth.getFullYear(), currentMonth.getMonth()), [currentMonth]);

  // The calendar is driven by outputDate ONLY — never the assignment `date`
  // or `deadline`. Legacy items created before outputDate existed have none;
  // they correctly cannot appear on the calendar (they still show in List/Board).
  const itemsByDayNumber = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      if (!item.outputDate) return;
      const { y, m, d } = utcYMD(item.outputDate);
      const key = dayNumber(y, m, d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return map;
  }, [items]);

  const today = new Date();
  const todayNum = dayNumber(today.getFullYear(), today.getMonth(), today.getDate());
  const itemsWithoutOutputDate = items.filter((i) => !i.outputDate).length;

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
          {/* Subtle scope indicator — never a large visual element. */}
          {!isBackOffice && (
            <p className="text-xs text-slate-400 mt-1">
              {viewMode === 'mine' ? `Showing ${currentEmployeeName}'s assigned work` : 'Showing all permitted Content Calendar'}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* My Calendar / View Full Calendar — only shown to base employees;
              management roles already saw the full calendar by default. */}
          {!isBackOffice && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/60">
              <button
                type="button"
                onClick={() => changeViewMode('mine')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  viewMode === 'mine' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <User size={13} />
                <span>My Calendar</span>
              </button>
              <button
                type="button"
                onClick={() => changeViewMode('all')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  viewMode === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <Users size={13} />
                <span>View Full Calendar</span>
              </button>
            </div>
          )}

          {canManage && (
            <Button icon={Plus} onClick={() => setModalItem(null)}>
              Add Work
            </Button>
          )}
        </div>
      </div>

      {/* Main Workspace Card */}
      <Card padded={false} className="p-4 sm:p-6 border border-slate-200/80 shadow-sm">
        {/* ClickUp-Inspired Toolbar: Search, Filter Popover & View Switcher */}
        <div className="space-y-3 mb-5 border-b border-slate-100 pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Search + Filter Controls */}
            <div className="flex items-center gap-2 flex-1 max-w-xl">
              {/* Primary Backend Search Input */}
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Search size={16} />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search employee, client or work..."
                  className="w-full pl-10 pr-9 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-brand-500 rounded-xl text-sm text-slate-800 placeholder-slate-400 transition-all outline-none focus:ring-2 focus:ring-brand-500/20"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Filter Button & Popover */}
              <div className="relative" ref={filterRef}>
                <button
                  type="button"
                  onClick={() => setFilterOpen((prev) => !prev)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-sm font-semibold transition-all ${
                    isFilterActive
                      ? 'bg-brand-50 border-brand-300 text-brand-800 shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <FilterIcon size={15} className={isFilterActive ? 'text-brand-700' : 'text-slate-500'} />
                  <span>Filter</span>
                  {isFilterActive && (
                    <span className="w-2 h-2 rounded-full bg-brand-600 animate-pulse" />
                  )}
                </button>

                {/* Filter Popover Panel */}
                {filterOpen && (
                  <div className="absolute left-0 sm:right-0 sm:left-auto mt-2 w-72 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 z-30 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <FilterIcon size={13} /> Filter
                      </span>
                      {isFilterActive && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClient('');
                            setSelectedEmployee('');
                            setPage(1);
                          }}
                          className="text-xs font-bold text-brand-700 hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {/* Client Filter (Loaded from Client Master) */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block">Client</label>
                      <select
                        value={selectedClient}
                        onChange={(e) => {
                          setSelectedClient(e.target.value);
                          setPage(1);
                        }}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-brand-500 outline-none"
                      >
                        <option value="">All Clients</option>
                        {clients.map((c) => (
                          <option key={String(c._id)} value={String(c._id)}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Employee Filter — only usable in Full Calendar mode. In My
                        Calendar mode the scope is already locked to the current
                        employee, so showing a second, competing employee picker
                        here would be ambiguous rather than useful. */}
                    {viewMode === 'all' && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">Employee</label>
                        <select
                          value={selectedEmployee}
                          onChange={(e) => {
                            setSelectedEmployee(e.target.value);
                            setPage(1);
                          }}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-brand-500 outline-none"
                        >
                          <option value="">All Employees</option>
                          {employees.map((e) => (
                            <option key={String(e._id)} value={String(e._id)}>
                              {`${e.firstName || ''} ${e.lastName || ''}`.trim()}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Clear Filters Footer */}
                    <div className="pt-2 border-t border-slate-100 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedClient('');
                          setSelectedEmployee('');
                          setPage(1);
                          setFilterOpen(false);
                        }}
                        className="w-full py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        Clear Filters
                      </button>
                    </div>
                  </div>
                )}
              </div>
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

          {/* Active Filter Badges */}
          {(debouncedSearch || selectedClient || selectedEmployee) && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {debouncedSearch && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                  Search: &quot;{debouncedSearch}&quot;
                  <button type="button" onClick={() => setSearchQuery('')} className="hover:text-rose-600 ml-0.5">
                    <X size={12} />
                  </button>
                </span>
              )}

              {activeClientObj && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-brand-50 text-brand-800 border border-brand-200">
                  Client: {activeClientObj.name}
                  <button type="button" onClick={() => setSelectedClient('')} className="hover:text-rose-600 ml-0.5">
                    <X size={12} />
                  </button>
                </span>
              )}

              {activeEmpObj && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-brand-50 text-brand-800 border border-brand-200">
                  Employee: {`${activeEmpObj.firstName || ''} ${activeEmpObj.lastName || ''}`.trim()}
                  <button type="button" onClick={() => setSelectedEmployee('')} className="hover:text-rose-600 ml-0.5">
                    <X size={12} />
                  </button>
                </span>
              )}

              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs font-bold text-slate-500 hover:text-rose-600 flex items-center gap-1 ml-1"
              >
                <RotateCcw size={12} /> Clear All
              </button>
            </div>
          )}
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
                  title={debouncedSearch || isFilterActive ? 'No matching work found.' : 'No content calendar items found'}
                  description={
                    debouncedSearch || isFilterActive
                      ? 'No records matched your search/filter criteria. Try clearing filters.'
                      : 'Create a new content work entry to get started.'
                  }
                />
              }
            />
            <div className="mt-4">
              <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPageChange={setPage} />
            </div>
          </div>
        )}

        {/* View 2: BOARD VIEW (KANBAN WITH INNER SCROLLING & LATEST 5 COMPLETED LIMIT) */}
        {activeView === 'board' && (
          <div className="flex-1 flex flex-col min-h-0">
            {loading ? (
              <div className="py-12 text-center text-slate-400 font-semibold">Loading board...</div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={Kanban}
                title={debouncedSearch || isFilterActive ? 'No matching work found.' : 'No content calendar items found'}
                description={
                  debouncedSearch || isFilterActive ? 'No records matched your criteria.' : 'Create a new content work entry to populate the board.'
                }
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 h-[calc(100vh-270px)] min-h-[500px]">
                {[
                  { key: 'REMAINING', label: 'Upcoming', color: 'border-t-slate-400 bg-slate-50/50' },
                  { key: 'ONGOING', label: 'Ongoing', color: 'border-t-blue-500 bg-blue-50/20' },
                  { key: 'COMPLETED', label: 'Completed', color: 'border-t-emerald-500 bg-emerald-50/20' },
                ].map((col) => {
                  const colItems = boardData[col.key] || [];
                  const isCompletedCol = col.key === 'COMPLETED';
                  const totalCompleted = boardData.totalCompletedCount || 0;

                  return (
                    <div key={col.key} className={`flex flex-col h-full rounded-2xl border border-slate-200 p-4 border-t-4 ${col.color} bg-white shadow-xs overflow-hidden`}>
                      {/* Fixed Column Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900 text-sm tracking-tight">{col.label}</span>
                          {isCompletedCol && totalCompleted > 5 && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80">
                              Latest 5 of {totalCompleted}
                            </span>
                          )}
                        </div>
                        <span className="px-2.5 py-0.5 text-xs font-black bg-slate-100 border border-slate-200 rounded-full text-slate-700">
                          {isCompletedCol ? (totalCompleted > 5 ? `5 / ${totalCompleted}` : colItems.length) : colItems.length}
                        </span>
                      </div>

                      {/* Inner Column Scroll Container */}
                      <div className="flex-1 overflow-y-auto pr-1.5 space-y-3 mt-3 scrollbar-thin">
                        {colItems.map((item) => {
                          const clientName = typeof item.clientId === 'object' ? item.clientId?.name : item.client;
                          return (
                            <div
                              key={item._id}
                              onClick={() => setDetailsItem(item)}
                              className="p-3.5 bg-white border border-slate-200/90 hover:border-brand-500 rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer space-y-2.5 group"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                  {clientName || 'Client'}
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
                                    {item.assignedEmployee?.firstName ? `${item.assignedEmployee.firstName} ${item.assignedEmployee.lastName || ''}`.trim() : 'Unassigned'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock size={12} className="text-rose-400" />
                                  <span>{formatDate(item.deadline)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {colItems.length === 0 && (
                          <div className="h-32 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-xs text-slate-400 font-medium">
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

            {/* Calendar shows Output Date only — legacy items created before this
                field existed have none and are intentionally never placed here. */}
            {itemsWithoutOutputDate > 0 && (
              <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {itemsWithoutOutputDate} item{itemsWithoutOutputDate === 1 ? '' : 's'} on this page have no Output Date set and
                won&apos;t appear on the calendar — set one from the List view to place them.
              </p>
            )}

            {/* Grid Header Days */}
            <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-slate-500 uppercase tracking-wider py-1">
              {WEEKDAY_LABELS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>

            {/* Grid Cells — built purely from integer Y/M/D (buildMonthGrid), with
                no Date object ever constructed for a cell, so there is no local/UTC
                conversion step left that could shift a day. */}
            <div className="space-y-1.5">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1.5">
                  {week.map((cell, di) => {
                    if (!cell) {
                      return <div key={di} className="min-h-[100px] sm:min-h-[110px] rounded-xl bg-slate-50/60 border border-slate-100" />;
                    }
                    const cellNum = dayNumber(cell.year, cell.month, cell.day);
                    const isToday = cellNum === todayNum;
                    const dayItems = itemsByDayNumber.get(cellNum) || [];

                    return (
                      <div
                        key={di}
                        className={`min-h-[100px] sm:min-h-[110px] p-1.5 rounded-xl border transition-all ${
                          isToday ? 'bg-brand-50/40 border-brand-300' : 'bg-white border-slate-200/80'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1 px-1">
                          <span
                            className={`text-xs font-extrabold ${
                              isToday
                                ? 'w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center'
                                : 'text-slate-700'
                            }`}
                          >
                            {cell.day}
                          </span>
                          {dayItems.length > 0 && <span className="text-[10px] font-bold text-slate-400">{dayItems.length}</span>}
                        </div>

                        <div className="space-y-1 max-h-[80px] overflow-y-auto pr-0.5">
                          {dayItems.map((item) => {
                            const clientName = typeof item.clientId === 'object' ? item.clientId?.name : item.client;
                            return (
                              <button
                                key={item._id}
                                type="button"
                                onClick={() => setDetailsItem(item)}
                                className="w-full text-left p-1 rounded-md bg-slate-100 hover:bg-brand-100 text-slate-800 hover:text-brand-900 text-[11px] font-medium truncate border border-slate-200/60 block transition-colors"
                              >
                                <span className="font-semibold text-slate-900 mr-1">{clientName}:</span>
                                {item.work}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* 12 Fields View Details Modal */}
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
            clients={clients}
            loadingEmployees={loadingEmployees}
            onClose={() => setModalItem(undefined)}
            onClientCreated={loadClients}
            onSaved={() => {
              setModalItem(undefined);
              load();
              loadClients();
            }}
          />

          <ConfirmDialog
            open={Boolean(deleteTarget)}
            onClose={() => setDeleteTarget(null)}
            onConfirm={handleDelete}
            loading={submitting}
            title="Delete this content calendar item?"
            description={`This will permanently delete the "${deleteTarget?.work}" entry.`}
            confirmLabel="Delete"
            variant="danger"
          />
        </>
      )}
    </div>
  );
}
