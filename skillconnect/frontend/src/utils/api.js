// utils/api.js — Pre-configured axios instance
import axios from 'axios'

const api = axios.create({
  baseURL: 'https://skiilconect.onrender.com/api',
  headers: { 'Content-Type': 'application/json' },
})

// Response interceptor — normalize errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || error.message || 'Something went wrong'
    return Promise.reject(new Error(message))
  }
)

export default api
