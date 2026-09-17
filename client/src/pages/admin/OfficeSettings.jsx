import { useEffect, useState } from 'react';
import { Save, LocateFixed, MapPin } from 'lucide-react';
import { Card, CardHeader } from '../../components/Card.jsx';
import { Input, Select } from '../../components/Input.jsx';
import { Button } from '../../components/Button.jsx';
import { Loader } from '../../components/Loader.jsx';
import * as settingsService from '../../services/settingsService.js';
import { useToast } from '../../hooks/useToast.js';
import { getErrorMessage } from '../../services/apiClient.js';
import { useGeolocation, LOCATION_STATUS } from '../../hooks/useGeolocation.js';

export function OfficeSettings() {
  const toast = useToast();
  const geolocation = useGeolocation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [pendingLocation, setPendingLocation] = useState(null);

  useEffect(() => {
    settingsService
      .getOfficeSettings()
      .then(setForm)
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [toast]);

  const handleChange = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleUseCurrentLocation = async () => {
    try {
      const coords = await geolocation.request();
      setPendingLocation(coords);
    } catch {
      // Error state is already reflected via geolocation.status/errorMessage.
    }
  };

  const applyPendingLocation = () => {
    setForm((f) => ({ ...f, latitude: pendingLocation.latitude, longitude: pendingLocation.longitude }));
    setPendingLocation(null);
    toast.info('Coordinates applied. Review and click Save Settings to confirm.');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        attendanceRadius: Number(form.attendanceRadius),
        breakDurationMinutes: Number(form.breakDurationMinutes),
        lateThresholdMinutes: Number(form.lateThresholdMinutes),
        halfDayThresholdMinutes: Number(form.halfDayThresholdMinutes),
      };
      delete payload._id;
      delete payload.createdAt;
      delete payload.updatedAt;
      delete payload.__v;
      delete payload.updatedBy;
      const updated = await settingsService.updateOfficeSettings(payload);
      setForm(updated);
      toast.success('Office settings updated successfully.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !form) return <Loader />;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        The office coordinates below are provisional and can be updated at any time. Changing them immediately affects
        where employees are allowed to check in and check out.
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card padded={false} className="p-5">
          <CardHeader title="Office Location" subtitle="Used for location-based attendance verification" />
          <div className="space-y-4">
            <Input label="Office Name" value={form.officeName} onChange={handleChange('officeName')} required />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Latitude" type="number" step="any" value={form.latitude} onChange={handleChange('latitude')} required />
              <Input label="Longitude" type="number" step="any" value={form.longitude} onChange={handleChange('longitude')} required />
            </div>
            <Input
              label="Attendance Radius (meters)"
              type="number"
              min={10}
              value={form.attendanceRadius}
              onChange={handleChange('attendanceRadius')}
              hint="Employees must be within this distance from the office to check in or out."
              required
            />

            <Button type="button" variant="outline" icon={LocateFixed} onClick={handleUseCurrentLocation} loading={geolocation.status === LOCATION_STATUS.CHECKING_LOCATION}>
              Use My Current Location
            </Button>

            {geolocation.errorMessage && <p className="text-sm text-red-600">{geolocation.errorMessage}</p>}

            {pendingLocation && (
              <div className="flex items-start gap-3 bg-brand-50 border border-brand-200 rounded-lg p-3.5">
                <MapPin size={18} className="text-brand-700 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-brand-900">Detected coordinates</p>
                  <p className="text-sm text-brand-800">
                    Lat {pendingLocation.latitude.toFixed(6)}, Lng {pendingLocation.longitude.toFixed(6)}
                  </p>
                  <p className="text-xs text-brand-700 mt-1">Review before applying — this does not save automatically.</p>
                  <div className="flex gap-2 mt-2.5">
                    <Button type="button" size="sm" onClick={applyPendingLocation}>
                      Use These Coordinates
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setPendingLocation(null)}>
                      Discard
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card padded={false} className="p-5">
          <CardHeader title="Working Hours" subtitle="Applied for late and overtime calculations" />
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Working Start Time" type="time" value={form.workingStartTime} onChange={handleChange('workingStartTime')} required />
              <Input label="Working End Time" type="time" value={form.workingEndTime} onChange={handleChange('workingEndTime')} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Break Duration (minutes)" type="number" min={0} value={form.breakDurationMinutes} onChange={handleChange('breakDurationMinutes')} required />
              <Select label="Timezone" value={form.timezone} onChange={handleChange('timezone')}>
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Late Threshold (minutes)" type="number" min={0} value={form.lateThresholdMinutes} onChange={handleChange('lateThresholdMinutes')} />
              <Input label="Half Day Threshold (minutes)" type="number" min={0} value={form.halfDayThresholdMinutes} onChange={handleChange('halfDayThresholdMinutes')} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.overtimeEnabled} onChange={handleChange('overtimeEnabled')} className="rounded border-slate-300" />
              Enable overtime tracking
            </label>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" icon={Save} loading={saving}>
            Save Settings
          </Button>
        </div>
      </form>
    </div>
  );
}
