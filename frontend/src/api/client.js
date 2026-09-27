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

  // Doctors (for patient booking picker)
  getDoctors: () =>
    apiRequest('/doctors')
};
