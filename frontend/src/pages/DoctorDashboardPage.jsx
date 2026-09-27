import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import Navbar from '../components/common/Navbar';
import PatientSelector from '../components/doctor/PatientSelector';
import PatientTimeline from '../components/doctor/PatientTimeline';
import VisitLoggerModal from '../components/doctor/VisitLoggerModal';
import AppointmentRequests from '../components/doctor/AppointmentRequests';
import { SkeletonTimeline } from '../components/common/Skeleton';
import ErrorState from '../components/common/ErrorState';
import Toast from '../components/common/Toast';
import { PlusCircle } from 'lucide-react';

export default function DoctorDashboardPage() {
  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [patientsError, setPatientsError] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);
  const [recentNotification, setRecentNotification] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);

  // 1. Fetch patients list
  const loadPatients = async () => {
    setPatientsError(null);
    try {
      const list = await api.getPatients();
      setPatients(list);
      if (list.length > 0) {
        setSelectedPatientId(prev => {
          if (prev) return prev;
          const defaultPat = list.find(p => p.email === 'patient1@medbridge.com') || list[0];
          return defaultPat.id;
        });
      }
    } catch (err) {
      console.error('Failed to load patients:', err);
      setPatientsError(err.message || 'Could not load the patient list.');
    }
  };

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPendingRequests = async () => {
    try {
      const list = await api.getPendingAppointments();
      setPendingRequests(list);
    } catch (err) {
      console.error('Failed to load appointment requests:', err);
    }
  };

  useEffect(() => {
    loadPendingRequests();
  }, []);

  const handleRequestStatusChange = async (id, status) => {
    await api.setAppointmentStatus(id, status);
    setPendingRequests(prev => prev.filter(r => r.id !== id));
    setRecentNotification({
      type: 'success',
      message:
        status === 'confirmed'
          ? 'Appointment request confirmed. The patient can see the updated status.'
          : 'Appointment request declined. The patient can see the updated status.'
    });
    setTimeout(() => setRecentNotification(null), 7000);
  };

  // 2. Fetch history for selected patient
  const loadPatientHistory = async (patientId) => {
    if (!patientId) return;
    setLoading(true);
    setHistoryError(null);
    try {
      const data = await api.getPatientHistory(patientId);
      setHistoryData(data);
    } catch (err) {
      console.error('Failed to load patient history:', err);
      setHistoryError(err.message || 'Could not load this patient\u2019s history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedPatientId) {
      loadPatientHistory(selectedPatientId);
    }
  }, [selectedPatientId]);

  const handleVisitLogged = (result) => {
    // Show notification if visit was saved with warnings
    if (result.conflict_warnings && result.conflict_warnings.length > 0) {
      setRecentNotification({
        type: 'warning',
        message: `Visit saved successfully. ${result.conflict_warnings.length} pharmacological conflict warning(s) were flagged and documented.`
      });
    } else {
      setRecentNotification({
        type: 'success',
        message: 'New clinical encounter, prescriptions, and lab orders saved successfully.'
      });
    }

    // Refresh history
    loadPatientHistory(selectedPatientId);

    // Auto-clear notification after 7s
    setTimeout(() => setRecentNotification(null), 7000);
  };

  const activePatient = patients.find(p => p.id === selectedPatientId) || patients[0];

  return (
    <div className="min-h-screen bg-surface-base">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Toast / Notification Banner */}
        {recentNotification && (
          <Toast
            type={recentNotification.type}
            message={recentNotification.message}
            onDismiss={() => setRecentNotification(null)}
          />
        )}

        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="font-heading font-extrabold text-xl text-primary-950 tracking-tight">
              Clinician Workspace
            </h2>
            <p className="text-xs text-primary-500 font-sans mt-0.5">
              Longitudinal EMR Review, Drug Interaction Guardrails & Encounter Documentation
            </p>
          </div>

          <button
            onClick={() => setIsVisitModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-button bg-clinical-600 hover:bg-clinical-700 text-white text-xs font-semibold shadow-subtle transition-med cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Document New Visit</span>
          </button>
        </div>

        {/* Patient Switcher & Clinical Summary Bar */}
        <PatientSelector
          patients={patients}
          selectedPatientId={selectedPatientId}
          onSelectPatient={setSelectedPatientId}
          historyData={historyData}
        />

        {/* Appointment Requests Panel (Feature Spec 1, doctor side) */}
        <AppointmentRequests
          requests={pendingRequests}
          onStatusChange={handleRequestStatusChange}
        />

        {/* Patient list failure */}
        {patientsError && (
          <ErrorState
            title="Could not load patients"
            description={patientsError}
            onRetry={loadPatients}
          />
        )}

        {/* Medical History Timeline */}
        {loading ? (
          <SkeletonTimeline />
        ) : historyError ? (
          <ErrorState
            title="Could not load patient history"
            description={historyError}
            onRetry={() => loadPatientHistory(selectedPatientId)}
          />
        ) : (
          <PatientTimeline
            historyData={historyData}
            onOpenLogVisit={() => setIsVisitModalOpen(true)}
          />
        )}

        {/* Log Visit Modal Flow */}
        <VisitLoggerModal
          isOpen={isVisitModalOpen}
          onClose={() => setIsVisitModalOpen(false)}
          patient={activePatient}
          onVisitLogged={handleVisitLogged}
        />
      </main>
    </div>
  );
}
