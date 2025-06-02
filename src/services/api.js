// api.js
import axios from 'axios';

// Create axios instance
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',

headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Send cookies with every request
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Attach CSRF token from cookie
    const csrfTokenCookie = document.cookie
      .split('; ')
      .find(row => row.startsWith('csrfToken='));

    if (csrfTokenCookie) {
      const csrfToken = csrfTokenCookie.split('=')[1];
      config.headers['X-CSRF-Token'] = csrfToken;
    }

    // Attach Authorization token
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Redirect to login if not authenticated
    if (error.response && error.response.status === 401) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
// API Service methods
export const apiService = {
  // --- CSRF ---
  getCsrfToken: () => api.get('/api/csrf-token'),

  // --- Auth example (optional) ---
  login: async (credentials) => api.post('/api/employee/login', credentials),

  // --- Payments (Employee access) ---
  getPayments: async (page = 1, limit = 10, filters = {}) => {
    const params = new URLSearchParams({ page, limit });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });
    console.log('Fetching payments from:', `/api/employee/payments?${params.toString()}`);

    return api.get(`/api/employee/payments?${params.toString()}`);
    
  },

  getPaymentById: async (id) => api.get(`/api/employee/payments/${id}`),

  processPayment: async (id) => {
    return api.post(`/api/employee/payments/${id}/process`);
  },
  
cancelPayment: async (id, { reason }) => {
  return api.post(`/api/employee/payments/${id}/cancel`, { reason });
},
getEmployeePaymentHistory: async (page = 1, limit = 10, filters = {}) => {
  const params = new URLSearchParams({ page, limit });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });

  return api.get(`/api/employee/payment-history?${params.toString()}`);
},
  // --- Employee Profile ---
  getUserProfile: async () => api.get('/api/employee/profile'),
 
  // --- Customers --- 
// --- Customers --- 
getUserById: async (id) => {
  console.log(`[apiService] Fetching user by ID: ${id}`);
  try {
    const response = await api.get(`/api/users/${id}`);
    console.log(`[apiService] Response for user ID ${id}:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`[apiService] Error fetching user ID ${id}:`, error);
    throw error;
  }
},
/*
 * Get all users (employees)
 */
getAllCustomers: async () => {
  const response = await api.get('/api/employee/users');
  return response.data.data.customers;  // or whatever the response shape is
},



  // --- Admin: Employee Management ---
  createEmployee: async (employeeData) => api.post('/api/admin/users', employeeData),

  getAllEmployees: async (page = 1, limit = 10) => 
    api.get(`/api/admin/users?page=${page}&limit=${limit}`),

  getEmployeeById: async (id) => api.get(`/api/admin/users/${id}`),

  updateEmployee: async (id, employeeData) => 
    api.put(`/api/admin/users/${id}`, employeeData),

  deleteEmployee: async (id) => api.delete(`/api/admin/users/${id}`),
};
