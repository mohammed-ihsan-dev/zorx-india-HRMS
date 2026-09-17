import { useEffect, useState } from 'react';
import { Download, FileBarChart } from 'lucide-react';
import { Card, CardHeader } from '../../components/Card.jsx';
import { Input, Select } from '../../components/Input.jsx';
import { Button } from '../../components/Button.jsx';
import * as departmentService from '../../services/departmentService.js';
import { downloadReportCsv } from '../../services/reportService.js';
import { useToast } from '../../hooks/useToast.js';

const REPORTS = [
  { key: 'attendance', label: 'Attendance Report', path: '/reports/attendance', dateFilter: true },
  { key: 'leave', label: 'Leave Report', path: '/reports/leave', dateFilter: true },
  { key: 'employees', label: 'Employee Report', path: '/reports/employees', dateFilter: false },
  { key: 'tasks', label: 'Task Report', path: '/reports/tasks', dateFilter: false },
];

export function Reports() {
  const toast = useToast();
  const [departments, setDepartments] = useState([]);
  const [filters, setFilters] = useState({ from: '', to: '', departmentId: '' });
  const [downloading, setDownloading] = useState('');

  useEffect(() => {
    departmentService.listDepartments().then(setDepartments).catch(() => {});
  }, []);

  const handleDownload = async (report) => {
    setDownloading(report.key);
    try {
      await downloadReportCsv(report.path, {
        from: report.dateFilter ? filters.from || undefined : undefined,
        to: report.dateFilter ? filters.to || undefined : undefined,
        departmentId: filters.departmentId || undefined,
      });
      toast.success(`${report.label} downloaded.`);
    } catch {
      toast.error('Could not download report.');
    } finally {
      setDownloading('');
    }
  };

  return (
    <div className="space-y-6">
      <Card padded={false} className="p-5">
        <CardHeader title="Report Filters" subtitle="Applied where relevant to each report" />
        <div className="flex flex-wrap gap-3">
          <Input type="date" label="From" className="w-40" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
          <Input type="date" label="To" className="w-40" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
          <Select label="Department" className="w-52" value={filters.departmentId} onChange={(e) => setFilters((f) => ({ ...f, departmentId: e.target.value }))}>
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {REPORTS.map((report) => (
          <Card key={report.key} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-800 flex items-center justify-center">
                <FileBarChart size={20} />
              </div>
              <div>
                <p className="font-semibold text-slate-800">{report.label}</p>
                <p className="text-xs text-slate-400">Export as CSV</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={Download}
              loading={downloading === report.key}
              onClick={() => handleDownload(report)}
            >
              Export
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
