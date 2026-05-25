import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppContext } from '../context/AppContext';
import { COLORS } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const ReceiptDetails = ({ route, navigation }) => {
  const { id, approvedDirectly, approvedAfterReview } = route.params;
  const { apiUrl, fetchDashboardData, wallets } = useContext(AppContext);
  
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState(null);

  const fetchDetails = async () => {
    try {
      const res = await axios.get(`${apiUrl}/receipts/${id}`);
      setReceipt(res.data.receipt);
    } catch (e) {
      console.log('Failed to fetch receipt details:', e.message);
      alert('حدث خطأ في تحميل تفاصيل الفاتورة.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [id]);

  const handleDelete = () => {
    Alert.alert(
      'حذف الفاتورة',
      'هل أنت متأكد من رغبتك في حذف هذه الفاتورة نهائياً من السجلات؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        { 
          text: 'حذف', 
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${apiUrl}/receipts/${id}`);
              await fetchDashboardData();
              navigation.navigate('Main', { screen: 'الرئيسية' });
            } catch (err) {
              alert('فشل حذف الفاتورة.');
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loaderText}>تحميل تفاصيل المعاملة...</Text>
      </View>
    );
  }

  const dateObj = new Date(receipt.date);
  let formattedDate = '';
  try {
    const weekday = new Intl.DateTimeFormat('ar-u-ca-gregory', { weekday: 'long' }).format(dateObj);
    const greg = new Intl.DateTimeFormat('ar-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' }).format(dateObj);
    formattedDate = `${weekday}، ${greg}`;
  } catch (e) {
    formattedDate = receipt.date ? receipt.date.split('T')[0] : '';
  }
  const formattedTime = receipt.createdAt ? new Date(receipt.createdAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.background, '#11121C', COLORS.background]}
        style={styles.gradient}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('Main', { screen: 'الرئيسية' })}>
            <Ionicons name="arrow-forward" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>تفاصيل المعاملة</Text>
          <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
            <TouchableOpacity 
              style={styles.editBtn} 
              onPress={() => navigation.navigate('Review', { receipt })}
            >
              <Ionicons name="create-outline" size={22} color={COLORS.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={22} color={COLORS.error} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          
          {/* Approval Banner */}
          {approvedDirectly && (
            <View style={[styles.successBanner, { borderColor: COLORS.success, backgroundColor: 'rgba(46,196,182,0.1)' }]}>
              <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
              <Text style={[styles.successBannerText, { color: COLORS.success }]}>تم مسح وحفظ الفاتورة تلقائياً بنجاح!</Text>
            </View>
          )}

          {approvedAfterReview && (
            <View style={[styles.successBanner, { borderColor: COLORS.primary, backgroundColor: 'rgba(76,201,240,0.1)' }]}>
              <Ionicons name="shield-checkmark" size={22} color={COLORS.primary} />
              <Text style={[styles.successBannerText, { color: COLORS.primary }]}>تم تعديل واعتماد الفاتورة بنجاح.</Text>
            </View>
          )}

          {/* Receipt Card Header */}
          <View style={styles.storeCard}>
            <View style={styles.storeIcon}>
              <Ionicons name="cart" size={28} color={COLORS.primary} />
            </View>
            <Text style={styles.storeName}>{receipt.storeName}</Text>
            <Text style={styles.dateText}>{formattedDate}</Text>
            {formattedTime ? <Text style={styles.timeText}>{formattedTime}</Text> : null}
            
            <View style={styles.totalBadge}>
              <Text style={styles.totalLabel}>المبلغ الإجمالي</Text>
              <Text style={styles.totalVal}>
                {receipt.total.toFixed(2)}
                <Text style={styles.totalCur}> {receipt.currency}</Text>
              </Text>
            </View>
          </View>

          {/* Scanned Image (if available) */}
          {receipt.imageUrl ? (
            <View style={styles.imageCard}>
              <Text style={styles.sectionHeading}>صورة الفاتورة الممسوحة</Text>
              <Image 
                source={{ uri: `${apiUrl.replace('/api', '')}/${receipt.imageUrl}` }} 
                style={styles.receiptImage}
                resizeMode="cover"
              />
            </View>
          ) : null}

          {/* Who Paid Banner */}
          {receipt.payerType === 'USER' ? (
            <View style={styles.payerBanner}>
              <Ionicons name="wallet" size={18} color="#FF9800" />
              {receipt.secondaryWalletId && receipt.secondaryWalletAmount > 0 ? (
                (() => {
                  const primaryWalletName = wallets.find(w => w.id === receipt.walletId)?.name || 'محفظة أساسية';
                  const secondaryWalletName = wallets.find(w => w.id === receipt.secondaryWalletId)?.name || 'محفظة ثانوية';
                  const secondaryAmountVal = receipt.secondaryWalletAmount;
                  const primaryAmountVal = Math.max(0, receipt.total - secondaryAmountVal);
                  return (
                    <Text style={styles.payerBannerText}>
                      دفع مشترك: {primaryAmountVal.toFixed(2)} {receipt.currency} من {primaryWalletName} + {secondaryAmountVal.toFixed(2)} {receipt.currency} من {secondaryWalletName}
                    </Text>
                  );
                })()
              ) : (
                (() => {
                  const primaryWalletName = wallets.find(w => w.id === receipt.walletId)?.name || 'محفظة';
                  return (
                    <Text style={styles.payerBannerText}>
                      تم دفع {receipt.total.toFixed(2)} {receipt.currency} من {primaryWalletName}
                    </Text>
                  );
                })()
              )}
            </View>
          ) : receipt.payerName ? (
            <View style={styles.payerBanner}>
              <Ionicons name="wallet" size={18} color="#FF9800" />
              <Text style={styles.payerBannerText}>دفع {receipt.payerName} هذه الفاتورة</Text>
            </View>
          ) : null}

          {/* Debt Details Card (If receipt is a debt) */}
          {receipt.isDebt ? (
            <View style={[styles.splitOverviewCard, { backgroundColor: 'rgba(76,201,240,0.06)', borderColor: COLORS.primary }]}>
              <View style={styles.splitOverviewHeader}>
                <Ionicons name="people" size={18} color={COLORS.primary} />
                <Text style={styles.splitOverviewTitle}>تفاصيل الدين المالي 🤝</Text>
              </View>
              
              <View style={styles.debtRow}>
                <Text style={[styles.debtAmount, { color: COLORS.text }]}>
                  {receipt.debtPerson}
                </Text>
                <Text style={styles.debtName}>اسم الشخص</Text>
              </View>

              <View style={styles.debtRow}>
                <Text style={[styles.debtAmount, { color: receipt.debtType === 'receivable' ? '#4CAF50' : '#F44336' }]}>
                  {receipt.debtType === 'receivable' ? 'لي (أطلب الشخص)' : 'علي (الشخص يطلبني)'}
                </Text>
                <Text style={styles.debtName}>نوع الدين</Text>
              </View>

              <View style={styles.debtRow}>
                <Text style={[styles.debtAmount, { color: receipt.isSettled ? COLORS.textSecondary : COLORS.primary }]}>
                  {receipt.isSettled ? 'تم السداد والتسوية ✅' : 'نشط وغير مسدد ⏳'}
                </Text>
                <Text style={styles.debtName}>حالة الدين</Text>
              </View>

              {/* Settlement Action Button */}
              <TouchableOpacity
                onPress={async () => {
                  try {
                    await axios.put(`${apiUrl}/receipts/${receipt.id}`, {
                      ...receipt,
                      isSettled: !receipt.isSettled
                    });
                    await fetchDashboardData();
                    fetchDetails();
                  } catch (e) {
                    alert('فشل تحديث حالة الدين.');
                  }
                }}
                style={{
                  backgroundColor: COLORS.primary,
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: 'center',
                  marginTop: 12
                }}
              >
                <Text style={{ color: COLORS.background, fontSize: 13, fontWeight: '700' }}>
                  {receipt.isSettled ? 'إعادة تنشيط الدين 🔄' : 'تغيير حالة الدين لـ تم السداد ✅'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Purchased Items List */}
              <View style={styles.itemsCard}>
                <Text style={styles.sectionHeading}>العناصر والمشتريات ({receipt.items.length})</Text>
                
                {receipt.items.map((item, idx) => (
                  <View key={item.id || idx} style={styles.itemRow}>
                    <View style={styles.itemPriceCol}>
                      <Text style={styles.itemTotalText}>
                        {item.total.toFixed(2)} {receipt.currency}
                      </Text>
                      <Text style={styles.itemUnitPriceText}>
                        {item.quantity} × {item.price.toFixed(2)} {receipt.currency}
                      </Text>
                    </View>
                    <View style={styles.itemInfoCol}>
                      <Text style={styles.itemNameText}>{item.product?.name || item.originalName}</Text>
                      {item.originalName && item.originalName !== item.product?.name ? (
                        <Text style={styles.itemScannedText}>النص الممسوح: {item.originalName}</Text>
                      ) : null}
                      {item.discount > 0 ? (
                        <Text style={styles.itemDiscountText}>خصم: -{item.discount.toFixed(2)} {receipt.currency}</Text>
                      ) : null}
                      {/* Split Summary under item */}
                      {item.splits && item.splits.length > 1 && (
                        <View style={styles.itemSplitBadges}>
                          {item.splits.map((s, si) => (
                            <View key={si} style={[
                              styles.splitBadge,
                              s.isUser
                                ? { backgroundColor: 'rgba(76,201,240,0.12)', borderColor: 'rgba(76,201,240,0.3)' }
                                : { backgroundColor: (s.person?.color || '#999') + '20', borderColor: (s.person?.color || '#999') + '50' }
                            ]}>
                              <Text style={[styles.splitBadgeText, { color: s.isUser ? COLORS.primary : (s.person?.color || '#999') }]}>
                                {s.personName}: {s.amount.toFixed(2)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                ))}

                {/* Price Tally Footer */}
                <View style={styles.tallyContainer}>
                  {receipt.tax > 0 ? (
                    <View style={styles.tallyRow}>
                      <Text style={styles.tallyVal}>{receipt.tax.toFixed(2)} {receipt.currency}</Text>
                      <Text style={styles.tallyLabel}>الضريبة المضافة (VAT)</Text>
                    </View>
                  ) : null}
                  {receipt.discount > 0 ? (
                    <View style={styles.tallyRow}>
                      <Text style={[styles.tallyVal, { color: COLORS.primary }]}>-{receipt.discount.toFixed(2)} {receipt.currency}</Text>
                      <Text style={styles.tallyLabel}>الخصم الكلي</Text>
                    </View>
                  ) : null}
                  <View style={[styles.tallyRow, styles.grandTallyRow]}>
                    <Text style={styles.grandTallyVal}>{receipt.total.toFixed(2)} {receipt.currency}</Text>
                    <Text style={styles.grandTallyLabel}>الصافي المدفوع</Text>
                  </View>
                </View>
              </View>

              {/* Split Overview Card */}
              {(() => {
                const allSplits = receipt.items.flatMap(item => item.splits || []);
                const personDebts = {};
                allSplits.filter(s => !s.isUser).forEach(s => {
                  const key = s.personName;
                  if (!personDebts[key]) personDebts[key] = { name: key, amount: 0, color: s.person?.color || '#4CC9F0' };
                  personDebts[key].amount += s.amount;
                });
                const debtList = Object.values(personDebts);
                if (debtList.length === 0) return null;
                return (
                  <View style={styles.splitOverviewCard}>
                    <View style={styles.splitOverviewHeader}>
                      <Ionicons name="people" size={18} color={COLORS.primary} />
                      <Text style={styles.splitOverviewTitle}>ملخص تقسيم الفاتورة</Text>
                    </View>
                    {debtList.map((debt, i) => (
                      <View key={i} style={styles.debtRow}>
                        <Text style={[styles.debtAmount, { color: debt.color }]}>
                          {debt.amount.toFixed(2)} {receipt.currency}
                        </Text>
                        <Text style={styles.debtName}>{debt.name} مدين بـ</Text>
                      </View>
                    ))}
                  </View>
                );
              })()}
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
  },
  deleteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 94, 94, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(76, 201, 240, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(76, 201, 240, 0.15)',
  },
  loaderContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderText: {
    color: COLORS.text,
    fontSize: 15,
    marginTop: 16,
  },
  scrollContent: {
    padding: 20,
    gap: 20,
  },
  successBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  successBannerText: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  storeCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    alignItems: 'center',
  },
  storeIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(76, 201, 240, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(76, 201, 240, 0.2)',
  },
  storeName: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  dateText: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  timeText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 4,
  },
  totalBadge: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    width: '100%',
    alignItems: 'center',
  },
  totalLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  totalVal: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: '700',
  },
  totalCur: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  imageCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    gap: 12,
  },
  sectionHeading: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
    marginBottom: 4,
  },
  receiptImage: {
    width: '100%',
    height: 200,
    borderRadius: 16,
  },
  itemsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  itemPriceCol: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  itemTotalText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  itemUnitPriceText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  itemInfoCol: {
    flex: 1,
    alignItems: 'flex-end',
    paddingLeft: 12,
  },
  itemNameText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  itemScannedText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'right',
  },
  itemDiscountText: {
    color: COLORS.primary,
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  tallyContainer: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    gap: 8,
  },
  tallyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tallyLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  tallyVal: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  grandTallyRow: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingTop: 12,
    marginTop: 4,
  },
  grandTallyLabel: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  grandTallyVal: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  splitOverviewCard: {
    backgroundColor: 'rgba(76,201,240,0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(76,201,240,0.2)',
    padding: 18,
    gap: 10,
  },
  splitOverviewHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  splitOverviewTitle: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  debtRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  debtName: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  debtAmount: { fontSize: 14, fontWeight: '800' },
  payerBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,152,0,0.1)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,152,0,0.3)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  payerBannerText: {
    color: '#FF9800',
    fontSize: 13,
    fontWeight: '700',
  },
  itemSplitBadges: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 6,
  },
  splitBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  splitBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
});

export default ReceiptDetails;
