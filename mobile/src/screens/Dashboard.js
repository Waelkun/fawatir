import React, { useContext, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Platform, Dimensions, Modal, TextInput, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppContext } from '../context/AppContext';
import { COLORS } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop, Circle, Line, Rect, Text as SvgText } from 'react-native-svg';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

const Dashboard = ({ navigation }) => {
  const { 
    user, 
    apiUrl, 
    dashboardData, 
    fetchDashboardData, 
    logout,
    monthlyBudget,
    wallets,
    fetchWallets,
    createWalletTransaction,
    updateWalletTransaction,
    deleteWalletTransaction,
    fetchWalletTransactions,
    people,
    fetchPeople
  } = useContext(AppContext);
  
  const [refreshing, setRefreshing] = useState(false);
  const [trends, setTrends] = useState([]);
  const [loadingTrends, setLoadingTrends] = useState(true);
  const [spendingMode, setSpendingMode] = useState('personal'); // 'personal' or 'shared'

  // Filter & Custom range picker state
  const [chartFilter, setChartFilter] = useState('week'); // 'week', 'month', 'custom'
  const [startDateRange, setStartDateRange] = useState(null);
  const [endDateRange, setEndDateRange] = useState(null);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [tempStartDate, setTempStartDate] = useState(null);
  const [tempEndDate, setTempEndDate] = useState(null);

  // New Wallet Details Modal State
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletLedger, setWalletLedger] = useState([]);
  const [walletTotalIn, setWalletTotalIn] = useState(0);
  const [walletTotalOut, setWalletTotalOut] = useState(0);
  const [loadingLedger, setLoadingLedger] = useState(false);
  
  // Wallet Adjust Form State
  const [showAdjustForm, setShowAdjustForm] = useState(false);
  const [adjustType, setAdjustType] = useState('DEPOSIT'); // 'DEPOSIT' | 'WITHDRAW'
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustDesc, setAdjustDesc] = useState('');
  const [adjustingWallet, setAdjustingWallet] = useState(false);

  // Edit Transaction Modal State
  const [editTx, setEditTx] = useState(null); // the transaction being edited
  const [editTxType, setEditTxType] = useState('DEPOSIT');
  const [editTxAmount, setEditTxAmount] = useState('');
  const [editTxDesc, setEditTxDesc] = useState('');
  const [editTxDate, setEditTxDate] = useState('');
  const [savingEditTx, setSavingEditTx] = useState(false);
  const [deletingTxId, setDeletingTxId] = useState(null);

  // Unified Transactions Ledger filter state
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState('all'); // 'all', 'expenses', 'deposits'
  const [ledgerPersonFilter, setLedgerPersonFilter] = useState('all'); // 'all', 'user', or personId (number)

  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [availableBalance, setAvailableBalance] = useState('0');
  const [inputBalance, setInputBalance] = useState('0');
  const [settlingDebtId, setSettlingDebtId] = useState(null);

  useEffect(() => {
    const loadSavedBalance = async () => {
      try {
        const saved = await AsyncStorage.getItem('available_balance');
        if (saved !== null) {
          setAvailableBalance(saved);
          setInputBalance(saved);
        }
      } catch (e) {
        console.log('Failed to load saved balance:', e);
      }
    };
    loadSavedBalance();
  }, []);

  const loadData = useCallback(async (filterType = chartFilter, start = startDateRange, end = endDateRange, mode = spendingMode) => {
    setLoadingTrends(true);
    await fetchDashboardData();
    await fetchWallets();
    await fetchPeople();
    try {
      let url = `${apiUrl}/analytics/trends?mode=${mode}`;
      if (filterType === 'week') {
        url += `&days=7`;
      } else if (filterType === 'month') {
        url += `&days=30`;
      } else if (filterType === 'custom' && start && end) {
        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];
        url += `&startDate=${startStr}&endDate=${endStr}`;
      } else {
        url += `&days=7`;
      }
      
      const res = await axios.get(url);
      setTrends(res.data.chartData);
    } catch (e) {
      console.log('Failed to fetch spending trends:', e.message);
    } finally {
      setLoadingTrends(false);
    }
  }, [apiUrl, fetchDashboardData, fetchWallets, spendingMode]);

  useEffect(() => {
    loadData(chartFilter, startDateRange, endDateRange, spendingMode);
  }, [chartFilter, startDateRange, endDateRange, spendingMode, loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(chartFilter, startDateRange, endDateRange, spendingMode);
    setRefreshing(false);
  }, [chartFilter, startDateRange, endDateRange, spendingMode, loadData]);

  // Calendar Helpers
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysCount = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push({ day: null, date: null });
    }
    for (let i = 1; i <= daysCount; i++) {
      days.push({ day: i, date: new Date(year, month, i) });
    }
    return days;
  };

  const handleDayPress = (dayDate) => {
    if (!dayDate) return;
    if (!tempStartDate || (tempStartDate && tempEndDate)) {
      setTempStartDate(dayDate);
      setTempEndDate(null);
    } else if (tempStartDate && !tempEndDate) {
      if (dayDate < tempStartDate) {
        setTempStartDate(dayDate);
      } else {
        setTempEndDate(dayDate);
      }
    }
  };

  const handleApplyCustomRange = () => {
    if (!tempStartDate || !tempEndDate) {
      alert('يرجى اختيار تاريخ البداية والنهاية أولاً.');
      return;
    }
    setChartFilter('custom');
    setStartDateRange(tempStartDate);
    setEndDateRange(tempEndDate);
    setShowCalendarModal(false);
  };

  const formatShortDate = (date) => {
    if (!date) return '';
    try {
      return new Intl.DateTimeFormat('ar-u-ca-gregory', { day: 'numeric', month: 'short' }).format(date);
    } catch (e) {
      return date.toISOString().split('T')[0];
    }
  };

  const loadWalletStatement = async (walletId) => {
    setLoadingLedger(true);
    const res = await fetchWalletTransactions(walletId);
    setLoadingLedger(false);
    if (res.success) {
      setWalletLedger(res.ledger);
      setSelectedWallet(res.wallet);
      setWalletTotalIn(res.totalIn || 0);
      setWalletTotalOut(res.totalOut || 0);
    } else {
      alert(res.error);
    }
  };

  const handleOpenWalletModal = (wallet) => {
    setSelectedWallet(wallet);
    setWalletLedger([]);
    setShowWalletModal(true);
    setShowAdjustForm(false);
    setAdjustAmount('');
    setAdjustDesc('');
    loadWalletStatement(wallet.id);
  };

  const handleWalletAdjust = async () => {
    const rawAmount = parseFloat(adjustAmount);
    if (!rawAmount || rawAmount <= 0) {
      alert('يرجى إدخال مبلغ صحيح.');
      return;
    }
    if (!adjustDesc.trim()) {
      alert('يرجى إدخال وصف العملية (مثال: راتب، إيداع...).');
      return;
    }

    setAdjustingWallet(true);
    // Deposit is positive, withdraw is negative
    const signedAmount = adjustType === 'DEPOSIT' ? rawAmount : -rawAmount;
    const res = await createWalletTransaction(selectedWallet.id, signedAmount, adjustDesc.trim());
    setAdjustingWallet(false);

    if (res.success) {
      setAdjustAmount('');
      setAdjustDesc('');
      setShowAdjustForm(false);
      // Reload statement and refresh Dashboard Data
      await loadWalletStatement(selectedWallet.id);
      await fetchDashboardData();
    } else {
      alert(res.error);
    }
  };

  // Open edit modal for a MANUAL transaction
  const handleOpenEditTx = (item) => {
    // item.id is like "manual-5" — extract real DB id
    const txId = parseInt(item.id.replace('manual-', ''));
    const absAmount = Math.abs(item.amount);
    setEditTx({ ...item, dbId: txId });
    setEditTxType(item.amount >= 0 ? 'DEPOSIT' : 'WITHDRAW');
    setEditTxAmount(absAmount.toFixed(2));
    setEditTxDesc(item.description);
    setEditTxDate(item.date ? new Date(item.date).toISOString().split('T')[0] : '');
  };

  // Save edited transaction
  const handleSaveEditTx = async () => {
    const rawAmount = parseFloat(editTxAmount);
    if (!rawAmount || rawAmount <= 0) {
      alert('يرجى إدخال مبلغ صحيح.');
      return;
    }
    if (!editTxDesc.trim()) {
      alert('يرجى إدخال وصف.');
      return;
    }

    setSavingEditTx(true);
    const signedAmount = editTxType === 'DEPOSIT' ? rawAmount : -rawAmount;
    const res = await updateWalletTransaction(
      selectedWallet.id,
      editTx.dbId,
      signedAmount,
      editTxDesc.trim(),
      editTxDate || undefined
    );
    setSavingEditTx(false);

    if (res.success) {
      setEditTx(null);
      await loadWalletStatement(selectedWallet.id);
    } else {
      alert(res.error);
    }
  };

  // Delete a manual transaction
  const handleDeleteTx = async (item) => {
    const txId = parseInt(item.id.replace('manual-', ''));
    setDeletingTxId(txId);
    const res = await deleteWalletTransaction(selectedWallet.id, txId);
    setDeletingTxId(null);

    if (res.success) {
      await loadWalletStatement(selectedWallet.id);
    } else {
      alert(res.error);
    }
  };

  const formatAmountEnglish = (amount) => {
    return `${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${baseCurrency}`;
  };

  const formatDateEnglish = (dateStr) => {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  };

  // Custom SVG Line Chart Calculation
  // Custom SVG Line Chart Calculation
  const renderChart = () => {
    if (loadingTrends) {
      return (
        <View style={styles.chartPlaceholder}>
          <Text style={styles.chartPlaceholderText}>جاري تحميل التحليلات...</Text>
        </View>
      );
    }

    if (trends.length === 0) {
      return (
        <View style={styles.chartPlaceholder}>
          <Text style={styles.chartPlaceholderText}>لا توجد بيانات مصاريف للفترة المحددة.</Text>
        </View>
      );
    }

    const expensesList = trends.map(t => t.amount);
    const maxRaw = Math.max(...expensesList, 10);
    const maxVal = maxRaw * 1.15; // 15% padding at top
    const minVal = 0;
    const valRange = maxVal || 10;

    const chartHeight = 150;
    const chartWidth = width - 72;
    const paddingLeft = 32;
    const plotWidth = chartWidth - paddingLeft;
    const plotHeight = chartHeight - 20;

    const getY = (val) => {
      const scaleHeight = plotHeight - 30;
      return (plotHeight - 10) - (val / valRange) * scaleHeight;
    };

    const yZero = getY(0);

    const colSpacing = plotWidth / trends.length;

    // Days of the week in Arabic
    const daysArabic = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];
    const getDayLabel = (dateStr) => {
      try {
        const d = new Date(dateStr);
        return daysArabic[d.getUTCDay()];
      } catch (e) {
        return '';
      }
    };

    return (
      <View style={styles.chartContainer}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>
            {chartFilter === 'week' ? 'تحليل الإنفاق الأسبوعي' :
             chartFilter === 'month' ? 'تحليل الإنفاق الشهري' :
             `تحليل الفترة (${formatShortDate(startDateRange)} - ${formatShortDate(endDateRange)})`
            }
          </Text>
          <Text style={styles.chartCurrency}>({dashboardData?.baseCurrency || 'SAR'})</Text>
        </View>
        
        <View style={{ height: chartHeight, width: chartWidth }}>
          <Svg height={chartHeight} width={chartWidth}>
            {/* Grid Line at Zero baseline */}
            <Line 
              x1={paddingLeft} 
              y1={yZero} 
              x2={chartWidth} 
              y2={yZero} 
              stroke="rgba(255,255,255,0.12)" 
              strokeWidth="1" 
            />

            {/* Grid Line at Max value */}
            <Line 
              x1={paddingLeft} 
              y1={getY(maxRaw)} 
              x2={chartWidth} 
              y2={getY(maxRaw)} 
              stroke="rgba(255,255,255,0.03)" 
              strokeWidth="1" 
              strokeDasharray="4,4"
            />

            {/* Y Axis Labels */}
            <SvgText
              x={paddingLeft - 8}
              y={getY(maxRaw) + 3}
              fill={COLORS.textSecondary}
              fontSize="9"
              fontWeight="600"
              textAnchor="end"
            >
              {Math.round(maxRaw)}
            </SvgText>

            <SvgText
              x={paddingLeft - 8}
              y={yZero + 3}
              fill={COLORS.textSecondary}
              fontSize="9"
              fontWeight="600"
              textAnchor="end"
            >
              0
            </SvgText>

            {/* Expenses Columns */}
            {trends.map((item, idx) => {
              const xGroup = paddingLeft + (idx * colSpacing);
              const xCenter = xGroup + (colSpacing / 2);
              
              const barWidth = Math.max(3, Math.min(14, (plotWidth / trends.length) - 4));
              const xBar = xCenter - (barWidth / 2);
              
              const yExpense = getY(item.amount);
              const hExpense = yZero - yExpense;

              return (
                <Rect
                  key={idx}
                  x={xBar}
                  y={yExpense}
                  width={barWidth}
                  height={Math.max(hExpense, 2)} // ensure at least a sliver is visible if there is any spend
                  fill={COLORS.secondary}
                  rx="3"
                />
              );
            })}

            {/* X Axis Bottom Labels */}
            {trends.map((item, idx) => {
              const xGroup = paddingLeft + (idx * colSpacing);
              const xCenter = xGroup + (colSpacing / 2);

              const skipRatio = Math.ceil(trends.length / 8);
              if (idx % skipRatio !== 0 && idx !== trends.length - 1) return null;

              return (
                <SvgText
                  key={idx}
                  x={xCenter}
                  y={chartHeight - 4}
                  fill={COLORS.textSecondary}
                  fontSize="9"
                  fontWeight="600"
                  textAnchor="middle"
                >
                  {getDayLabel(item.date)}
                </SvgText>
              );
            })}
          </Svg>
        </View>
      </View>
    );
  };




  const stats = dashboardData?.stats || { totalBalance: 0, monthlyExpenses: 0, cashOutflow: 0, pendingReceivables: 0, pendingPayables: 0 };
  const baseCurrency = dashboardData?.baseCurrency || 'SAR';

  const getFilteredTransactions = () => {
    let txs = dashboardData?.allTransactions || [];

    // Filter by Person
    if (ledgerPersonFilter !== 'all') {
      if (ledgerPersonFilter === 'user') {
        txs = txs.filter(t => {
          if (t.type === 'RECEIPT') {
            return t.shares?.user > 0;
          } else if (t.type === 'DEPOSIT' || t.type === 'WITHDRAW') {
            return true;
          } else if (t.type === 'SETTLEMENT') {
            return t.shares?.user > 0;
          }
          return false;
        });
      } else {
        const targetPersonId = ledgerPersonFilter;
        txs = txs.filter(t => {
          if (t.type === 'RECEIPT') {
            return t.shares?.[targetPersonId] > 0;
          } else if (t.type === 'SETTLEMENT') {
            return t.personId === targetPersonId;
          }
          return false;
        });
      }
    }

    // Filter by Type
    if (ledgerTypeFilter !== 'all') {
      if (ledgerTypeFilter === 'expenses') {
        txs = txs.filter(t => {
          if (t.type === 'RECEIPT') return true;
          if (t.type === 'WITHDRAW') return true;
          if (t.type === 'SETTLEMENT') {
            if (ledgerPersonFilter === 'all' || ledgerPersonFilter === 'user') {
              return t.amount < 0;
            } else {
              return t.amount > 0;
            }
          }
          return false;
        });
      } else if (ledgerTypeFilter === 'deposits') {
        txs = txs.filter(t => {
          if (t.type === 'DEPOSIT') return true;
          if (t.type === 'SETTLEMENT') {
            if (ledgerPersonFilter === 'all' || ledgerPersonFilter === 'user') {
              return t.amount > 0;
            } else {
              return t.amount < 0;
            }
          }
          return false;
        });
      }
    }

    return txs;
  };

  const filteredTxs = getFilteredTransactions();

  // Compute Outflow & Inflow totals for the active view
  let viewOutflow = 0;
  let viewInflow = 0;

  filteredTxs.forEach(t => {
    let txAmt = t.amount;
    
    if (ledgerPersonFilter !== 'all' && ledgerPersonFilter !== 'user') {
      const targetPersonId = ledgerPersonFilter;
      if (t.type === 'RECEIPT') {
        txAmt = -(t.shares?.[targetPersonId] || 0);
      } else if (t.type === 'SETTLEMENT') {
        txAmt = -t.amount;
      } else {
        txAmt = 0;
      }
    } else if (ledgerPersonFilter === 'user') {
      if (t.type === 'RECEIPT') {
        txAmt = -(t.shares?.user || 0);
      } else if (t.type === 'SETTLEMENT') {
        txAmt = t.amount;
      }
    }

    if (txAmt < 0) {
      viewOutflow += Math.abs(txAmt);
    } else {
      viewInflow += txAmt;
    }
  });

  return (
    <View style={styles.container}>
      {/* Background Gradient */}
      <LinearGradient
        colors={[COLORS.background, '#10111A', COLORS.background]}
        style={styles.gradient}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
        >
          {/* Top Bar Header */}
          <View style={styles.header}>
            <View style={styles.profileRow}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={20} color={COLORS.primary} />
              </View>
              <View style={styles.nameContainer}>
                <Text style={styles.greeting}>أهلاً، {user?.name || 'أليكس'}</Text>
                <Text style={styles.membership}>عضو متميز</Text>
              </View>
            </View>
            <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
              <Ionicons name="log-out-outline" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Balance / Budget Glass Card */}
          <TouchableOpacity 
            style={styles.balanceCard}
            onPress={() => setShowBalanceModal(true)}
          >
            <LinearGradient
              colors={['rgba(21, 24, 33, 0.9)', 'rgba(30, 34, 45, 0.4)']}
              style={styles.balanceCardGrad}
            >
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={styles.balanceLabel}>إجمالي الرصيد المتوفر (اضغط للمعاينة 📊)</Text>
              </View>
              <Text style={styles.balanceVal}>
                {(stats.totalBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <Text style={styles.balanceCur}> {baseCurrency}</Text>
              </Text>

              <View style={[styles.statsRow, { marginTop: 16 }]}>
                <View style={styles.statCol}>
                  <Text style={styles.statLabel}>مصاريفي الشخصية</Text>
                  <View style={styles.statValRow}>
                    <Ionicons name="person-outline" size={14} color={COLORS.primary} />
                    <Text style={[styles.statVal, { color: COLORS.primary }]}>
                      {(stats.monthlyExpenses || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {baseCurrency}
                    </Text>
                  </View>
                </View>
                <View style={styles.statCol}>
                  <Text style={styles.statLabel}>التدفق الخارج</Text>
                  <View style={styles.statValRow}>
                    <Ionicons name="swap-horizontal" size={14} color="#FF9800" />
                    <Text style={[styles.statVal, { color: '#FF9800' }]}>
                      {(stats.cashOutflow || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {baseCurrency}
                    </Text>
                  </View>
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* Wallets Horizontal List */}
          {wallets && wallets.length > 0 && (
            <View style={{ marginBottom: 24 }}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="card-outline" size={16} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>محافظي المالية</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 8 }}>
                {wallets.map(w => (
                  <TouchableOpacity 
                    key={w.id} 
                    style={[styles.walletMiniCard, { borderLeftColor: w.color }]}
                    onPress={() => handleOpenWalletModal(w)}
                  >
                    <Text style={styles.walletMiniName}>{w.name}</Text>
                    <Text style={styles.walletMiniBalance}>
                      {w.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} {baseCurrency}
                    </Text>
                    <Text style={styles.walletMiniType}>
                      {w.type === 'BANK' ? '🏦 بنك' : w.type === 'VISA' ? '💳 بطاقة' : '💵 نقد'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Advanced Accounting Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statsGridCard}>
              <Ionicons name="wallet-outline" size={18} color={COLORS.primary} />
              <Text style={styles.statsGridLabel}>الرصيد الكلي</Text>
              <Text style={[styles.statsGridValue, { color: COLORS.text }]}>
                {(stats.totalBalance || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })} {baseCurrency}
              </Text>
            </View>
            <View style={styles.statsGridCard}>
              <Ionicons name="swap-horizontal" size={18} color="#FF9800" />
              <Text style={styles.statsGridLabel}>التدفق الخارج</Text>
              <Text style={[styles.statsGridValue, { color: '#FF9800' }]}>
                {(stats.cashOutflow || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })} {baseCurrency}
              </Text>
            </View>
            <View style={styles.statsGridCard}>
              <Ionicons name="arrow-down-circle-outline" size={18} color="#4CAF50" />
              <Text style={styles.statsGridLabel}>أموال مستحقة لي</Text>
              <Text style={[styles.statsGridValue, { color: '#4CAF50' }]}>
                {(stats.pendingReceivables || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })} {baseCurrency}
              </Text>
            </View>
            <View style={styles.statsGridCard}>
              <Ionicons name="arrow-up-circle-outline" size={18} color="#F44336" />
              <Text style={styles.statsGridLabel}>ديون مستحقة علي</Text>
              <Text style={[styles.statsGridValue, { color: '#F44336' }]}>
                {(stats.pendingPayables || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })} {baseCurrency}
              </Text>
            </View>
          </View>

          {/* Spending Mode Selector */}
          <View style={styles.modeSelector}>
            <TouchableOpacity 
              style={[styles.modeBtn, spendingMode === 'personal' && styles.modeBtnActive]} 
              onPress={() => setSpendingMode('personal')}
            >
              <Text style={[styles.modeBtnText, spendingMode === 'personal' && styles.modeBtnTextActive]}>تحليل حصتي فقط</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.modeBtn, spendingMode === 'shared' && styles.modeBtnActive]} 
              onPress={() => setSpendingMode('shared')}
            >
              <Text style={[styles.modeBtnText, spendingMode === 'shared' && styles.modeBtnTextActive]}>تحليل الكل مشترك</Text>
            </TouchableOpacity>
          </View>

          {/* Chart Filter Selector */}
          <View style={styles.filterWrapper}>
            <TouchableOpacity 
              style={[styles.filterBtn, chartFilter === 'week' ? styles.activeFilterBtn : null]}
              onPress={() => setChartFilter('week')}
            >
              <Text style={[styles.filterBtnText, chartFilter === 'week' ? styles.activeFilterBtnText : null]}>أسبوع</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.filterBtn, chartFilter === 'month' ? styles.activeFilterBtn : null]}
              onPress={() => setChartFilter('month')}
            >
              <Text style={[styles.filterBtnText, chartFilter === 'month' ? styles.activeFilterBtnText : null]}>شهر</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.filterBtn, chartFilter === 'custom' ? styles.activeFilterBtn : null]}
              onPress={() => {
                setShowCalendarModal(true);
              }}
            >
              <Ionicons name="calendar-outline" size={14} color={chartFilter === 'custom' ? COLORS.background : COLORS.textSecondary} style={{ marginLeft: 4 }} />
              <Text style={[styles.filterBtnText, chartFilter === 'custom' ? styles.activeFilterBtnText : null]}>
                {chartFilter === 'custom' && startDateRange && endDateRange 
                  ? `${formatShortDate(startDateRange)} - ${formatShortDate(endDateRange)}` 
                  : 'مخصص'
                }
              </Text>
            </TouchableOpacity>
          </View>

          {/* Chart */}
          {renderChart()}

          {/* Custom Calendar Picker Modal */}
          <Modal
            visible={showCalendarModal}
            transparent={true}
            animationType="fade"
          >
            <View style={styles.calendarModalOverlay}>
              <View style={styles.calendarModalContent}>
                {/* Header */}
                <View style={styles.calendarHeader}>
                  <TouchableOpacity onPress={() => setShowCalendarModal(false)}>
                    <Ionicons name="close" size={24} color={COLORS.white} />
                  </TouchableOpacity>
                  <Text style={styles.calendarTitle}>اختر الفترة الزمنية</Text>
                  <View style={{ width: 24 }} />
                </View>

                {/* Month Selector bar */}
                <View style={styles.monthSelectorBar}>
                  <TouchableOpacity onPress={() => {
                    const prev = new Date(currentMonth);
                    prev.setMonth(prev.getMonth() - 1);
                    setCurrentMonth(prev);
                  }}>
                    <Ionicons name="chevron-forward" size={22} color={COLORS.white} />
                  </TouchableOpacity>
                  <Text style={styles.monthLabel}>
                    {new Intl.DateTimeFormat('ar-u-ca-gregory', { month: 'long', year: 'numeric' }).format(currentMonth)}
                  </Text>
                  <TouchableOpacity onPress={() => {
                    const next = new Date(currentMonth);
                    next.setMonth(next.getMonth() + 1);
                    setCurrentMonth(next);
                  }}>
                    <Ionicons name="chevron-back" size={22} color={COLORS.white} />
                  </TouchableOpacity>
                </View>

                {/* Weekdays Labels */}
                <View style={styles.weekdaysRow}>
                  {['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'].map((day, idx) => (
                    <Text key={idx} style={styles.weekdayLabel}>{day}</Text>
                  ))}
                </View>

                {/* Days Grid */}
                <View style={styles.daysGrid}>
                  {getDaysInMonth(currentMonth).map((item, idx) => {
                    const isSelected = item.date && (
                      (tempStartDate && item.date.toDateString() === tempStartDate.toDateString()) ||
                      (tempEndDate && item.date.toDateString() === tempEndDate.toDateString())
                    );
                    
                    const isInRange = item.date && tempStartDate && tempEndDate && (
                      item.date > tempStartDate && item.date < tempEndDate
                    );

                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[
                          styles.dayCell,
                          isSelected ? styles.selectedDayCell : null,
                          isInRange ? styles.rangeDayCell : null,
                          !item.day ? styles.emptyDayCell : null
                        ]}
                        onPress={() => item.date && handleDayPress(item.date)}
                        disabled={!item.day}
                      >
                        <Text style={[
                          styles.dayCellText,
                          isSelected ? styles.selectedDayCellText : null,
                          isInRange ? styles.rangeDayCellText : null
                        ]}>
                          {item.day || ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Selection Summary */}
                <View style={styles.selectionSummary}>
                  <Text style={styles.summaryText}>
                    {tempStartDate ? `من: ${formatShortDate(tempStartDate)}` : 'حدد تاريخ البداية'}
                  </Text>
                  <Text style={styles.summaryText}>
                    {tempEndDate ? `إلى: ${formatShortDate(tempEndDate)}` : 'حدد تاريخ النهاية'}
                  </Text>
                </View>

                {/* Apply button */}
                <TouchableOpacity 
                  style={styles.applyRangeBtn}
                  onPress={handleApplyCustomRange}
                >
                  <LinearGradient
                    colors={[COLORS.primary, COLORS.secondary]}
                    style={styles.applyRangeBtnGrad}
                  >
                    <Text style={styles.applyRangeBtnText}>تطبيق الفترة الزمنية</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {/* WALLET DETAILS & STATEMENT Modal */}
          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <Modal visible={showWalletModal} transparent animationType="slide">
            <View style={styles.walletModalOverlay}>
              <View style={[styles.walletModalContent, { maxHeight: '90%' }]}>
                {/* Header */}
                <View style={styles.walletModalHeader}>
                  <TouchableOpacity onPress={() => setShowWalletModal(false)}>
                    <Ionicons name="close" size={24} color={COLORS.white} />
                  </TouchableOpacity>
                  <Text style={styles.walletModalTitle}>تعديل وإدارة المحفظة</Text>
                  <View style={{ width: 24 }} />
                </View>

                {selectedWallet && (
                  editTx ? (
                    <View style={styles.adjustFormCard}>
                      <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text style={[styles.adjustFormTitle, { marginBottom: 0 }]}>تعديل حركة رصيد مخصصة</Text>
                        <TouchableOpacity onPress={() => setEditTx(null)}>
                          <Ionicons name="arrow-back-outline" size={20} color={COLORS.primary} />
                        </TouchableOpacity>
                      </View>
                      
                      {/* Edit Type */}
                      <Text style={styles.adjustLabel}>نوع العملية</Text>
                      <View style={styles.adjustTypeRow}>
                        <TouchableOpacity 
                          style={[styles.adjustTypeBtn, editTxType === 'WITHDRAW' && styles.adjustTypeBtnActiveWithdraw]}
                          onPress={() => setEditTxType('WITHDRAW')}
                        >
                          <Text style={[styles.adjustTypeBtnText, editTxType === 'WITHDRAW' && styles.adjustTypeBtnTextActive]}>سحب / مصاريف (-)</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[styles.adjustTypeBtn, editTxType === 'DEPOSIT' && styles.adjustTypeBtnActiveDeposit]}
                          onPress={() => setEditTxType('DEPOSIT')}
                        >
                          <Text style={[styles.adjustTypeBtnText, editTxType === 'DEPOSIT' && styles.adjustTypeBtnTextActive]}>إيداع / إيراد (+)</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Edit Amount */}
                      <Text style={styles.adjustLabel}>المبلغ</Text>
                      <View style={styles.adjustInputRow}>
                        <Text style={styles.adjustCurrency}>{baseCurrency}</Text>
                        <TextInput
                          style={styles.adjustTextInput}
                          placeholder="0.00"
                          placeholderTextColor="rgba(255,255,255,0.25)"
                          value={editTxAmount}
                          onChangeText={setEditTxAmount}
                          keyboardType="numeric"
                          textAlign="right"
                        />
                      </View>

                      {/* Edit Description */}
                      <Text style={styles.adjustLabel}>الوصف والبيان</Text>
                      <View style={styles.adjustInputRow}>
                        <TextInput
                          style={[styles.adjustTextInput, { flex: 1 }]}
                          placeholder="مثال: تعديل وصف..."
                          placeholderTextColor="rgba(255,255,255,0.25)"
                          value={editTxDesc}
                          onChangeText={setEditTxDesc}
                          textAlign="right"
                        />
                      </View>

                      {/* Save Button */}
                      <TouchableOpacity 
                        style={styles.adjustConfirmBtn} 
                        onPress={handleSaveEditTx}
                        disabled={savingEditTx}
                      >
                        <LinearGradient colors={['#4CAF50', '#2E7D32']} style={styles.adjustConfirmBtnGrad}>
                          {savingEditTx ? (
                            <ActivityIndicator color="#fff" />
                          ) : (
                            <>
                              <Ionicons name="checkmark-circle" size={16} color="#fff" />
                              <Text style={styles.adjustConfirmBtnText}>حفظ التعديلات</Text>
                            </>
                          )}
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }} nestedScrollEnabled>
                      {/* Wallet Info Card */}
                      <View style={[styles.walletHeroCard, { borderLeftColor: selectedWallet.color }]}>
                        <Text style={styles.walletHeroName}>{selectedWallet.name}</Text>
                        <Text style={styles.walletHeroBalance}>
                          {formatAmountEnglish(selectedWallet.balance)}
                        </Text>
                        <Text style={styles.walletHeroType}>
                          {selectedWallet.type === 'BANK' ? '🏦 حساب بنكي' : selectedWallet.type === 'VISA' ? '💳 بطاقة فيزا' : '💵 نقد'}
                        </Text>
                        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' }}>
                          <View style={{ alignItems: 'center' }}>
                            <Text style={{ color: COLORS.textSecondary, fontSize: 11, marginBottom: 4 }}>إجمالي الدخل (+)</Text>
                            <Text style={{ color: '#4CAF50', fontSize: 14, fontWeight: '700' }}>{formatAmountEnglish(walletTotalIn)}</Text>
                          </View>
                          <View style={{ alignItems: 'center' }}>
                            <Text style={{ color: COLORS.textSecondary, fontSize: 11, marginBottom: 4 }}>إجمالي الصرف (-)</Text>
                            <Text style={{ color: '#F44336', fontSize: 14, fontWeight: '700' }}>{formatAmountEnglish(walletTotalOut)}</Text>
                          </View>
                        </View>
                      </View>

                      {/* Toggle Adjustment Form Button */}
                      <TouchableOpacity 
                        style={styles.toggleAdjustBtn} 
                        onPress={() => setShowAdjustForm(!showAdjustForm)}
                      >
                        <LinearGradient colors={['#7209B7', '#3A0CA3']} style={styles.toggleAdjustBtnGrad}>
                          <Ionicons name={showAdjustForm ? "chevron-up" : "add-circle"} size={16} color="#fff" />
                          <Text style={styles.toggleAdjustBtnText}>تسجيل عملية إيداع / سحب جديدة</Text>
                        </LinearGradient>
                      </TouchableOpacity>

                      {/* Adjust Form */}
                      {showAdjustForm && (
                        <View style={styles.adjustFormCard}>
                          <Text style={styles.adjustFormTitle}>تسجيل حركة رصيد مخصصة</Text>
                          
                          {/* Adjust Type */}
                          <Text style={styles.adjustLabel}>نوع العملية</Text>
                          <View style={styles.adjustTypeRow}>
                            <TouchableOpacity 
                              style={[styles.adjustTypeBtn, adjustType === 'WITHDRAW' && styles.adjustTypeBtnActiveWithdraw]}
                              onPress={() => setAdjustType('WITHDRAW')}
                            >
                              <Text style={[styles.adjustTypeBtnText, adjustType === 'WITHDRAW' && styles.adjustTypeBtnTextActive]}>سحب / مصاريف (-)</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                              style={[styles.adjustTypeBtn, adjustType === 'DEPOSIT' && styles.adjustTypeBtnActiveDeposit]}
                              onPress={() => setAdjustType('DEPOSIT')}
                            >
                              <Text style={[styles.adjustTypeBtnText, adjustType === 'DEPOSIT' && styles.adjustTypeBtnTextActive]}>إيداع / إيراد (+)</Text>
                            </TouchableOpacity>
                          </View>

                          {/* Amount */}
                          <Text style={styles.adjustLabel}>المبلغ</Text>
                          <View style={styles.adjustInputRow}>
                            <Text style={styles.adjustCurrency}>{baseCurrency}</Text>
                            <TextInput
                              style={styles.adjustTextInput}
                              placeholder="0.00"
                              placeholderTextColor="rgba(255,255,255,0.25)"
                              value={adjustAmount}
                              onChangeText={setAdjustAmount}
                              keyboardType="numeric"
                              textAlign="right"
                            />
                          </View>

                          {/* Description */}
                          <Text style={styles.adjustLabel}>الوصف والبيان</Text>
                          <View style={styles.adjustInputRow}>
                            <TextInput
                              style={[styles.adjustTextInput, { flex: 1 }]}
                              placeholder="مثال: زيادة 2000 ليرة، راتب شهر مايو..."
                              placeholderTextColor="rgba(255,255,255,0.25)"
                              value={adjustDesc}
                              onChangeText={setAdjustDesc}
                              textAlign="right"
                            />
                          </View>

                          {/* Confirm Button */}
                          <TouchableOpacity 
                            style={styles.adjustConfirmBtn} 
                            onPress={handleWalletAdjust}
                            disabled={adjustingWallet}
                          >
                            <LinearGradient colors={['#4CAF50', '#2E7D32']} style={styles.adjustConfirmBtnGrad}>
                              {adjustingWallet ? (
                                <ActivityIndicator color="#fff" />
                              ) : (
                                <>
                                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                                  <Text style={styles.adjustConfirmBtnText}>تأكيد وحفظ العملية</Text>
                                </>
                              )}
                            </LinearGradient>
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* Unified Ledger Statement */}
                      <Text style={styles.ledgerSectionTitle}>كشف حركة الحساب (Ledger Statement)</Text>
                      {loadingLedger ? (
                        <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 20 }} />
                      ) : walletLedger.length > 0 ? (
                        <View style={styles.ledgerWrapper}>
                          {walletLedger.map((item) => {
                            const isPositive = item.amount > 0;
                            return (
                              <View key={item.id} style={styles.ledgerItemRow}>
                                <View style={styles.ledgerItemLeft}>
                                  <Text style={[styles.ledgerItemAmount, { color: isPositive ? '#4CAF50' : '#F44336' }]}>
                                    {isPositive ? '+' : ''}{item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {baseCurrency}
                                  </Text>
                                  <Text style={styles.ledgerItemDate}>{formatDateEnglish(item.date)}</Text>
                                </View>
                                <View style={styles.ledgerItemRight}>
                                  <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                                    <Text style={styles.ledgerItemDesc}>{item.description}</Text>
                                    {item.type === 'MANUAL' && (
                                      <View style={{ flexDirection: 'row', gap: 4 }}>
                                        <TouchableOpacity onPress={() => handleOpenEditTx(item)}>
                                          <Ionicons name="pencil" size={14} color={COLORS.primary} />
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => handleDeleteTx(item)}>
                                          <Ionicons name="trash" size={14} color="#F44336" />
                                        </TouchableOpacity>
                                      </View>
                                    )}
                                  </View>
                                  <Text style={styles.ledgerItemTag}>
                                    {item.type === 'MANUAL' ? '⚙️ يدوي' : item.type === 'RECEIPT' ? '🧾 فاتورة' : '🤝 تسوية'}
                                  </Text>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      ) : (
                        <Text style={styles.noLedgerText}>لا توجد معاملات مسجلة لهذه المحفظة بعد.</Text>
                      )}
                    </ScrollView>
                  )
                )}
              </View>
            </View>
          </Modal>

          {/* Recent Scans */}
          <View style={styles.transactionsSection}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="receipt-outline" size={18} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>أحدث المعاملات</Text>
            </View>

            <View style={styles.transactionsList}>
              {dashboardData?.recentTransactions && dashboardData.recentTransactions.length > 0 ? (
                dashboardData.recentTransactions.map((receipt) => (
                  <TouchableOpacity
                    key={receipt.id}
                    style={styles.transactionCard}
                    onPress={() => navigation.navigate('ReceiptDetails', { id: receipt.id })}
                  >
                    <View style={styles.txIconContainer}>
                      <Ionicons 
                        name={receipt.isDebt ? 'people' : (receipt.status === 'NEEDS_REVIEW' ? 'alert-circle' : 'checkmark-circle')} 
                        size={22} 
                        color={receipt.isDebt ? (receipt.debtType === 'receivable' ? '#4CAF50' : '#F44336') : (receipt.status === 'NEEDS_REVIEW' ? COLORS.warning : COLORS.success)} 
                      />
                    </View>
                    <View style={styles.txInfo}>
                      <Text style={styles.txStore}>{receipt.storeName}</Text>
                      <Text style={styles.txDate}>
                        {(() => {
                          try {
                            const d = new Date(receipt.date);
                            return new Intl.DateTimeFormat('ar-u-ca-gregory', { day: 'numeric', month: 'long' }).format(d);
                          } catch (e) {
                            return receipt.date ? receipt.date.split('T')[0] : '';
                          }
                        })()}
                      </Text>
                    </View>
                    <View style={styles.txPriceCol}>
                      <Text style={styles.txAmount}>
                        {receipt.isDebt ? '' : '-'}{receipt.total.toFixed(2)} {receipt.currency}
                      </Text>
                      <Text style={[
                        styles.txStatus,
                        { color: receipt.isDebt ? (receipt.debtType === 'receivable' ? '#4CAF50' : '#F44336') : (receipt.status === 'NEEDS_REVIEW' ? COLORS.warning : COLORS.textSecondary) }
                      ]}>
                        {receipt.isDebt ? (receipt.debtType === 'receivable' ? '🤝 دين لي' : '💸 دين علي') : (receipt.status === 'NEEDS_REVIEW' ? 'يتطلب مراجعة' : 'معتمد')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>لا توجد فواتير مضافة بعد. اضغط على الزر أدناه لمسح أول فاتورة!</Text>
                </View>
              )}
            </View>
          </View>

          {/* Extra bottom padding to avoid tab bar overlay */}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Expected Balance & Debts Preview Modal */}
        <Modal
          visible={showBalanceModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowBalanceModal(false)}
        >
          <View style={styles.walletModalOverlay}>
            <View style={[styles.walletModalContent, { maxHeight: '85%' }]}>
              {/* Header */}
              <View style={styles.walletModalHeader}>
                <TouchableOpacity onPress={() => setShowBalanceModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.white} />
                </TouchableOpacity>
                <Text style={styles.walletModalTitle}>معاينة الرصيد المتوقع</Text>
                <View style={{ width: 24 }} />
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                {/* Available Balance Editor Card */}
                <View style={styles.adjustFormCard}>
                  <Text style={styles.adjustLabel}>تعديل الرصيد المتوفر الحالي</Text>
                  <View style={styles.adjustInputRow}>
                    <Text style={styles.adjustCurrency}>{baseCurrency}</Text>
                    <TextInput
                      style={[styles.adjustTextInput, { flex: 1 }]}
                      placeholder="0.00"
                      placeholderTextColor="rgba(255,255,255,0.25)"
                      value={inputBalance}
                      onChangeText={(val) => {
                        setInputBalance(val);
                        const num = parseFloat(val) || 0;
                        setAvailableBalance(num.toString());
                        AsyncStorage.setItem('available_balance', num.toString());
                      }}
                      keyboardType="numeric"
                      textAlign="right"
                    />
                  </View>
                </View>

                {/* Debts Summary Card */}
                <View style={[styles.walletHeroCard, { borderLeftColor: COLORS.primary, marginTop: 12 }]}>
                  <Text style={styles.walletHeroName}>ملخص الديون النشطة</Text>
                  <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 8 }}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: COLORS.textSecondary, fontSize: 11, marginBottom: 4 }}>ديون لي (سأحصلها) 🟢</Text>
                      <Text style={{ color: '#4CAF50', fontSize: 15, fontWeight: '700' }}>
                        {(dashboardData?.stats?.totalDebtReceivable || 0).toLocaleString('en-US')} {baseCurrency}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: COLORS.textSecondary, fontSize: 11, marginBottom: 4 }}>ديون علي (سأسدها) 🔴</Text>
                      <Text style={{ color: '#F44336', fontSize: 15, fontWeight: '700' }}>
                        {(dashboardData?.stats?.totalDebtPayable || 0).toLocaleString('en-US')} {baseCurrency}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Scenario Preview Grid */}
                <Text style={styles.ledgerSectionTitle}>سيناريوهات الرصيد المتوقع</Text>
                
                {(() => {
                  const current = parseFloat(availableBalance) || 0;
                  const rec = dashboardData?.stats?.totalDebtReceivable || 0;
                  const pay = dashboardData?.stats?.totalDebtPayable || 0;

                  return (
                    <View style={{ gap: 10, marginTop: 8 }}>
                      {/* Case 1: After Collection Only */}
                      <View style={styles.ledgerItemRow}>
                        <Text style={[styles.ledgerItemAmount, { color: '#4CAF50' }]}>
                          {(current + rec).toLocaleString('en-US', { minimumFractionDigits: 2 })} {baseCurrency}
                        </Text>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.ledgerItemDesc}>بعد تحصيل الديون التي لي فقط</Text>
                          <Text style={styles.ledgerItemTag}>رصيد + الديون التي لي</Text>
                        </View>
                      </View>

                      {/* Case 2: After Payment Only */}
                      <View style={styles.ledgerItemRow}>
                        <Text style={[styles.ledgerItemAmount, { color: '#F44336' }]}>
                          {(current - pay).toLocaleString('en-US', { minimumFractionDigits: 2 })} {baseCurrency}
                        </Text>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.ledgerItemDesc}>بعد سداد الديون التي علي فقط</Text>
                          <Text style={styles.ledgerItemTag}>رصيد - الديون التي علي</Text>
                        </View>
                      </View>

                      {/* Case 3: Net Net Net */}
                      <View style={[styles.ledgerItemRow, { backgroundColor: 'rgba(76, 201, 240, 0.06)', borderColor: COLORS.primary, borderWidth: 1 }]}>
                        <Text style={[styles.ledgerItemAmount, { color: COLORS.primary, fontSize: 15 }]}>
                          {(current + rec - pay).toLocaleString('en-US', { minimumFractionDigits: 2 })} {baseCurrency}
                        </Text>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.ledgerItemDesc, { color: COLORS.primary, fontWeight: '700' }]}>الصافي النهائي (الحالتين معاً)</Text>
                          <Text style={styles.ledgerItemTag}>رصيد + الديون التي لي - التي علي</Text>
                        </View>
                      </View>
                    </View>
                  );
                })()}

                {/* Active Debts List inside Modal */}
                <Text style={styles.ledgerSectionTitle}>قائمة الديون النشطة وتصفيتها</Text>
                {dashboardData?.activeDebts && dashboardData.activeDebts.length > 0 ? (
                  <View style={[styles.ledgerWrapper, { marginTop: 8 }]}>
                    {dashboardData.activeDebts.map((item) => {
                      const isReceivable = item.debtType === 'receivable';
                      return (
                        <View key={item.id} style={styles.ledgerItemRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            {settlingDebtId === item.id ? (
                              <ActivityIndicator size="small" color={COLORS.primary} />
                            ) : (
                              <TouchableOpacity
                                onPress={async () => {
                                  setSettlingDebtId(item.id);
                                  try {
                                    await axios.put(`${apiUrl}/receipts/${item.id}`, {
                                      ...item,
                                      isSettled: true
                                    });
                                    await fetchDashboardData();
                                  } catch (e) {
                                    Alert.alert('خطأ', 'فشل تسوية الدين.');
                                  } finally {
                                    setSettlingDebtId(null);
                                  }
                                }}
                                style={{
                                  backgroundColor: 'rgba(76, 201, 240, 0.1)',
                                  borderColor: COLORS.primary,
                                  borderWidth: 1,
                                  borderRadius: 8,
                                  paddingHorizontal: 8,
                                  paddingVertical: 4
                                }}
                              >
                                <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '700' }}>تسوية ✅</Text>
                              </TouchableOpacity>
                            )}
                            <Text style={[styles.ledgerItemAmount, { color: isReceivable ? '#4CAF50' : '#F44336' }]}>
                              {item.total.toFixed(2)} {item.currency}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.ledgerItemDesc}>{item.debtPerson}</Text>
                            <Text style={styles.ledgerItemTag}>
                              {isReceivable ? '🤝 دين لي على الشخص' : '💸 دين علي للشخص'}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={[styles.noLedgerText, { marginTop: 12 }]}>لا توجد ديون نشطة حالياً.</Text>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Floating Scanner Action Button */}
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('الماسح')}
        >
          <LinearGradient
            colors={[COLORS.primary, COLORS.secondary]}
            style={styles.fabGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="qr-code" size={26} color={COLORS.white} />
          </LinearGradient>
        </TouchableOpacity>

      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  profileRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(76, 201, 240, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(76, 201, 240, 0.25)',
  },
  nameContainer: {
    alignItems: 'flex-end',
  },
  greeting: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },
  membership: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceCard: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 24,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
  },
  balanceCardGrad: {
    padding: 24,
  },
  balanceLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
  balanceVal: {
    color: COLORS.text,
    fontSize: 34,
    fontWeight: '700',
    textAlign: 'right',
    marginTop: 6,
  },
  balanceCur: {
    fontSize: 18,
    color: COLORS.primary,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  statCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  statLabel: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 4,
  },
  statValRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  statVal: {
    fontSize: 14,
    fontWeight: '700',
  },
  chartPlaceholder: {
    height: 180,
    backgroundColor: COLORS.card,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
  },
  chartPlaceholderText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  chartContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
  },
  chartHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  chartTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  chartCurrency: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingHorizontal: 4,
  },
  chartLabelText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  insightsSection: {
    marginBottom: 24,
  },
  sectionTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },
  insightsWrapper: {
    width: width - 40,
  },
  insightSlide: {
    width: width - 40,
    paddingRight: 10,
  },
  insightCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(76, 201, 240, 0.1)',
  },
  insightHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  insightTitle: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  insightBody: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'right',
  },
  transactionsSection: {
    marginBottom: 24,
  },
  transactionsList: {
    gap: 12,
  },
  transactionCard: {
    flexDirection: 'row-reverse',
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    alignItems: 'center',
  },
  txIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.02)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 14,
  },
  txInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  txStore: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  txDate: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 4,
  },
  txPriceCol: {
    alignItems: 'flex-start',
  },
  txAmount: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  txStatus: {
    fontSize: 10,
    marginTop: 4,
    fontWeight: '500',
  },
  emptyState: {
    padding: 30,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    fontSize: 13,
  },
  fab: {
    position: 'absolute',
    bottom: 110,
    left: 24, // Floating on left side for RTL layout flow
    width: 58,
    height: 58,
    borderRadius: 20,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 5,
    zIndex: 99,
  },
  fabGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  budgetCardEmpty: {
    flexDirection: 'row-reverse',
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    alignItems: 'center',
    marginBottom: 24,
    gap: 12,
  },
  budgetEmptyInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  budgetEmptyTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  budgetEmptySub: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  budgetCard: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 24,
  },
  budgetCardGrad: {
    padding: 20,
  },
  budgetCardHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  budgetLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
  budgetValueText: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'right',
    marginBottom: 14,
  },
  budgetCurrencyText: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  budgetFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  budgetFooterLeft: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  budgetFooterRight: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'right',
  },
  legendRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 16,
  },
  legendItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  legendIndicator: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  filterWrapper: {
    flexDirection: 'row-reverse',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 4,
    marginBottom: 16,
    width: width - 40,
    justifyContent: 'space-between',
  },
  filterBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeFilterBtn: {
    backgroundColor: COLORS.primary,
  },
  filterBtnText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  activeFilterBtnText: {
    color: COLORS.background,
    fontWeight: '700',
  },
  calendarModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarModalContent: {
    backgroundColor: '#12131F',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: width - 40,
    padding: 20,
  },
  calendarHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  calendarTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },
  monthSelectorBar: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  monthLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekdayLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    width: (width - 80) / 7,
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginBottom: 16,
  },
  dayCell: {
    width: (width - 80) / 7,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginBottom: 4,
  },
  emptyDayCell: {
    backgroundColor: 'transparent',
  },
  selectedDayCell: {
    backgroundColor: COLORS.primary,
  },
  rangeDayCell: {
    backgroundColor: 'rgba(76, 201, 240, 0.12)',
  },
  dayCellText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '500',
  },
  selectedDayCellText: {
    color: COLORS.background,
    fontWeight: '700',
  },
  rangeDayCellText: {
    color: COLORS.primary,
  },
  selectionSummary: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  summaryText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  applyRangeBtn: {
    height: 48,
    borderRadius: 12,
    overflow: 'hidden',
  },
  applyRangeBtnGrad: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyRangeBtnText: {
    color: COLORS.background,
    fontSize: 14,
    fontWeight: '700',
  },
  // Wallet mini cards styling
  walletMiniCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderLeftWidth: 4,
    padding: 12,
    minWidth: 130,
    gap: 4,
  },
  walletMiniName: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
  },
  walletMiniBalance: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  walletMiniType: {
    color: COLORS.primary,
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'right',
    marginTop: 2,
  },
  // Stats grid 2x2 styling
  statsGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statsGridCard: {
    width: (width - 52) / 2,
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    alignItems: 'center',
    gap: 6,
  },
  statsGridLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  statsGridValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  // Mode Selector styling
  modeSelector: {
    flexDirection: 'row-reverse',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBtnActive: {
    backgroundColor: COLORS.primary,
  },
  modeBtnText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  modeBtnTextActive: {
    color: COLORS.background,
    fontWeight: '700',
  },
  // Wallet Modal Styles
  walletModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  walletModalContent: {
    backgroundColor: '#12131F',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    paddingBottom: 40,
  },
  walletModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  walletModalTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    flex: 1,
  },
  walletHeroCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderLeftWidth: 5,
    padding: 16,
    marginBottom: 16,
    gap: 4,
  },
  walletHeroName: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
  walletHeroBalance: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'right',
  },
  walletHeroType: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'right',
  },
  toggleAdjustBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  toggleAdjustBtnGrad: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  toggleAdjustBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  adjustFormCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  adjustFormTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    marginBottom: 4,
  },
  adjustLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
  },
  adjustTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  adjustTypeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustTypeBtnActiveDeposit: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderColor: '#4CAF50',
  },
  adjustTypeBtnActiveWithdraw: {
    backgroundColor: 'rgba(244, 67, 54, 0.15)',
    borderColor: '#F44336',
  },
  adjustTypeBtnText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  adjustTypeBtnTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  adjustInputRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    height: 38,
    alignItems: 'center',
  },
  adjustCurrency: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  adjustTextInput: {
    color: COLORS.text,
    fontSize: 12,
    textAlign: 'right',
    flex: 1,
    height: '100%',
  },
  adjustConfirmBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 4,
  },
  adjustConfirmBtnGrad: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  adjustConfirmBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  ledgerSectionTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    marginTop: 8,
    marginBottom: 12,
  },
  ledgerWrapper: {
    gap: 8,
  },
  ledgerItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.01)',
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 10,
  },
  ledgerItemLeft: {
    alignItems: 'flex-start',
    gap: 2,
  },
  ledgerItemRight: {
    alignItems: 'flex-end',
    flex: 1,
    marginRight: 10,
    gap: 2,
  },
  ledgerItemAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  ledgerItemDate: {
    color: COLORS.textSecondary,
    fontSize: 10,
  },
  ledgerItemDesc: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
  },
  ledgerItemTag: {
    color: COLORS.textSecondary,
    fontSize: 9,
  },
  noLedgerText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
  },
  ledgerFiltersContainer: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  ledgerFilterRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  ledgerFilterLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    minWidth: 75,
    textAlign: 'right',
  },
  ledgerFilterChips: {
    flexDirection: 'row-reverse',
    gap: 8,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: COLORS.background,
    fontWeight: '700',
  },
  totalsSummaryCard: {
    flexDirection: 'row-reverse',
    backgroundColor: 'rgba(76, 201, 240, 0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(76, 201, 240, 0.15)',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  totalSummaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  totalSummaryLabel: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 4,
  },
  totalSummaryValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 99,
  },
  fabGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default Dashboard;
