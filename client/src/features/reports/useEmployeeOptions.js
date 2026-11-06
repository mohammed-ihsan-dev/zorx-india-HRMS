import { useEffect, useMemo, useState } from 'react';
import * as employeeService from '../../services/employeeService.js';
import { getErrorMessage } from '../../services/apiClient.js';

export const employeeName = (e) => `${e?.firstName || ''} ${e?.lastName || ''}`.replace(/\s+/g, ' ').trim() || 'Unnamed';

/**
 * The report employee picker (shared by Salary and Attendance reports): the
 * employees this user may list (existing /employees API and its access rules),
 * sorted, searchable; same names get the employee code (or a short id).
 */
export function useEmployeeOptions({ search, selectedId, toast }) {
  const [employees, setEmployees] = useState([]);
  useEffect(() => {
    employeeService
      .listEmployees({ limit: 500 })
      .then((res) => setEmployees((res.data || []).slice().sort((a, b) => employeeName(a).localeCompare(employeeName(b)))))
      .catch((err) => toast.error(getErrorMessage(err, 'Unable to load employees.')));
  }, [toast]);

  const options = useMemo(() => {
    const counts = employees.reduce((m, e) => m.set(employeeName(e), (m.get(employeeName(e)) || 0) + 1), new Map());
    const q = search.trim().toLowerCase();
    return employees
      .map((e) => {
        const name = employeeName(e);
        const tag = counts.get(name) > 1 || e.status === 'INACTIVE' ? ` (${[e.employeeCode || `#${e._id.slice(-4)}`, e.status === 'INACTIVE' && 'inactive'].filter(Boolean).join(', ')})` : '';
        return { id: e._id, label: `${name}${tag}`, haystack: `${name} ${e.employeeCode || ''}`.toLowerCase() };
      })
      .filter((o) => !q || o.haystack.includes(q) || o.id === selectedId);
  }, [employees, search, selectedId]);

  return { employees, options };
}
