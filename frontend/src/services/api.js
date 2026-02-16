import axios from 'axios';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

// Create safe base URL
// On production Vercel, we might want relative path '/api' to use rewrites,
// but for localhost debugging we explicitly want http://localhost:8000/api
const baseURL = IS_PRODUCTION ? '/api' : `${BACKEND_URL.replace(/\/$/, '')}/api`;

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
