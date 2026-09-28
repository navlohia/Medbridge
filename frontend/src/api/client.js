const BASE_URL = '/api';

function getToken() {
  return localStorage.getItem('medbridge_token');
}

export async function apiRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const contentType = response.headers.get('content-type');
  let data = null;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMsg = data?.error || data?.message || `HTTP error ${response.status}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  // Auth
  login: (email, password) =>
    apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),

  // Medicines
  getMedicines: (q = '') =>
    apiRequest(`/medicines${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getMedicine: (id) =>
    apiRequest(`/medicines/${id}`),

  // Diagnoses
  getDiagnoses: (q = '') =>
    apiRequest(`/diagnoses${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  // Lab Tests
  getLabTests: () =>
    apiRequest('/lab-tests'),

  // Visits
  createVisit: (visitData) =>
    apiRequest('/visits', {
      method: 'POST',
      body: JSON.stringify(visitData)
    }),
  checkConflicts: (patientId, medicineIds) =>
    apiRequest('/visits/check-conflicts', {
      method: 'POST',
      body: JSON.stringify({ patient_id: patientId, medicine_ids: medicineIds })
    }),

  // Patients
  getPatients: () =>
    apiRequest('/patients'),

  // Doctor guidance on a patient's symptom journal entry
  addSymptomComment: (entryId, comment) =>
    apiRequest(`/self-logs/entry/${entryId}/comment`, {
      method: 'POST',
      body: JSON.stringify({ comment })
    }),
  getPatientHistory: (id) =>
    apiRequest(`/patients/${id}/history`),
  getPatientDashboard: (id) =>
    apiRequest(`/patients/${id}/dashboard`),
  getPatientSelfLogs: (id, { type, label } = {}) => {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (label) params.append('label', label);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/patients/${id}/self-logs${qs}`);
  },

  // Self Logs (Patient write)
  createSelfLog: (logData) =>
    apiRequest('/self-logs', {
      method: 'POST',
      body: JSON.stringify(logData)
    }),

  // Multi-symptom entry (Feature Spec 2)
  createSymptomEntry: (entryData) =>
    apiRequest('/self-logs/entry', {
      method: 'POST',
      body: JSON.stringify(entryData)
    }),

  // Appointments (Feature Spec 1)
  requestAppointment: (data) =>
    apiRequest('/appointments', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  getMyAppointments: () =>
    apiRequest('/appointments/mine'),
  getPendingAppointments: () =>
    apiRequest('/appointments/pending'),
  setAppointmentStatus: (id, status) =>
    apiRequest(`/appointments/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    }),

  // Round 2: time-slot availability + reschedule (Blocks V–VI)
  getAvailability: (doctorId, date) =>
    apiRequest(`/appointments/availability?doctor_id=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(date)}`),
  getDoctorDay: (date) =>
    apiRequest(`/appointments/doctor/day?date=${encodeURIComponent(date)}`),
  proposeReschedule: (id, { proposed_date, proposed_time, proposed_reason }) =>
    apiRequest(`/appointments/${id}/propose-reschedule`, {
      method: 'PATCH',
      body: JSON.stringify({ proposed_date, proposed_time, proposed_reason })
    }),
  respondReschedule: (id, accept) =>
    apiRequest(`/appointments/${id}/respond-reschedule`, {
      method: 'PATCH',
      body: JSON.stringify({ accept })
    }),

  // Round 2: account creation (admin + doctor quick-add share backend utility)
  quickAddPatient: (data) =>
    apiRequest('/patients', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  getAdminStats: () =>
    apiRequest('/admin/stats'),
  getAdminDoctors: (search = '') =>
    apiRequest(`/admin/doctors${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createAdminDoctor: (data) =>
    apiRequest('/admin/doctors', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  getAdminPatients: (search = '') =>
    apiRequest(`/admin/patients${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createAdminPatient: (data) =>
    apiRequest('/admin/patients', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  setAccountStatus: (id, isActive) =>
    apiRequest(`/admin/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive })
    }),
  getAdminAppointments: (filters = {}) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.append(k, v);
    }
    const qs = params.toString();
    return apiRequest(`/admin/appointments${qs ? `?${qs}` : ''}`);
  },

  // Round 2: lab-report upload + review (Block VI)
  uploadLabReport: (imageBase64, mimeType) =>
    apiRequest('/lab-reports/upload', {
      method: 'POST',
      body: JSON.stringify({ image_base64: imageBase64, mime_type: mimeType })
    }),
  getLabReport: (id) =>
    apiRequest(`/lab-reports/${id}`),
  getLabReports: () =>
    apiRequest('/lab-reports'),
  confirmLabReport: (id, rows, reportDate) =>
    apiRequest(`/lab-reports/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ rows, report_date: reportDate })
    }),
  discardLabReport: (id) =>
    apiRequest(`/lab-reports/${id}/discard`, { method: 'POST' }),

  // Doctors (for patient booking picker)
  getDoctors: () =>
    apiRequest('/doctors')
};
