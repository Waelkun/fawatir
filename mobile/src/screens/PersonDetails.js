import React, { useState, useCallback, useContext } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, Alert
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AppContext } from '../context/AppContext';
import { COLORS } from '../theme/colors';
import { useFocusEffect } from '@react-navigation/native';
import axios from 'axios';

const PersonDetails = ({ route, navigation }) => {
  const { personId } = route.params;
  const { apiUrl, createSettlement, user, wallets, fetchWallets } = useContext(AppContext);

  const [loading, setLoading] = useState(true);
  const [person, setPerson] = useState(null);
  const [splits, setSplits] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState([]);

  // Settle Modal State
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleNotes, setSettleNotes] = useState('');
  const [settleType, setSettleType] = useState('RECEIVED'); // 'RECEIVED' | 'PAID'
  const [settleWalletId, setSettleWalletId] = useState(null);
  const [settling, setSettling] = useState(false);

  const currency = user?.baseCurrency || 'SAR';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${apiUrl}/people/${personId}`);
      setPerson(res.data.person);
      setSplits(res.data.splits || []);
      setSettlements(res.data.settlements || []);
      setCategoryBreakdown(res.data.categoryBreakdown || []);
      const loadedWallets = await fetchWallets();
      if (loadedWallets && loadedWallets.length > 0) {
        setSettleWalletId(loadedWallets[0].id);
      }
    } catch (err) {
      console.log('Error loading person details:', err.message);
      Alert.alert('خطأ', 'فشل تحميل بيانات الشخص.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [apiUrl, personId, fetchWallets]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleSettle = async () => {
    const rawAmount = parseFloat(settleAmount);
    if (!rawAmount || rawAmount <= 0) {
      Alert.alert('خطأ', 'يرجى إدخال مبلغ صحيح.');
      return;
    }
    if (!settleWalletId) {
      Alert.alert('خطأ', 'يرجى اختيار المحفظة لتسجيل التسوية بها.');
      return;
    }

    setSettling(true);
    // Apply sign based on type: RECEIVED is positive, PAID is negative
    const signedAmount = settleType === 'RECEIVED' ? rawAmount : -rawAmount;
    const result = await createSettlement(personId, signedAmount, settleNotes, settleWalletId);
    setSettling(false);

    if (result.success) {
      setShowSettleModal(false);
      setSettleAmount('');
      setSettleNotes('');
      await loadData();
    } else {
      Alert.alert('خطأ', result.error);
    }
  };

  const formatAmount = (amount) => {
    const formattedNum = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${formattedNum} ${currency}`;
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  };

  if (loading || !person) {
    return (
      <LinearGradient colors={[COLORS.background, '#131422', COLORS.background]} style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>جاري التحميل...</Text>
      </LinearGradient>
    );
  }

  const balanceColor = person.balance > 0 ? '#4CAF50' : person.balance < 0 ? '#F44336' : COLORS.textSecondary;
  const balanceLabel = person.balance > 0
    ? `مدين لك بـ`
    : person.balance < 0
      ? `أنت مدين بـ`
      : 'لا توجد ديون مستحقة';

  const handleSettleNetBalance = () => {
    if (person.balance === 0) return;
    setSettleAmount(Math.abs(person.balance).toString());
    setSettleType(person.balance > 0 ? 'RECEIVED' : 'PAID');
    setShowSettleModal(true);
  };

  const handleOpenSettleModal = (type) => {
    setSettleType(type);
    setSettleAmount('');
    setShowSettleModal(true);
  };

  return (
    <LinearGradient colors={[COLORS.background, '#131422', COLORS.background]} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-forward" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الملف المالي لـ {person.name}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Person Hero Card */}
        <View style={styles.heroCard}>
          <View style={[styles.heroAvatar, { backgroundColor: person.color + '25', borderColor: person.color + '60' }]}>
            <Text style={styles.heroEmoji}>{person.emoji}</Text>
          </View>
          <Text style={styles.heroName}>{person.name}</Text>
          
          <View style={styles.ledgerGrid}>
            <View style={styles.ledgerCol}>
              <Text style={styles.ledgerLabel}>مدين لك بـ</Text>
              <Text style={[styles.ledgerVal, { color: '#4CAF50' }]}>{formatAmount(person.totalOwesMe || 0)}</Text>
            </View>
            <View style={styles.ledgerSeparator} />
            <View style={styles.ledgerCol}>
              <Text style={styles.ledgerLabel}>أنت مدين له بـ</Text>
              <Text style={[styles.ledgerVal, { color: '#F44336' }]}>{formatAmount(person.totalIOwe || 0)}</Text>
            </View>
          </View>

          <View style={styles.netBalanceDivider} />
          
          <Text style={[styles.heroBalanceLabel, { color: balanceColor }]}>{balanceLabel}</Text>
          <Text style={[styles.heroBalance, { color: balanceColor }]}>
            {person.balance !== 0 ? formatAmount(person.balance) : '—'}
          </Text>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            {person.balance !== 0 && (
              <TouchableOpacity style={styles.settleBtn} onPress={handleSettleNetBalance}>
                <LinearGradient colors={['#7209B7', '#3A0CA3']} style={styles.settleBtnGrad}>
                  <Ionicons name="sync-circle-outline" size={14} color="#fff" />
                  <Text style={styles.settleBtnText}>تسوية صافية</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.settleBtn} onPress={() => handleOpenSettleModal('RECEIVED')}>
              <LinearGradient colors={['#4CAF50', '#2E7D32']} style={styles.settleBtnGrad}>
                <Ionicons name="arrow-down-circle-outline" size={14} color="#fff" />
                <Text style={styles.settleBtnText}>استلمت دفعة</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.settleBtn} onPress={() => handleOpenSettleModal('PAID')}>
              <LinearGradient colors={['#E91E63', '#C2185B']} style={styles.settleBtnGrad}>
                <Ionicons name="arrow-up-circle-outline" size={14} color="#fff" />
                <Text style={styles.settleBtnText}>سددت دفعة</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* Category Breakdown */}
        {categoryBreakdown.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>تفصيل المصاريف المشتركة</Text>
            {categoryBreakdown.map((cat, i) => (
              <View key={i} style={styles.catRow}>
                <Text style={styles.catAmount}>{formatAmount(cat.total)}</Text>
                <View style={styles.catInfo}>
                  <Text style={styles.catName}>{cat.category}</Text>
                  <View style={[styles.catBar, { width: `${Math.min((cat.total / (categoryBreakdown[0]?.total || 1)) * 100, 100)}%`, backgroundColor: person.color }]} />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Shared Items History */}
        {splits.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>المنتجات المشتركة ({splits.length})</Text>
            {splits.map((split, i) => {
              const r = split.receiptItem?.receipt;
              const isOwed = !split.isUser;
              return (
                <TouchableOpacity
                  key={split.id}
                  style={styles.historyRow}
                  onPress={() => navigation.navigate('ReceiptDetails', { id: r?.id })}
                >
                  <View style={styles.historyLeft}>
                    <Text style={[styles.historyAmount, { color: isOwed ? '#4CAF50' : '#F44336' }]}>
                      {isOwed ? '+' : '-'}{formatAmount(split.amount)}
                    </Text>
                    <Text style={styles.historyDate}>{formatDate(r?.date)}</Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={styles.historyItemName}>{split.receiptItem?.originalName || 'منتج'}</Text>
                    <Text style={styles.historyStore}>
                      {r?.storeName} • {r?.payerType === 'USER' ? 'دفعت أنت' : `دفع ${person.name}`}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Settlements History */}
        {settlements.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>سجل التسويات ({settlements.length})</Text>
            {settlements.map((settlement, i) => {
              const isReceived = settlement.amount > 0;
              return (
                <View key={settlement.id} style={styles.historyRow}>
                  <View style={styles.historyLeft}>
                    <Text style={[styles.historyAmount, { color: isReceived ? '#4CAF50' : '#F44336' }]}>
                      {isReceived ? '+' : '-'}{formatAmount(settlement.amount)}
                    </Text>
                    <Text style={styles.historyDate}>{formatDate(settlement.date)}</Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={styles.historyItemName}>
                      {isReceived ? 'استلمت دفعة (تم التحصيل)' : 'سددت دفعة (تم الدفع)'}
                    </Text>
                    {settlement.notes && <Text style={styles.historyStore}>{settlement.notes}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {splits.length === 0 && settlements.length === 0 && (
          <View style={styles.emptyHistory}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>📭</Text>
            <Text style={styles.emptyText}>لا توجد سجلات بعد</Text>
            <Text style={styles.emptySubText}>ابدأ بتقسيم فاتورة لترى السجلات هنا</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Settle Modal */}
      <Modal visible={showSettleModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowSettleModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.white} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>تسجيل تسوية مالية</Text>
              <View style={{ width: 24 }} />
            </View>

            <View style={styles.currentBalanceBox}>
              <Text style={styles.currentBalanceLabel}>صافي الرصيد الحالي</Text>
              <Text style={[styles.currentBalanceValue, { color: balanceColor }]}>
                {formatAmount(person.balance)}
              </Text>
            </View>

            {/* Settle Type (Received vs Paid) */}
            <Text style={styles.fieldLabel}>نوع التسوية</Text>
            <View style={styles.typeSelectorRow}>
              <TouchableOpacity 
                style={[styles.typeBtn, settleType === 'PAID' && styles.typeBtnActivePaid]}
                onPress={() => setSettleType('PAID')}
              >
                <Text style={[styles.typeBtnText, settleType === 'PAID' && styles.typeBtnTextActive]}>سددت دفعة له</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.typeBtn, settleType === 'RECEIVED' && styles.typeBtnActiveReceived]}
                onPress={() => setSettleType('RECEIVED')}
              >
                <Text style={[styles.typeBtnText, settleType === 'RECEIVED' && styles.typeBtnTextActive]}>استلمت دفعة منه</Text>
              </TouchableOpacity>
            </View>

            {/* Target Wallet */}
            {wallets && wallets.length > 0 && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.fieldLabel}>اختر المحفظة المستهدفة</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                  {wallets.map(w => (
                    <TouchableOpacity
                      key={w.id}
                      style={[
                        styles.walletChip,
                        settleWalletId === w.id && { borderColor: w.color, backgroundColor: w.color + '15' }
                      ]}
                      onPress={() => setSettleWalletId(w.id)}
                    >
                      <Text style={[styles.walletChipText, settleWalletId === w.id && { color: w.color }]}>
                        {w.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <Text style={styles.fieldLabel}>المبلغ</Text>
            <View style={styles.inputRow}>
              <Text style={styles.currencyTag}>{currency}</Text>
              <TextInput
                style={styles.amountInput}
                value={settleAmount}
                onChangeText={setSettleAmount}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor="rgba(255,255,255,0.25)"
                textAlign="right"
              />
            </View>

            <Text style={styles.fieldLabel}>ملاحظات (اختياري)</Text>
            <View style={[styles.inputRow, { height: 60, alignItems: 'flex-start', paddingTop: 8 }]}>
              <TextInput
                style={[styles.amountInput, { flex: 1, height: 44 }]}
                value={settleNotes}
                onChangeText={setSettleNotes}
                placeholder="مثال: نقداً، تحويل بنكي..."
                placeholderTextColor="rgba(255,255,255,0.25)"
                textAlign="right"
                multiline
              />
            </View>

            <TouchableOpacity style={styles.confirmBtn} onPress={handleSettle} disabled={settling}>
              <LinearGradient colors={['#4CAF50', '#2E7D32']} style={styles.confirmBtnGrad}>
                {settling ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done" size={18} color="#fff" />
                    <Text style={styles.confirmBtnText}>تأكيد التسوية</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: COLORS.textSecondary, fontSize: 14 },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    height: 96,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { color: COLORS.text, fontSize: 17, fontWeight: '700' },
  scrollContent: { padding: 20 },

  // Hero
  heroCard: {
    backgroundColor: COLORS.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  heroAvatar: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 2,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 8,
  },
  heroEmoji: { fontSize: 40 },
  heroName: { color: COLORS.text, fontSize: 22, fontWeight: '800' },
  heroBalanceLabel: { fontSize: 13, fontWeight: '600' },
  heroBalance: { fontSize: 28, fontWeight: '900' },
  actionRow: { flexDirection: 'row-reverse', gap: 6, marginTop: 12, width: '100%' },
  settleBtn: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  settleBtnGrad: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  settleBtnText: { color: '#fff', fontWeight: '700', fontSize: 11, textAlign: 'center' },

  // Section Cards
  sectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    marginBottom: 16,
    gap: 12,
  },
  sectionTitle: {
    color: COLORS.text, fontSize: 14, fontWeight: '700',
    textAlign: 'right',
  },

  // Category
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  catInfo: { flex: 1, alignItems: 'flex-end', gap: 4 },
  catName: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  catBar: { height: 4, borderRadius: 2, maxWidth: '100%', minWidth: 20 },
  catAmount: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },

  // History
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  historyLeft: { alignItems: 'flex-start', gap: 3 },
  historyRight: { alignItems: 'flex-end', flex: 1, marginRight: 12, gap: 3 },
  historyAmount: { fontSize: 14, fontWeight: '700' },
  historyDate: { color: COLORS.textSecondary, fontSize: 11 },
  historyItemName: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  historyStore: { color: COLORS.textSecondary, fontSize: 11 },

  emptyHistory: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  emptySubText: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#12131F',
    borderTopLeftRadius: 30, borderTopRightRadius: 30,
    padding: 24, paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700', textAlign: 'center', flex: 1 },
  currentBalanceBox: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
    gap: 4,
  },
  currentBalanceLabel: { color: COLORS.textSecondary, fontSize: 12 },
  currentBalanceValue: { fontSize: 24, fontWeight: '800' },
  fieldLabel: {
    color: COLORS.textSecondary, fontSize: 12, fontWeight: '600',
    textAlign: 'right', marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    height: 50,
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  currencyTag: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },
  amountInput: { flex: 1, color: COLORS.text, fontSize: 18, fontWeight: '700' },
  confirmBtn: { height: 52, borderRadius: 18, overflow: 'hidden', marginTop: 8 },
  confirmBtnGrad: {
    flex: 1, flexDirection: 'row-reverse',
    justifyContent: 'center', alignItems: 'center', gap: 10,
  },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Ledger grid styles
  ledgerGrid: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 12,
    marginTop: 12,
  },
  ledgerCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  ledgerLabel: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  ledgerVal: {
    fontSize: 14,
    fontWeight: '700',
  },
  ledgerSeparator: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    height: '100%',
  },
  netBalanceDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    width: '100%',
    marginVertical: 14,
  },
  
  // Settle buttons
  settleNetBtn: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  
  // Settle Modal type selectors
  typeSelectorRow: {
    flexDirection: 'row-reverse',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 3,
    marginBottom: 16,
    gap: 4,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBtnActiveReceived: {
    backgroundColor: '#4CAF50',
  },
  typeBtnActivePaid: {
    backgroundColor: '#F44336',
  },
  typeBtnText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  typeBtnTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  
  // Wallet chip styles
  walletChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  walletChipText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
});

export default PersonDetails;
