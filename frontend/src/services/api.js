import axios from 'axios';

const BACKEND_URL_RAW = (process.env.REACT_APP_BACKEND_URL || '').trim().replace(/\/$/, '');
const IS_LOCAL_HOST =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const BACKEND_URL =
    !IS_LOCAL_HOST && /localhost|127\.0\.0\.1/.test(BACKEND_URL_RAW) ? '' : BACKEND_URL_RAW;

// Create safe base URL
const baseURL = BACKEND_URL
    ? `${BACKEND_URL}/api`
    : '/api';

const api = axios.create({
    baseURL,
    timeout: 10000, // 10s timeout as requested
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to attach token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor for unified error handling
api.interceptors.response.use(
    (response) => response,
    (error) => {
        // Timeout Handling
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
            console.error('API Request Timed Out (10s limit)');
            return Promise.reject({
                ...error,
                userMessage: 'Il server non risponde (Timeout 10s). Riprova tra poco.'
            });
        }

        // Network Error (Backend down)
        if (error.message === 'Network Error') {
            console.error('API Network Error - Backend potentially down');
            return Promise.reject({
                ...error,
                userMessage: 'Impossibile contattare il server. Verifica che sia avviato.'
            });
        }

        return Promise.reject(error);
    }
);

export default api;
