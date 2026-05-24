import React, { createContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import axios from 'axios';

export const AppContext = createContext();

// Helper to determine default API URL
const getDefaultApiUrl = () => {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000/api';
  }
  return 'http://localhost:5000/api';
};

export const AppProvider = ({ children }) => {
  const [token, setToken] = useState('mock-developer-token');
  const [user, setUser] = useState({
    id: 1,
    email: 'alex@fintech.ai',
    name: 'أليكس ستيرلينغ',
    baseCurrency: 'SAR'
  });
  const [loading, setLoading] = useState(true);
  const [apiUrl, setApiUrl] = useState(getDefaultApiUrl());
  const [dashboardData, setDashboardData] = useState(null);
  const [products, setProducts] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [people, setPeople] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [monthlyBudget, setMonthlyBudget] = useState(0);

  // Configure Axios default headers when token changes
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  // Load saved token and session on startup
  useEffect(() => {
    const bootstrapAsync = async () => {
      try {
        const savedApiUrl = await AsyncStorage.getItem('api_url');
        if (savedApiUrl) {
          setApiUrl(savedApiUrl);
        }

        const savedMonthlyBudget = await AsyncStorage.getItem('monthly_budget');
        if (savedMonthlyBudget) {
          setMonthlyBudget(parseFloat(savedMonthlyBudget));
        }

        axios.defaults.headers.common['Authorization'] = `Bearer mock-developer-token`;

        try {
          const res = await axios.get(`${savedApiUrl || apiUrl || getDefaultApiUrl()}/auth/profile`);
          setUser(res.data.user);
        } catch (e) {
          console.log('Server offline or profile unreachable, using developer fallback profile.');
        }
      } catch (e) {
        console.log('Bootstrap session initialization error:', e.message);
      } finally {
        setLoading(false);
      }
    };

    bootstrapAsync();
  }, [apiUrl]);

  // Fetch Dashboard aggregate figures
  const fetchDashboardData = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/analytics/dashboard`);
      setDashboardData(res.data);
      return res.data;
    } catch (error) {
      console.log('Error fetching dashboard:', error.message);
    }
  }, [apiUrl]);

  // Fetch normalized product lists
  const fetchProducts = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/products`);
      setProducts(res.data.products);
      return res.data.products;
    } catch (error) {
      console.log('Error fetching products:', error.message);
    }
  }, [apiUrl]);

  // Fetch historical receipts
  const fetchReceipts = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/receipts`);
      setReceipts(res.data.receipts);
      return res.data.receipts;
    } catch (error) {
      console.log('Error fetching receipts:', error.message);
    }
  }, [apiUrl]);

  // Fetch people list with balances
  const fetchPeople = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/people`);
      setPeople(res.data.people);
      return res.data.people;
    } catch (error) {
      console.log('Error fetching people:', error.message);
    }
  }, [apiUrl]);

  // Fetch wallets list
  const fetchWallets = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/wallets`);
      setWallets(res.data.wallets);
      return res.data.wallets;
    } catch (error) {
      console.log('Error fetching wallets:', error.message);
    }
  }, [apiUrl]);

  // Create a new wallet
  const createWallet = useCallback(async (name, type, balance, color) => {
    try {
      const res = await axios.post(`${apiUrl}/wallets`, { name, type, balance, color });
      setWallets(prev => [...prev, res.data.wallet]);
      await fetchDashboardData();
      return { success: true, wallet: res.data.wallet };
    } catch (error) {
      const msg = error.response?.data?.error || 'فشل إنشاء المحفظة.';
      return { success: false, error: msg };
    }
  }, [apiUrl, fetchDashboardData]);

  // Delete a wallet
  const deleteWallet = useCallback(async (walletId) => {
    try {
      await axios.delete(`${apiUrl}/wallets/${walletId}`);
      setWallets(prev => prev.filter(w => w.id !== walletId));
      await fetchDashboardData();
      return { success: true };
    } catch (error) {
      const msg = error.response?.data?.error || 'فشل حذف المحفظة.';
      return { success: false, error: msg };
    }
  }, [apiUrl, fetchDashboardData]);

  // Create a manual wallet transaction
  const createWalletTransaction = useCallback(async (walletId, amount, description, date) => {
    try {
      const res = await axios.post(`${apiUrl}/wallets/${walletId}/transactions`, { amount, description, date });
      await fetchWallets();
      await fetchDashboardData();
      return { success: true, transaction: res.data.transaction, wallet: res.data.wallet };
    } catch (error) {
      const msg = error.response?.data?.error || 'فشل تسجيل العملية.';
      return { success: false, error: msg };
    }
  }, [apiUrl, fetchWallets, fetchDashboardData]);

  // Fetch unified wallet transactions ledger
  const fetchWalletTransactions = useCallback(async (walletId) => {
    try {
      const res = await axios.get(`${apiUrl}/wallets/${walletId}/transactions`);
      return { success: true, ledger: res.data.ledger, wallet: res.data.wallet, totalIn: res.data.totalIn, totalOut: res.data.totalOut };
    } catch (error) {
      const msg = error.response?.data?.error || 'فشل تحميل كشف حساب المحفظة.';
      return { success: false, error: msg };
    }
  }, [apiUrl]);

  // Update a manual wallet transaction
  const updateWalletTransaction = useCallback(async (walletId, txId, amount, description, date) => {
    try {
      const res = await axios.put(`${apiUrl}/wallets/${walletId}/transactions/${txId}`, { amount, description, date });
      await fetchWallets();
      await fetchDashboardData();
      return { success: true, transaction: res.data.transaction, wallet: res.data.wallet };
    } catch (error) {
      const msg = error.response?.data?.error || 'فشل تعديل العملية.';
      return { success: false, error: msg };
    }
  }, [apiUrl, fetchWallets, fetchDashboardData]);

  // Delete a manual wallet transaction
  const deleteWalletTransaction = useCallback(async (walletId, txId) => {
    try {
      await axios.delete(`${apiUrl}/wallets/${walletId}/transactions/${txId}`);
      await fetchWallets();
      await fetchDashboardData();
      return { success: true };
    } catch (error) {
      const msg = error.response?.data?.error || 'فشل حذف العملية.';
      return { success: false, error: msg };
    }
  }, [apiUrl, fetchWallets, fetchDashboardData]);

  // Create a new person
  const createPerson = useCallback(async (name, color, emoji) => {
    try {
      const res = await axios.post(`${apiUrl}/people`, { name, color, emoji });
      setPeople(prev => [...prev, res.data.person]);
      return { success: true, person: res.data.person };
    } catch (error) {
      const msg = error.response?.data?.error || 'فشل إنشاء الشخص.';
      return { success: false, error: msg };
    }
  }, [apiUrl]);

  // Delete a person
  const deletePerson = useCallback(async (personId) => {
    try {
      await axios.delete(`${apiUrl}/people/${personId}`);
      setPeople(prev => prev.filter(p => p.id !== personId));
      return { success: true };
    } catch (error) {
      return { success: false, error: 'فشل حذف الشخص.' };
    }
  }, [apiUrl]);

  // Record a debt settlement
  const createSettlement = useCallback(async (personId, amount, notes, walletId) => {
    try {
      const res = await axios.post(`${apiUrl}/settlements`, { personId, amount, notes, walletId });
      await fetchPeople();
      await fetchWallets();
      await fetchDashboardData();
      return { success: true, settlement: res.data.settlement };
    } catch (error) {
      const msg = error.response?.data?.error || 'فشل تسجيل التسوية.';
      return { success: false, error: msg };
    }
  }, [apiUrl, fetchPeople, fetchWallets, fetchDashboardData]);

  const login = async (email, password) => {
    try {
      const res = await axios.post(`${apiUrl}/auth/login`, { email, password });
      const { token: userToken, user: userData } = res.data;
      await AsyncStorage.setItem('user_token', userToken);
      setToken(userToken);
      setUser(userData);
      return { success: true };
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'حدث خطأ في الاتصال بالخادم.';
      return { success: false, error: errorMsg };
    }
  };

  const register = async (email, password, name) => {
    try {
      const res = await axios.post(`${apiUrl}/auth/register`, { email, password, name });
      const { token: userToken, user: userData } = res.data;
      await AsyncStorage.setItem('user_token', userToken);
      setToken(userToken);
      setUser(userData);
      return { success: true };
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'حدث خطأ في الاتصال بالخادم.';
      return { success: false, error: errorMsg };
    }
  };

  const loginByName = async (name) => {
    try {
      const res = await axios.post(`${apiUrl}/auth/simple-login`, { name });
      const { token: userToken, user: userData } = res.data;
      await AsyncStorage.setItem('user_token', userToken);
      setToken(userToken);
      setUser(userData);
      return { success: true };
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'حدث خطأ في الاتصال بالخادم.';
      return { success: false, error: errorMsg };
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('user_token');
    setToken(null);
    setUser(null);
    setDashboardData(null);
    setProducts([]);
    setReceipts([]);
    setPeople([]);
  };

  const updateBaseCurrencySetting = async (newCurrency) => {
    try {
      await axios.put(`${apiUrl}/currency/base`, { currency: newCurrency });
      setUser(prev => ({ ...prev, baseCurrency: newCurrency }));
      await fetchDashboardData();
      return { success: true };
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'فشل تحديث العملة.';
      return { success: false, error: errorMsg };
    }
  };

  const updateCustomApiUrl = async (url) => {
    try {
      await AsyncStorage.setItem('api_url', url);
      setApiUrl(url);
      return { success: true };
    } catch (e) {
      return { success: false };
    }
  };

  const updateMonthlyBudgetSetting = async (amount) => {
    try {
      const parsedAmount = parseFloat(amount) || 0;
      await AsyncStorage.setItem('monthly_budget', parsedAmount.toString());
      setMonthlyBudget(parsedAmount);
      return { success: true };
    } catch (e) {
      return { success: false, error: 'فشل حفظ الميزانية.' };
    }
  };

  return (
    <AppContext.Provider
      value={{
        token,
        user,
        loading,
        apiUrl,
        dashboardData,
        products,
        receipts,
        people,
        wallets,
        login,
        loginByName,
        register,
        logout,
        fetchDashboardData,
        fetchProducts,
        fetchReceipts,
        fetchPeople,
        fetchWallets,
        createWallet,
        deleteWallet,
        createWalletTransaction,
        updateWalletTransaction,
        deleteWalletTransaction,
        fetchWalletTransactions,
        createPerson,
        deletePerson,
        createSettlement,
        updateBaseCurrencySetting,
        updateCustomApiUrl,
        monthlyBudget,
        updateMonthlyBudgetSetting
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
