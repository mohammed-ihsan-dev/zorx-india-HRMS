import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { CalendarClock, House, Check, X, ChevronRight, MapPin, FilePenLine, Inbox, RefreshCw, ShieldAlert } from 'lucide-react';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../../hooks/useToast.js';
import { useMobileShell } from '../../context/MobileShellContext.jsx';
import * as leaveService from '../../services/leaveService.js';
import * as wfhService from '../../services/wfhService.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { formatDate } from '../../utils/formatters.js';
import { ROLES, PERMISSIONS } from '../../utils/constants.js';
import { leaveReviewBlock } from '../leave/leaveReviewRules.js';

const TYPE_LABEL = { CASUAL: 'Casual Leave', SICK: 'Sick Leave', PAID: 'Paid Leave' };
const nameOf = (e) => (e ? `${e.firstName} ${e.lastName || ''}`.trim() : 'Employee');
const idOf = (v) => String(v?._id || v || '');

function RequestCard({ title, badge, lines, reason, block, busy, onApprove, onReject }) {
  return (
    <li className="rounded-2xl bg-zm-card border border-zm-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold text-zm-text truncate">{title}</p>
          {lines.map((l) => (
            <p key={l} className="text-xs text-zm-muted">
              {l}
            </p>
          ))}
        </div>
        {badge && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-zm-accent/20 text-zm-accent-light">{badge}</span>}
      </div>
      {reason && <p className="text-sm text-zm-text/90 bg-zm-elev rounded-xl px-3 py-2 line-clamp-3">{reason}</p>}
      {block ? (
        <p className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
          <ShieldAlert size={14} aria-hidden="true" /> {block}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" disabled={busy} onClick={onReject} className="h-11 rounded-xl border border-red-400/40 bg-red-500/10 text-red-300 font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
            <X size={16} aria-hidden="true" /> Reject
          </button>
          <button type="button" disabled={busy} onClick={onApprove} className="h-11 rounded-xl bg-zm-accent hover:bg-zm-accent-dark text-white font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
            <Check size={16} aria-hidden="true" /> {busy ? 'Saving…' : 'Approve'}
          </button>
        </div>
      )}
    </li>
  );
}

/** Super Admin phone "Approvals": pending leave (incl. HR's own requests) and WFH, using the existing review APIs. */
export function AdminApprovalsPage() {
  const mobile = useMobileShell();
  const { user } = useAuth();
  const toast = useToast();
  const [leaves, setLeaves] = useState([]);
  const [wfh, setWfh] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null); // { kind, item }

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [l, w] = await Promise.all([leaveService.listLeaves({ status: 'PENDING', limit: 100 }), wfhService.listWfh({ status: 'PENDING', limit: 100 })]);
      // HR / Admin requests first: they wait for a Super Admin.
      setLeaves([...(l.data || [])].sort((a, b) => Number(b.requesterRole === ROLES.ADMIN) - Number(a.requesterRole === ROLES.ADMIN)));
      setWfh(w.data || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load pending requests.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mobile) load();
  }, [mobile, load]);

  if (!mobile) return <Navigate to="/admin/leaves" replace />;

  // Only what the server confirms changes the list.
  const decide = async (kind, item, approve) => {
    setBusyId(item._id);
    try {
      if (kind === 'leave') {
        const res = approve ? await leaveService.approveLeave(item._id) : await leaveService.rejectLeave(item._id);
        setLeaves((list) => list.filter((x) => x._id !== res._id));
      } else {
        const res = approve ? await wfhService.approveWfh(item._id) : await wfhService.rejectWfh(item._id);
        setWfh((list) => list.filter((x) => x._id !== res._id));
      }
      toast.success(`${kind === 'leave' ? 'Leave' : 'Work from home'} request ${approve ? 'approved' : 'rejected'}.`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update the request.'));
      load();
    } finally {
      setBusyId(null);
    }
  };

  const canReviewOnsite = user?.role === ROLES.SUPER_ADMIN || user?.permissions?.includes(PERMISSIONS.ONSITE_WORK_REVIEW);
  const hrCount = leaves.filter((l) => l.requesterRole === ROLES.ADMIN).length;

  return (
    <div className="space-y-5 max-w-md mx-auto">
      <div className="sticky -top-3 z-10 -mx-4 px-4 pt-3 pb-2 -mt-3 bg-zm-bg flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-zm-text tracking-tight">Approvals</h1>
          <p className="text-xs text-zm-muted">{loading ? 'Loading…' : `${leaves.length + wfh.length} pending${hrCount ? ` · ${hrCount} from HR` : ''}`}</p>
        </div>
        <button type="button" onClick={load} aria-label="Refresh" className="w-11 h-11 rounded-full bg-zm-card border border-zm-border text-zm-accent-light flex items-center justify-center">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
        </button>
      </div>

      {error && (
        <p className="rounded-2xl bg-red-500/10 border border-red-400/30 text-red-300 text-sm px-4 py-3" role="alert">
          {error}
        </p>
      )}

      <section className="space-y-2.5" aria-label="Leave requests">
        <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-zm-muted flex items-center gap-1.5">
          <CalendarClock size={14} aria-hidden="true" /> Leave requests
        </h2>
        {loading && !leaves.length ? (
          <div className="h-36 rounded-2xl bg-zm-card animate-pulse" />
        ) : leaves.length === 0 ? (
          <p className="rounded-2xl bg-zm-card border border-zm-border px-4 py-5 text-sm text-zm-muted flex items-center gap-2">
            <Inbox size={16} aria-hidden="true" /> No pending leave requests.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {leaves.map((l) => (
              <RequestCard
                key={l._id}
                title={nameOf(l.employeeId)}
                badge={l.requesterRole === ROLES.ADMIN ? 'HR' : null}
                lines={[
                  `${TYPE_LABEL[l.leaveType] || l.leaveType}${l.duration === 'HALF_DAY' ? ` · Half day${l.halfDaySession ? ` (${l.halfDaySession.toLowerCase()})` : ''}` : ''} · ${l.days} day${l.days === 1 ? '' : 's'}`,
                  l.startDate === l.endDate ? formatDate(l.startDate) : `${formatDate(l.startDate)} → ${formatDate(l.endDate)}`,
                ]}
                reason={l.reason}
                block={leaveReviewBlock(user, l)}
                busy={busyId === l._id}
                onApprove={() => decide('leave', l, true)}
                onReject={() => setRejecting({ kind: 'leave', item: l })}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2.5" aria-label="Work from home requests">
        <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-zm-muted flex items-center gap-1.5">
          <House size={14} aria-hidden="true" /> Work from home
        </h2>
        {loading && !wfh.length ? (
          <div className="h-28 rounded-2xl bg-zm-card animate-pulse" />
        ) : wfh.length === 0 ? (
          <p className="rounded-2xl bg-zm-card border border-zm-border px-4 py-5 text-sm text-zm-muted flex items-center gap-2">
            <Inbox size={16} aria-hidden="true" /> No pending WFH requests.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {wfh.map((w) => (
              <RequestCard
                key={w._id}
                title={nameOf(w.employeeId)}
                lines={[formatDate(w.date)]}
                reason={[w.reason, w.workPlan].filter(Boolean).join(' — ')}
                block={user?.employee?._id && idOf(w.employeeId) === idOf(user.employee._id) ? 'Your own request — another admin reviews it.' : null}
                busy={busyId === w._id}
                onApprove={() => decide('wfh', w, true)}
                onReject={() => setRejecting({ kind: 'wfh', item: w })}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" aria-label="Other approvals">
        <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-zm-muted">Other approvals</h2>
        <div className="rounded-2xl bg-zm-card border border-zm-border divide-y divide-zm-border overflow-hidden">
          {canReviewOnsite && (
            <Link to="/admin/onsite-work" className="min-h-[56px] flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="flex items-center gap-3 text-sm font-semibold text-zm-text">
                <MapPin size={18} className="text-zm-accent-light" aria-hidden="true" /> Onsite Work requests
              </span>
              <ChevronRight size={18} className="text-zm-muted" aria-hidden="true" />
            </Link>
          )}
          <Link to="/admin/edit-requests" className="min-h-[56px] flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="flex items-center gap-3 text-sm font-semibold text-zm-text">
              <FilePenLine size={18} className="text-zm-accent-light" aria-hidden="true" /> Profile edit requests
            </span>
            <ChevronRight size={18} className="text-zm-muted" aria-hidden="true" />
          </Link>
          <Link to="/admin/leaves" className="min-h-[56px] flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="flex items-center gap-3 text-sm font-semibold text-zm-text">
              <CalendarClock size={18} className="text-zm-accent-light" aria-hidden="true" /> All leave requests & history
            </span>
            <ChevronRight size={18} className="text-zm-muted" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        onConfirm={async () => {
          const r = rejecting;
          setRejecting(null);
          if (r) await decide(r.kind, r.item, false);
        }}
        title="Reject this request?"
        description={rejecting ? `${nameOf(rejecting.item.employeeId)} will be notified that the request was rejected.` : ''}
        confirmLabel="Reject"
        variant="danger"
      />
    </div>
  );
}
