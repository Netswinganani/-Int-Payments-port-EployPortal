// src/context/AuthContext.jsx
import { createContext, useState, useContext, useEffect } from 'react';
import { api } from '../services/api';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [csrfToken, setCsrfToken] = useState('');
  
  useEffect(() => {
  const fetchSession = async () => {
    try {
      //const response = await api.get('/auth/session'); // or your actual auth/session endpoint
      setCurrentUser(response.data.user);
      setCsrfToken(response.data.csrfToken); // make sure backend sends this if needed
    } catch (error) {
      setCurrentUser(null);
    }
  };

  fetchSession();
}, []);
  // Check if user is already logged in on initial load
useEffect(() => {
  const checkLoginStatus = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/api/employee/profile', {
        withCredentials: true
      });

      if (response.status === 200) {
        setCurrentUser(response.data.data.user);
console.log('✅ Logged in user:', response.data.data.user);
        // Get CSRF token from cookie
        const csrfTokenCookie = document.cookie
          .split('; ')
          .find(row => row.startsWith('csrfToken='));

        if (csrfTokenCookie) {
          setCsrfToken(csrfTokenCookie.split('=')[1]);
        }

        //console.log('✅ Logged in user:', response.data.data.user);
      } else {
        setCurrentUser(null);
        console.log('🚫 Not logged in');
      }
    } catch (err) {
      setCurrentUser(null);
      setCsrfToken('');
      console.log('⚠️ Login check failed:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  checkLoginStatus();
}, []);

  
  // Login function
  const login = async (username, password) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await api.post('/api/employee/login', { username, password });
      
      if (response.status === 200) {
        setCurrentUser(response.data.data.user);
        setCsrfToken(response.data.csrfToken);
        return true;
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
      toast.error(err.response?.data?.message || 'Login failed. Please check your credentials.');
      return false;
    } finally {
      setIsLoading(false);
    }
  };
  
  // Logout function
  const logout = async () => {
    try {
      setIsLoading(true);
      await api.post('/api/employee/logout', {}, {
        headers: { 'X-CSRF-Token': csrfToken }
      });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      // Clear auth state even if API call fails
      setCurrentUser(null);
      setCsrfToken('');
      setIsLoading(false);
    }
  };
  
  // Update the current user info
  const updateUserInfo = (userData) => {
    setCurrentUser(prev => ({ ...prev, ...userData }));
  };
  
  // Authentication state and methods to be provided to consuming components
  const value = {
    currentUser,
    isLoading,
    error,
    csrfToken,
    login,
    logout,
    updateUserInfo
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};