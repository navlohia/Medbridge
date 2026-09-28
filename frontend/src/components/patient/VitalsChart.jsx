import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea
} from 'recharts';
import { Activity, TrendingDown, TrendingUp, Plus } from 'lucide-react';
import { api } from '../../api/client';
import Badge from '../common/Badge';
import { SkeletonChart } from '../common/Skeleton';

const STANDARD_VITALS = [
  { label: 'Weight', unit: 'kg' },
  { label: 'Fasting Blood Sugar', unit: 'mg/dL' },
  { label: 'Systolic BP', unit: 'mmHg' },
  { label: 'Diastolic BP', unit: 'mmHg' },
  { label: 'Body Temperature', unit: '°F' },
  { label: 'Heart Rate', unit: 'bpm' }
];

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const parts = isoStr.split('-');
    if (parts.length === 3) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const m = months[parseInt(parts[1], 10) - 1] || parts[1];
      return `${m} ${parseInt(parts[2], 10)}`;
    }
    return isoStr;
  } catch {
    return isoStr;
  }
}

export default function VitalsChart({ patientId, onOpenLogVital, refreshTrigger }) {
  const [selectedVital, setSelectedVital] = useState('Weight');
  const [chartData, setChartData] = useState([]);
  const [reference, setReference] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!patientId) return;

    let isCurrent = true;
    const fetchVitals = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getPatientSelfLogs(patientId, {
          type: 'vital',
          label: selectedVital
        });

        if (isCurrent) {
          const formatted = (res.logs || []).map(item => ({
            date: item.log_date,
            displayDate: formatDate(item.log_date),
            value: parseFloat(item.value),
            unit: item.unit || '',
            normal_low: item.normal_low,
            normal_high: item.normal_high,
            inRange:
              item.normal_low !== null &&
              item.normal_high !== null &&
              parseFloat(item.value) >= item.normal_low &&
              parseFloat(item.value) <= item.normal_high
          }));
          setChartData(formatted);
          setReference(res.reference);
        }
      } catch (err) {
        console.error('Failed to fetch vital trends:', err);
        if (isCurrent) setError(err.message || 'Could not load trend data.');
      } finally {
        if (isCurrent) setLoading(false);
      }
    };

    fetchVitals();
    return () => {
      isCurrent = false;
    };
  }, [patientId, selectedVital, refreshTrigger]);

  // Metric options: the standard home metrics (catalog extras like HbA1c are
  // loggable but trend as raw lines without a reference band)
  const vitalOptions = useMemo(() => STANDARD_VITALS, []);

  const latestPoint = chartData[chartData.length - 1];
  const prevPoint = chartData.length > 1 ? chartData[chartData.length - 2] : null;
  const firstPoint = chartData[0];
  const delta = latestPoint && firstPoint ? latestPoint.value - firstPoint.value : 0;
  const prevDelta = latestPoint && prevPoint ? latestPoint.value - prevPoint.value : null;
  const isNormal = latestPoint?.inRange || false;

  const unit = chartData[0]?.unit || reference?.unit || '';

  // Y-axis bounds
  const values = chartData.map(d => d.value);
  const lo = reference ? reference.normal_low : Math.min(...values, 0);
  const hi = reference ? reference.normal_high : Math.max(...values, 1);
  const dataMin = values.length ? Math.min(...values) : lo;
  const dataMax = values.length ? Math.max(...values) : hi;
  const yMin = Math.max(0, Math.floor(Math.min(dataMin, lo) - (hi - lo) * 0.6 + 5));
  const yMax = Math.ceil(Math.max(dataMax, hi) + (hi - lo) * 0.6 + 5);

  // Computed narrative (replaces the old canned blood-sugar text)
  const narrative = (() => {
    if (!latestPoint) return null;
    const rangeTxt = reference ? `${reference.normal_low}–${reference.normal_high} ${reference.unit || ''}` : null;
    const status = isNormal
      ? `within the normal range${rangeTxt ? ` (${rangeTxt})` : ''}`
      : 'outside the normal range';
    const trendTxt =
      prevDelta === null
        ? ''
        : prevDelta === 0
        ? ', unchanged from the previous reading'
        : prevDelta < 0
        ? `, down ${Math.abs(prevDelta).toFixed(1)} ${unit} from the previous reading`
        : `, up ${prevDelta.toFixed(1)} ${unit} from the previous reading`;
    return `Latest ${selectedVital}: ${latestPoint.value} ${unit}, ${status}${trendTxt}.`;
  })();

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white/95 backdrop-blur-sm border border-surface-border rounded-card p-3 shadow-modal text-xs">
          <div className="text-primary-500 font-medium">{data.date}</div>
          <div className="font-heading font-bold text-base text-primary-900 mt-0.5">
            {data.value} <span className="text-xs font-normal text-primary-600">{data.unit}</span>
          </div>
          {reference && (
            <div className="mt-1.5 pt-1.5 border-t border-surface-border flex items-center justify-between gap-3 text-xs">
              <span className="text-primary-500">Target Range:</span>
              <span className="font-mono text-primary-700">
                {reference.normal_low}–{reference.normal_high} {reference.unit}
              </span>
            </div>
          )}
          <div className="mt-1">
            <Badge variant={data.inRange ? 'success' : 'warning'} size="sm">
              {data.inRange ? 'Within Normal Range' : 'Outside Target Range'}
            </Badge>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-surface-card border border-surface-border rounded-card p-5 shadow-subtle">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-heading font-bold text-base text-primary-900">
              Health Trend & Vitals Tracking
            </h3>
            {latestPoint && (
              <Badge variant={isNormal ? 'success' : 'warning'} size="sm">
                Latest: {latestPoint.value} {latestPoint.unit}
              </Badge>
            )}
          </div>
          <p className="text-xs text-primary-500 mt-0.5">
            Longitudinal trend with clinical reference target band
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedVital}
            onChange={(e) => setSelectedVital(e.target.value)}
            className="text-xs font-semibold py-1.5 px-3 bg-surface-subtle border border-surface-border rounded-button text-primary-800 focus:outline-none focus:ring-2 focus:ring-clinical-500 cursor-pointer"
          >
            {vitalOptions.map(opt => (
              <option key={opt.label} value={opt.label}>
                {opt.label} ({opt.unit})
              </option>
            ))}
          </select>

          <button
            onClick={onOpenLogVital}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-clinical-600 hover:bg-clinical-700 text-white rounded-button text-xs font-semibold transition-med shadow-subtle cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Log Reading</span>
          </button>
        </div>
      </div>

      {/* Chart area */}
      {loading ? (
        <SkeletonChart />
      ) : error ? (
        <div className="h-64 w-full flex flex-col items-center justify-center border border-danger-border bg-danger-bg rounded-card text-xs text-danger-text">
          <Activity className="w-8 h-8 text-danger mb-2" />
          <span>{error}</span>
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-64 w-full flex flex-col items-center justify-center border border-dashed border-surface-border rounded-card text-xs text-primary-400">
          <Activity className="w-8 h-8 text-primary-300 mb-2" />
          <span>No readings recorded for {selectedVital} yet.</span>
          <button
            onClick={onOpenLogVital}
            className="mt-3 text-clinical-600 font-semibold hover:underline cursor-pointer"
          >
            Log first reading
          </button>
        </div>
      ) : (
        <div>
          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 15, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis
                  dataKey="displayDate"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                />
                <YAxis
                  domain={[yMin, yMax]}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                  unit={` ${unit}`}
                />
                <Tooltip content={<CustomTooltip />} />

                {/* Shaded Normal Range Band */}
                {reference && (
                  <ReferenceArea
                    y1={reference.normal_low}
                    y2={reference.normal_high}
                    fill="#0D9488"
                    fillOpacity={0.08}
                    stroke="#14B8A6"
                    strokeOpacity={0.4}
                    strokeDasharray="4 4"
                    label={{
                      value: `Target Normal Band (${reference.normal_low}–${reference.normal_high} ${reference.unit})`,
                      fill: '#0D9488',
                      fontSize: 10,
                      position: 'insideTopLeft'
                    }}
                  />
                )}

                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#0F172A"
                  strokeWidth={2.5}
                  dot={r => {
                    const { cx, cy, payload } = r;
                    return (
                      <circle
                        key={payload.date}
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill={payload.inRange ? '#0D9488' : '#B45309'}
                        stroke="#FFFFFF"
                        strokeWidth={2}
                      />
                    );
                  }}
                  activeDot={{ r: 6, fill: '#0D9488', stroke: '#FFFFFF', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Legend + computed narrative */}
          <div className="mt-3 bg-surface-subtle p-3 rounded-card border border-surface-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-primary-700">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-clinical-600 shrink-0" />
                <span className="font-medium">{narrative}</span>
              </div>
              {delta !== 0 && (
                <span className="text-xs font-semibold flex items-center gap-1 shrink-0">
                  {delta < 0 ? (
                    <TrendingDown className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <TrendingUp className="w-3.5 h-3.5 text-warning" />
                  )}
                  <span>{Math.abs(delta).toFixed(1)} {unit} net change</span>
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-4 text-[10px] text-primary-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-clinical-600 inline-block" /> In normal range
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-warning inline-block" /> Outside range
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
