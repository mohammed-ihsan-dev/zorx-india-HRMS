import { useEffect, useState } from 'react';
import { Card } from '../../components/Card.jsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';
import { Loader } from '../../components/Loader.jsx';
import { LeaveCalendar } from '../../features/leave/LeaveCalendar.jsx';
import { LeaveRequestModal } from '../../features/leave/LeaveRequestModal.jsx';
import { LeaveDetailModal } from '../../features/leave/LeaveDetailModal.jsx';
import * as leaveService from '../../services/leaveService.js';
import { titleCase } from '../../utils/formatters.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';

export function Leave() {
  const toast = useToast();
  const [leaves, setLeaves] = useState([]);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requestDate, setRequestDate] = useState(null);
  const [detailLeave, setDetailLeave] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const load = () => {
    setLoading(true);
    leaveService
      .getMyLeaves()
      .then((data) => {
        setLeaves(data.leaves);
        setBalance(data.balance);
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDayClick = (dateValue, existingLeave) => {
    if (existingLeave) {
      setDetailLeave(existingLeave);
      return;
    }

    const todayYMD = (() => {
      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    })();

    if (dateValue < todayYMD) {
      toast.error('Cannot request leave for past dates.');
      return; // Block opening modal for past dates
    }

    setRequestDate(dateValue);
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await leaveService.cancelLeave(cancelTarget._id);
      toast.success('Leave request cancelled.');
      setCancelTarget(null);
      setDetailLeave(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Leave Requests</h2>
        <p className="text-base text-slate-500 mt-1">Manage your leave requests and upcoming time off.</p>
      </div>

      {balance && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {Object.keys(balance.balances).map((type) => {
            const isCasual = type === 'CASUAL';
            const total = balance.balances[type];
            const used = balance.used[type];
            const remaining = Math.max(0, total - used);

            return (
              <div key={type} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-sm text-slate-500 font-medium">{titleCase(type)} Leave</p>
                  {isCasual && (
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                      User Risk
                    </span>
                  )}
                </div>
                <p className="text-lg font-bold text-slate-900 mt-1">
                  {isCasual ? (
                    <>
                      {used} <span className="text-sm font-normal text-slate-500">day{used === 1 ? '' : 's'} taken (0 allowed)</span>
                    </>
                  ) : (
                    <>
                      {remaining}{' '}
                      <span className="text-sm font-normal text-slate-400">/ {total} day{total === 1 ? '' : 's'} left</span>
                    </>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <Card>
        {loading ? <Loader label="Loading leave calendar…" /> : <LeaveCalendar leaves={leaves} onDayClick={handleDayClick} />}
      </Card>

      <LeaveRequestModal open={Boolean(requestDate)} onClose={() => setRequestDate(null)} initialDate={requestDate} onSubmitted={load} />

      <LeaveDetailModal
        open={Boolean(detailLeave)}
        onClose={() => setDetailLeave(null)}
        leave={detailLeave}
        onRequestCancel={(leave) => setCancelTarget(leave)}
      />

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancel}
        loading={cancelling}
        title="Cancel leave request?"
        description="This will cancel your leave request. If it was already approved, the leave balance will be restored."
        confirmLabel="Cancel Leave"
        variant="danger"
      />
    </div>
  );
}
