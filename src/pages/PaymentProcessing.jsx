// src/pages/PaymentProcessing.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import CancelConfirmationModal from '../components/CancelConfirmationModal';
import { apiService } from '../services/api';
import { 
  ArrowPathIcon, 
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
/**
 * To reduce the file size and improve maintainability:

* Move PaymentRow, ErrorBoundary, ErrorFallback, and the confirmation modal into their own files.

* Extract the modal to components/ConfirmPaymentModal.jsx
 */
// Error Boundary Class Component

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

 componentDidCatch(error, errorInfo) {
  console.error('Error rendering payment row:', error, errorInfo);
  this.setState({ hasError: true });
}


  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

const PaymentProcessing = () => {
  const { currentUser, csrfToken } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [processingPaymentId, setProcessingPaymentId] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAccountValid, setIsAccountValid] = useState(true);
  const [isCancelModalVisible, setCancelModalVisible] = useState(false);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    status: '' // All statuses by default
  });
  const showCancelModal = () => {
    setCancelModalVisible(true);
  };

  const hideCancelModal = () => {
    setCancelModalVisible(false);
  };
useEffect(() => {
  apiService.getCsrfToken().catch((err) => {
    console.error('Failed to fetch CSRF token:', err);
  });
}, []);
  // Fetch payments with filters
  useEffect(() => {
    const fetchPayments = async () => {
      try {
        await apiService.getCsrfToken();
        // Create new employee
        setLoading(true);
        // Add search term to filters if present
        const filterParams = { ...filters, status: filters.status || 'pending' }; // Default to pending if no status is selected
        if (searchTerm) {
          filterParams.search = searchTerm;
        }
        
        const response = await apiService.getPayments(page, 10, filterParams);
        console.log('Payments response:', response); // ✅ log actual response from API


       const paymentsList = response?.data?.data?.payments;
setPayments(Array.isArray(paymentsList) ? paymentsList : []);
        setTotalPages(response.data.pagination.totalPages);
      } catch (error) {
        console.error('Error fetching payments:', error);
        toast.error('Failed to load payments');
      } finally {
        setLoading(false);
      }
    };

    fetchPayments();
  }, [page, filters, searchTerm]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
    setPage(1); // Reset to first page when filter changes
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1); // Reset to first page for new search
  };

  const handleNextPage = () => {
    if (page < totalPages) {
      setPage(page + 1);
    }
  };

  const handlePrevPage = () => {
    if (page > 1) {
      setPage(page - 1);
    }
  };

// Utility functions
const validateAccount = (account) => {
  if (typeof account !== 'string') return false;
  const trimmed = account.trim();
  return trimmed.length >= 10;
};

const getValidAccount = (account, fallback = 'Unknown') => {
  return validateAccount(account) ? account.trim() : fallback;
};

// Simulate account lookup from userId if account is missing
const resolveRecipientAccountFromUserId = async (userId) => {
  try {
    const user = await apiService.getUserById(userId); // Replace with actual service
    return user?.accountNumber || '';
  } catch (error) {
    console.error("Error fetching account by userId:", error);
    return '';
  }
};
function resolveSenderInfoFromUserId(userId, users) {
  if (!userId) {
    console.warn('No userId provided to resolveSenderInfoFromUserId');
    return { senderName: undefined, senderAccount: '', userId: undefined };
  }
  const user = users.find(u => u.id === userId);
  if (!user) {
    console.warn(`User with id ${userId} not found`);
    return { senderName: undefined, senderAccount: '', userId: undefined };
  }
  return {
    senderName: user.name,
    senderAccount: user.accountNumber,
    userId: user.id,
  };
}

const [users, setUsers] = useState([]);

// Load users on component mount
useEffect(() => {
  const fetchUsers = async () => {
    try {
      const customers = await apiService.getAllCustomers();
      console.log('All customers:', customers);
      setUsers(customers); // or setUsers(users || []) if needed
    } catch (error) {
      console.error("Failed to load users:", error);
    }
  };

  fetchUsers();
}, []);



const normalizeAccount = (acc) => acc?.trim().toLowerCase() || '';
const handleProcessPayment = async (payment) => {
  console.log("handleProcessPayment: STARTED");
  //console.log('Processing payment ID:', payment.id);
  //console.log('Current user:', currentUser);
  //console.log('Looking for sender with userId:', payment.userId);
  console.log("Payment object:", payment);
  console.log("payment.userId:", payment?.userId);

  try {
    let recipientAccount = getValidAccount(payment.recipientAccount, '');

    if (!validateAccount(recipientAccount)) {
      toast.error("Invalid recipient account.");
      console.error("Account validation failed:", recipientAccount);
      return;
    }

    if (payment.status !== 'pending') {
      toast.error(`Cannot process a payment with status: ${payment.status}`);
      return;
    }

    const sender = users?.find(u => u.id === payment.userId);
    const receiver = users?.find(u => normalizeAccount(u.accountNumber) === normalizeAccount(recipientAccount));

    if (!sender) {
      toast.error("Sender not found.");
      console.warn("Missing sender for payment ID:", payment.id);
      return;
    }

    if (!receiver) {
      toast.error("Receiver not found.");
      console.warn("Missing receiver for recipientAccount:", recipientAccount);
      return;
    }

    const senderAccount = getValidAccount(sender.accountNumber, '');
    //const senderName = `${sender.firstName || ''} ${sender.lastName || ''}`.trim();
      const senderName = sender.username || 'Unknown Sender';

    setSelectedPayment({
      ...payment,
      recipientAccount,
      senderAccount,
      senderName,
    });

    setIsAccountValid(true);
    setShowConfirmModal(true);

  } catch (err) {
    console.error("Error during payment:", err);
    toast.error("Something went wrong while processing the payment.");
  }
};


  // Process the payment
  const confirmProcessPayment = async () => {
    if (!selectedPayment) return;
    
    try {
      setProcessingPaymentId(selectedPayment.id);
      setShowConfirmModal(false);
      
      // Call backend API to process payment
      const response = await apiService.processPayment(selectedPayment.id);
      
      // Update the payment in the list with the new status
      setPayments(prevPayments => 
  Array.isArray(prevPayments)
    ? prevPayments.map(p => {
        if (!p || typeof p !== 'object') return p; // leave it unchanged if invalid
        return p.id === selectedPayment?.id
          ? { ...p, status: response?.data?.data?.status ?? p.status }
          : p;
      })
    : []
);

      
      toast.success('Payment processed successfully');
    } catch (error) {
      console.error('Error processing payment:', error);
      
      // Display specific error message if available
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error('Failed to process payment');
      }
      
      // Update the payment status if the API returned a failed status
      if (error.response?.data?.data?.status) {
        setPayments(prevPayments => 
          prevPayments.map(p => 
            p.id === selectedPayment.id ? { ...p, status: error.response.data.data.status } : p
          )
        );
      }
    } finally {
      setProcessingPaymentId(null);
      setSelectedPayment(null);
    }
  };

  // Cancel a pending payment
  
 const handleCancelClick = (payment) => {
  if (payment.status !== 'pending') {
    toast.error(`Cannot cancel a payment with status: ${payment.status}`);
    return;
  }
  setSelectedPayment(payment);
  setCancelModalVisible(true); // Show cancel modal
};
  const handleConfirmCancel = async (reason) => {
  if (!selectedPayment) return;

  try {
    setProcessingPaymentId(selectedPayment.id);

    const response = await apiService.cancelPayment(selectedPayment.id, { reason });
console.log('Cancel reason:', reason, typeof reason);

    setPayments((prevPayments) =>
  prevPayments.map((p) => {
    if (!p) return p;
    if (p.id === selectedPayment.id) {
      const newStatus = response?.data?.data?.payment?.status || 'cancelled'; // fallback
      return { ...p, status: newStatus };
    }
    return p;
  })
);

    console.log('Cancel payment response:', response);

    
    toast.success('Payment cancelled successfully');
  } catch (error) {
    console.error('Error cancelling payment:', error);
    toast.error(error.response?.data?.message || 'Failed to cancel payment');
  } finally {
    setProcessingPaymentId(null);
    setCancelModalVisible(false); // Hide modal
    setSelectedPayment(null);
  }
};



  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const formatCurrency = (amount, currency) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD'
    }).format(amount);
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
        case 'flagged':
      return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getActionButton = (payment) => {
    const isProcessing = processingPaymentId === payment.id;
    
    if (isProcessing) {
      return (
        <button 
          disabled
          className="px-2 py-1 text-sm text-gray-500 flex items-center"
        >
          <ArrowPathIcon className="h-4 w-4 mr-1 animate-spin" />
          Processing...
        </button>
      );
    }
    
    if (payment.status === 'pending') {
      return (
        <div className="flex space-x-2">
          <button
            onClick={() => handleProcessPayment(payment)}
            className="px-2 py-1 text-sm text-white bg-green-600 rounded hover:bg-green-700 flex items-center"
          >
            <CheckCircleIcon className="h-4 w-4 mr-1" />
            Process
          </button>
          <button
            onClick={() => handleCancelClick(payment)}
            className="px-2 py-1 text-sm text-white bg-red-600 rounded hover:bg-red-700 flex items-center"
          >
            <XCircleIcon className="h-4 w-4 mr-1" />
            Cancel
          </button>
         
        </div>
      );
    }
    
    return (
      <span className="text-sm text-gray-500">
        {payment.status === 'completed' && 'Processed'}
        {payment.status === 'failed' && 'Failed'}
        {payment.status === 'cancelled' && 'Cancelled'}
      </span>
    );
  };

  // Payment Row Component
  const PaymentRow = ({ payment }) => {
     if (!payment || typeof payment !== 'object') {
    return null; // or show a fallback row
  }
    return (
      <tr className="hover:bg-gray-50">
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="text-sm font-medium text-gray-900">{payment?.id ?? 'N/A'}</div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="text-sm text-gray-900">{payment?.recipientName ?? '-'}</div>
          <div className="text-sm text-gray-500">{payment?.recipientAccount ?? '-'}</div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="text-sm font-medium text-gray-900">
            {formatCurrency(payment?.amount ?? 0, payment?.currency ?? 'USD')}
          </div>
          <div className="text-xs text-gray-500">
           {typeof payment?.fee === 'number' && payment.fee > 0 && `Fee: ${formatCurrency(payment.fee, payment.currency ?? 'USD')}`}
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="text-sm text-gray-900">{payment?.payment_mode ?? '-'}</div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <span
            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(payment?.status)}`}
          >
            {payment?.status ?? 'Unknown'}
          </span>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {payment?.transaction_date ? formatDate(payment.transaction_date) : 'N/A'}
        </td>
        <td className="px-6 py-4 whitespace-nowrap">{getActionButton(payment)}</td>
      </tr>
    );
  };

  // Fallback component for error boundary
  const ErrorFallback = () => (
    <tr>
      <td colSpan="7" className="px-6 py-4 text-center text-sm text-red-500">
        Error rendering payment information
      </td>
    </tr>
  );

  return (
    <div className="py-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Payment Processing</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage and process customer payments
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white shadow rounded-lg mb-6">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Search & Filters</h3>
        </div>
        <div className="p-4">
          <form onSubmit={handleSearchSubmit} className="mb-4">
            <div className="flex">
              <div className="relative flex-grow">
                <input
                  type="text"
                  placeholder="Search by payment ID, recipient name, or account..."
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  value={searchTerm}
                  onChange={handleSearchChange}
                />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3">
                  <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                </div>
              </div>
              <button
                type="submit"
                className="ml-2 inline-flex items-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Search
              </button>
            </div>
          </form>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">
                Start Date
              </label>
              <input
                type="date"
                id="startDate"
                name="startDate"
                value={filters.startDate}
                onChange={handleFilterChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">
                End Date
              </label>
              <input
                type="date"
                id="endDate"
                name="endDate"
                value={filters.endDate}
                onChange={handleFilterChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                Status
              </label>
              <select
                id="status"
                name="status"
                value={filters.status}
                onChange={handleFilterChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg font-medium leading-6 text-gray-900 flex items-center">
            <CurrencyDollarIcon className="h-5 w-5 mr-2 text-blue-500" /> 
            Payments
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            List of payments requiring processing
          </p>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center items-center py-10">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700"></div>
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-10 px-4">
              <p className="text-gray-500">No payment records found</p>
              {(filters.startDate || filters.endDate || filters.status || searchTerm) && (
                <p className="text-sm text-gray-400 mt-2">
                  Try adjusting your filters
                </p>
              )}
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment ID
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Recipient
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment Mode
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
               {Array.isArray(payments) &&
          payments
            .filter(p => p && typeof p === 'object' && p.status) // <- add `p.status` guard
            .map((payment) => (
              <ErrorBoundary key={payment?.id ?? Math.random()} fallback={<ErrorFallback />}>
                <PaymentRow payment={payment} />
              </ErrorBoundary>
        ))}
                      </tbody>
            </table>
          )}
        </div>
          {isCancelModalVisible && selectedPayment && (
       <CancelConfirmationModal
       show={isCancelModalVisible}
       payment={selectedPayment}
       onClose={hideCancelModal}
       onConfirm={handleConfirmCancel}
      />
      )}

        {/* Pagination */}
        {!loading && payments.length > 0 && (
          <div className="px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={handlePrevPage}
                disabled={page === 1}
                className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
                  page === 1 ? 'bg-gray-100 text-gray-400' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Previous
              </button>
              <button
                onClick={handleNextPage}
                disabled={page === totalPages}
                className={`ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
                  page === totalPages ? 'bg-gray-100 text-gray-400' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">page {page}</span> of{' '}
                  <span className="font-medium">{totalPages}</span> pages
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={handlePrevPage}
                    disabled={page === 1}
                    className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium ${
                      page === 1 ? 'text-gray-300' : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <span className="sr-only">Previous</span>
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {/* Current page */}
                  <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-blue-50 text-sm font-medium text-blue-600">
                    {page}
                  </span>
                  <button
                    onClick={handleNextPage}
                    disabled={page === totalPages}
                    className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium ${
                      page === totalPages ? 'text-gray-300' : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <span className="sr-only">Next</span>
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
    {showConfirmModal && selectedPayment && (
  <div className="fixed z-10 inset-0 overflow-y-auto" role="dialog" aria-modal="true">
    <div className="flex items-end justify-center min-h-screen px-4 pb-20 text-center sm:block sm:p-0">
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" />
      <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
      <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
        <div className="sm:flex sm:items-start">
          <div className={`mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full ${isAccountValid ? 'bg-blue-100' : 'bg-red-100'} sm:mx-0 sm:h-10 sm:w-10`}>
            <ExclamationTriangleIcon className={`h-6 w-6 ${isAccountValid ? 'text-blue-600' : 'text-red-600'}`} aria-hidden="true" />
          </div>
          <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
            <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
              {isAccountValid ? 'Process Payment' : 'Flag Ineligible Payment'}
            </h3>
            <div className="mt-2">
              <p className="text-sm text-gray-500">
                {isAccountValid
                  ? 'Are you sure you want to process this payment?'
                  : 'This payment appears to have an invalid account. You can flag it as ineligible and optionally refund the sender.'}
              </p>

              <div className="mt-4 bg-gray-50 p-4 rounded-md">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500">RECIPIENT</p>
                    <p className="text-sm font-medium text-gray-900">{selectedPayment.recipientName}</p>
                    <p className="text-xs text-gray-500">{selectedPayment.recipientAccount || 'Unknown Recipient Account'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500">SENDER</p>
                    <p className="text-sm font-medium text-gray-900">{selectedPayment.senderName || 'Unknown Sender'}</p>
                    <p className="text-xs text-gray-500">{selectedPayment.senderAccount || 'Unknown Sender Account'}</p>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500">AMOUNT</p>
                    <p className="text-sm font-medium text-gray-900">
                      {formatCurrency(selectedPayment.amount, selectedPayment.currency)}
                    </p>
                    {selectedPayment.fee > 0 && (
                      <p className="text-xs text-gray-500">
                        Fee: {formatCurrency(selectedPayment.fee, selectedPayment.currency)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
          {isAccountValid ? (
            <button
              type="button"
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 sm:ml-3 sm:w-auto sm:text-sm"
              onClick={confirmProcessPayment}
            >
              Confirm
            </button>
          ) : (
            <button
              type="button"
              className="w-full inline-flex justify-center rounded-md border border-red-300 shadow-sm px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 sm:ml-3 sm:w-auto sm:text-sm"
              onClick={async () => {
                try {
                  await apiService.flagPayment(selectedPayment.id);
                  toast.success('Payment flagged as ineligible');
                  setPayments(prev =>
                    prev.map(p =>
                      p.id === selectedPayment.id ? { ...p, status: 'flagged' } : p
                      
                    )
                  );
                  await apiService.refundSender({
                    senderAccount: selectedPayment.senderAccount,
                    amount: selectedPayment.amount,
                  });
                } catch (e) {
                  console.error('Error flagging payment:', e);
                  toast.error('Failed to flag payment');
                } finally {
                  setShowConfirmModal(false);
                  setSelectedPayment(null);
                }
              }}
            >
              Flag as Ineligible
            </button>
          )}
          <button
            type="button"
            className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-gray-700 hover:bg-gray-50 sm:mt-0 sm:w-auto sm:text-sm"
            onClick={() => {
              setShowConfirmModal(false);
              setSelectedPayment(null);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
)}

 </div>
  );
};

export default PaymentProcessing;