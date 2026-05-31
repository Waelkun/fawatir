import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Modal, FlatList, KeyboardAvoidingView, Platform, Alert, Image
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppContext } from '../context/AppContext';
import { COLORS } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import CurrencySelector from './CurrencySelector';
import axios from 'axios';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Split methods
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const SPLIT_METHODS = [
  { key: 'EQUAL', label: 'بالتساوي', icon: 'git-merge-outline' },
  { key: 'PERCENTAGE', label: 'بالنسبة %', icon: 'pie-chart-outline' },
  { key: 'CUSTOM', label: 'مبلغ مخصص', icon: 'cash-outline' }
];

const Review = ({ route, navigation }) => {
  const { receipt } = route.params;
  const { 
    apiUrl, fetchDashboardData, fetchProducts, products, 
    people, fetchPeople, wallets, fetchWallets, user
  } = useContext(AppContext);

  const [saving, setSaving] = useState(false);

  // Receipt State
  const [storeName, setStoreName] = useState(receipt.storeName);
  const [date, setDate] = useState(receipt.date.split('T')[0]);
  const [currency, setCurrency] = useState(receipt.currency);
  const [tax, setTax] = useState(receipt.tax.toString());
  const [discount, setDiscount] = useState(receipt.discount.toString());
  const [total, setTotal] = useState(receipt.total.toString());
  const [items, setItems] = useState([]);

  // Payer State
  const [payerType, setPayerType] = useState(receipt.payerType || 'USER'); // 'USER' | 'PERSON'
  const [payerPersonId, setPayerPersonId] = useState(receipt.payerPersonId || null);
  const [walletId, setWalletId] = useState(receipt.walletId || null);
  const [payerName, setPayerName] = useState(receipt.payerName || null);

  const [isSplitPayment, setIsSplitPayment] = useState(!!receipt.secondaryWalletId);
  const [secondaryWalletId, setSecondaryWalletId] = useState(receipt.secondaryWalletId || null);
  const [secondaryWalletAmount, setSecondaryWalletAmount] = useState(
    receipt.secondaryWalletAmount ? receipt.secondaryWalletAmount.toString() : ''
  );

  // Product Selection Modal
  const [showProductModal, setShowProductModal] = useState(false);
  const [selectedItemIndex, setSelectedItemIndex] = useState(null);
  const [modalSearch, setModalSearch] = useState('');
  const [creatingProduct, setCreatingProduct] = useState(false);

  // Who Paid Modal
  const [showPayerModal, setShowPayerModal] = useState(false);

  // Currency Selection Modal
  const [showCurrencySelector, setShowCurrencySelector] = useState(false);

  // Split Modal
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitItemIndex, setSplitItemIndex] = useState(null);
  const [splitMethod, setSplitMethod] = useState('EQUAL');
  const [splitParticipants, setSplitParticipants] = useState([]); // [{personId, personName, isUser, amount, ratio}]

  useEffect(() => {
    fetchProducts();
    fetchPeople();
    fetchWallets();

    // Set default currency from user settings if receipt doesn't have a currency
    if (!receipt.currency && user?.baseCurrency) {
      setCurrency(user.baseCurrency);
    } else {
      setCurrency(receipt.currency || user?.baseCurrency || 'SAR');
    }

    // Default walletId if not set and wallets exist
    if (!receipt.walletId && wallets && wallets.length > 0) {
      setWalletId(wallets[0].id);
    }

    if (receipt.secondaryWalletId) {
      setIsSplitPayment(true);
      setSecondaryWalletId(receipt.secondaryWalletId);
      setSecondaryWalletAmount(receipt.secondaryWalletAmount ? receipt.secondaryWalletAmount.toString() : '');
    } else {
      setIsSplitPayment(false);
      setSecondaryWalletId(null);
      setSecondaryWalletAmount('');
    }

    if (receipt.items) {
      setItems(receipt.items.map(item => ({
        id: item.id,
        productId: item.productId,
        productName: item.product?.name || 'غير معروف',
        originalName: item.originalName,
        quantity: item.quantity.toString(),
        price: item.price.toString(),
        discount: item.discount.toString(),
        total: item.total.toString(),
        splitMethod: item.splitMethod || 'NONE',
        splits: item.splits || []
      })));
    }
  }, [receipt, user]);

  // Auto-calculate receipt total
  useEffect(() => {
    if (items.length === 0) return;
    const itemsSum = items.reduce((acc, curr) => acc + parseFloat(curr.total || 0), 0);
    const parsedTax = parseFloat(tax || 0);
    const parsedDiscount = parseFloat(discount || 0);
    const calculatedTotal = (itemsSum + parsedTax - parsedDiscount).toFixed(2);
    setTotal(calculatedTotal);
  }, [items, tax, discount]);

  const handleUpdateItemField = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;
    if (field === 'price' || field === 'quantity' || field === 'discount') {
      const q = parseFloat(updated[index].quantity || 0);
      const p = parseFloat(updated[index].price || 0);
      const d = parseFloat(updated[index].discount || 0);
      updated[index].total = ((q * p) - d).toFixed(2);
    }
    setItems(updated);
  };

  const handleAddItem = () => {
    const defaultProduct = products && products.length > 0 ? products[0] : { id: 1, name: 'منتج غير مصنف' };
    setItems([
      ...items,
      {
        id: undefined,
        productId: defaultProduct.id,
        productName: defaultProduct.name,
        originalName: 'عنصر جديد يدوياً',
        quantity: '1',
        price: '0.00',
        discount: '0.00',
        total: '0.00',
        splitMethod: 'NONE',
        splits: []
      }
    ]);
  };

  const handleDeleteItem = (index) => {
    const updated = [...items];
    updated.splice(index, 1);
    setItems(updated);
  };

  const selectProductForItem = (index) => {
    setSelectedItemIndex(index);
    setModalSearch('');
    setShowProductModal(true);
  };

  const confirmProductSelection = (product) => {
    const updated = [...items];
    updated[selectedItemIndex].productId = product.id;
    updated[selectedItemIndex].productName = product.name;
    setItems(updated);
    setShowProductModal(false);
  };

  const handleCreateProductDirectly = async (name) => {
    if (!name.trim()) return;
    setCreatingProduct(true);
    try {
      const res = await axios.post(`${apiUrl}/products`, {
        name: name.trim(),
        category: 'أخرى',
        description: 'منتج مضاف يدوياً أثناء المراجعة.'
      });
      const newProduct = res.data.product;
      await fetchProducts();
      const updated = [...items];
      updated[selectedItemIndex].productId = newProduct.id;
      updated[selectedItemIndex].productName = newProduct.name;
      setItems(updated);
      setModalSearch('');
      setShowProductModal(false);
    } catch (e) {
      const errMsg = e.response?.data?.error || 'فشل إنشاء المنتج الموحد.';
      Alert.alert('خطأ', errMsg);
    } finally {
      setCreatingProduct(false);
    }
  };

  const filteredModalProducts = products.filter(p =>
    p.name.toLowerCase().includes(modalSearch.toLowerCase()) ||
    (p.category && p.category.toLowerCase().includes(modalSearch.toLowerCase()))
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Split Modal Logic
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const openSplitModal = (index) => {
    setSplitItemIndex(index);
    const item = items[index];

    // Initialize participants from existing splits, or default to user only
    if (item.splits && item.splits.length > 0) {
      setSplitParticipants(item.splits.map(s => ({ ...s })));
      setSplitMethod(item.splitMethod || 'EQUAL');
    } else {
      setSplitParticipants([{ personId: null, personName: 'أنا', isUser: true, amount: parseFloat(item.total || 0), ratio: 100 }]);
      setSplitMethod('EQUAL');
    }
    setShowSplitModal(true);
  };

  const toggleParticipant = (person) => {
    const exists = splitParticipants.find(p => p.isUser ? person.isUser : p.personId === person.id);
    if (exists) {
      // Remove participant (must keep at least 1)
      if (splitParticipants.length === 1) return;
      setSplitParticipants(prev => prev.filter(p => p.isUser ? !person.isUser : p.personId !== person.id));
    } else {
      setSplitParticipants(prev => [...prev, {
        personId: person.id || null,
        personName: person.name,
        isUser: person.isUser || false,
        amount: 0,
        ratio: 0
      }]);
    }
  };

  // Recalculate splits based on method
  const recalcSplits = (participants, method, itemTotal) => {
    const count = participants.length;
    if (count === 0) return participants;

    if (method === 'EQUAL') {
      const share = parseFloat((itemTotal / count).toFixed(2));
      const remainder = parseFloat((itemTotal - share * count).toFixed(2));
      return participants.map((p, i) => ({
        ...p,
        amount: i === 0 ? share + remainder : share,
        ratio: parseFloat((100 / count).toFixed(1))
      }));
    }

    if (method === 'PERCENTAGE') {
      // Distribute evenly as starting point
      const ratioPerPerson = parseFloat((100 / count).toFixed(1));
      return participants.map(p => ({
        ...p,
        ratio: p.ratio > 0 ? p.ratio : ratioPerPerson,
        amount: parseFloat(((p.ratio || ratioPerPerson) / 100 * itemTotal).toFixed(2))
      }));
    }

    if (method === 'CUSTOM') {
      // Keep amounts as-is, just recalc ratios
      return participants.map(p => ({
        ...p,
        ratio: itemTotal > 0 ? parseFloat(((p.amount / itemTotal) * 100).toFixed(1)) : 0
      }));
    }

    return participants;
  };

  const getItemTotal = () => {
    if (splitItemIndex === null) return 0;
    return parseFloat(items[splitItemIndex]?.total || 0);
  };

  const updateParticipantField = (index, field, value) => {
    const updated = [...splitParticipants];
    updated[index][field] = parseFloat(value) || 0;
    setSplitParticipants(updated);
  };

  const saveSplits = () => {
    const itemTotal = getItemTotal();
    const finalSplits = recalcSplits(splitParticipants, splitMethod, itemTotal);

    const updated = [...items];
    updated[splitItemIndex].splits = finalSplits;
    updated[splitItemIndex].splitMethod = splitParticipants.length > 1 ? splitMethod : 'NONE';
    setItems(updated);
    setShowSplitModal(false);
  };

  // People list for participants: user + all persons
  const allPossibleParticipants = [
    { id: null, name: 'أنا', isUser: true, emoji: '🙋', color: COLORS.primary },
    ...people.map(p => ({ ...p, isUser: false }))
  ];

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Save Handler
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const handleSave = async () => {
    setSaving(true);
    try {
      // Determine payerName for backwards compatibility
      let resolvedPayerName = 'أنا';
      if (payerType === 'PERSON' && payerPersonId) {
        const found = people.find(p => p.id === payerPersonId);
        if (found) resolvedPayerName = found.name;
      }

      const payload = {
        storeName,
        date: new Date(date).toISOString(),
        currency,
        tax: parseFloat(tax || 0),
        discount: parseFloat(discount || 0),
        total: parseFloat(total || 0),
        payerType,
        payerPersonId: payerType === 'PERSON' ? payerPersonId : null,
        walletId: payerType === 'USER' ? walletId : null,
        secondaryWalletId: (payerType === 'USER' && isSplitPayment) ? secondaryWalletId : null,
        secondaryWalletAmount: (payerType === 'USER' && isSplitPayment) ? parseFloat(secondaryWalletAmount || 0) : 0,
        payerName: resolvedPayerName,
        items: items.map(item => ({
          productId: item.productId,
          originalName: item.originalName,
          quantity: parseFloat(item.quantity || 1),
          price: parseFloat(item.price || 0),
          discount: parseFloat(item.discount || 0),
          total: parseFloat(item.total || 0),
          splitMethod: item.splitMethod || 'NONE',
          splits: (item.splits || []).map(s => ({
            personId: s.personId || null,
            personName: s.personName,
            isUser: s.isUser || false,
            amount: parseFloat(s.amount || 0),
            ratio: parseFloat(s.ratio || 0)
          }))
        }))
      };

      await axios.put(`${apiUrl}/receipts/${receipt.id}`, payload);
      await fetchDashboardData();
      setSaving(false);
      navigation.replace('ReceiptDetails', { id: receipt.id, approvedAfterReview: true });
    } catch (error) {
      console.log('Error updating receipt:', error.message);
      setSaving(false);
      Alert.alert('خطأ', 'فشل حفظ التعديلات. يرجى التحقق من المدخلات.');
    }
  };

  const itemTotal = getItemTotal();
  const splitParticipantsCalced = recalcSplits(splitParticipants, splitMethod, itemTotal);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <LinearGradient colors={[COLORS.background, '#131422', COLORS.background]} style={styles.gradient}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} disabled={saving}>
            <Ionicons name="arrow-forward" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>مراجعة وتعديل الفاتورة</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* AI Doubt Warning Card */}
          {receipt.confidence < 0.82 && (
            <View style={styles.warningCard}>
              <Ionicons name="warning" size={24} color={COLORS.warning} />
              <View style={styles.warningTextContainer}>
                <Text style={styles.warningTitle}>الذكاء الاصطناعي غير متأكد</Text>
                <Text style={styles.warningDesc}>
                  مستوى ثقة القراءة منخفض ({Math.round(receipt.confidence * 100)}%). يرجى مراجعة وتصحيح الحقول المحددة بالبرتقالي.
                </Text>
              </View>
            </View>
          )}

          {/* Scanned Image Preview */}
          {receipt.imageUrl ? (
            <View style={styles.imageCard}>
              <Text style={styles.sectionHeading}>معاينة الفاتورة المصورة</Text>
              <Image 
                source={{ uri: `${apiUrl.replace('/api', '')}/${receipt.imageUrl}` }} 
                style={styles.receiptImage}
                resizeMode="contain"
              />
            </View>
          ) : null}

          {/* WHO PAID Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>من قام بالدفع؟</Text>
            <TouchableOpacity
              style={styles.payerSelector}
              onPress={() => setShowPayerModal(true)}
            >
              <Ionicons name="chevron-down" size={16} color={COLORS.primary} />
              <Text style={styles.payerSelectorText}>
                {payerType === 'USER' 
                  ? `أنا - محفظة: ${wallets.find(w => w.id === walletId)?.name || 'نقدي'}` 
                  : `شخص: ${people.find(p => p.id === payerPersonId)?.name || 'غير معروف'}`
                }
              </Text>
              <Ionicons name="wallet-outline" size={16} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          {/* Split Payment Section */}
          {payerType === 'USER' && wallets && wallets.length > 1 && (
            <View style={[styles.sectionCard, { marginTop: -10 }]}>
              <TouchableOpacity 
                style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}
                onPress={() => {
                  const val = !isSplitPayment;
                  setIsSplitPayment(val);
                  if (val && !secondaryWalletId) {
                    const otherWallet = wallets.find(w => w.id !== walletId);
                    if (otherWallet) setSecondaryWalletId(otherWallet.id);
                  }
                }}
              >
                <Text style={{ color: COLORS.text, fontSize: 13, fontWeight: '700' }}>تقسيم الدفع بين محفظتين (مثلاً كاش وبنك)</Text>
                <Ionicons 
                  name={isSplitPayment ? "checkbox" : "square-outline"} 
                  size={20} 
                  color={isSplitPayment ? COLORS.primary : COLORS.textSecondary} 
                />
              </TouchableOpacity>

              {isSplitPayment && (
                <View style={{ marginTop: 12, borderTopWidth: 1, borderColor: COLORS.border, paddingTop: 12, gap: 12 }}>
                  <Text style={{ color: COLORS.textSecondary, fontSize: 11, fontWeight: '600', textAlign: 'right' }}>دفع جزء من المبلغ باستخدام محفظة ثانية:</Text>
                  
                  {/* Select Secondary Wallet */}
                  <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                    {wallets.map(w => {
                      const isSelected = secondaryWalletId === w.id;
                      const isPrimary = walletId === w.id;
                      return (
                        <TouchableOpacity
                          key={`sec-wallet-${w.id}`}
                          style={{
                            flex: 1,
                            backgroundColor: isSelected ? 'rgba(76, 201, 240, 0.15)' : 'rgba(255,255,255,0.02)',
                            borderColor: isSelected ? COLORS.primary : COLORS.border,
                            borderWidth: 1,
                            borderRadius: 10,
                            paddingVertical: 8,
                            alignItems: 'center',
                            opacity: isPrimary ? 0.4 : 1.0
                          }}
                          disabled={isPrimary}
                          onPress={() => setSecondaryWalletId(w.id)}
                        >
                          <Text style={{ color: isSelected ? COLORS.text : COLORS.textSecondary, fontSize: 11, fontWeight: '700' }}>{w.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Input Secondary Wallet Amount */}
                  <View style={{ flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, height: 40 }}>
                    <Text style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' }}>{currency}</Text>
                    <TextInput
                      style={{ color: COLORS.text, fontSize: 12, textAlign: 'right', flex: 1, height: '100%' }}
                      placeholder="أدخل مبلغ المحفظة الثانية"
                      placeholderTextColor="rgba(255,255,255,0.25)"
                      value={secondaryWalletAmount}
                      onChangeText={setSecondaryWalletAmount}
                      keyboardType="numeric"
                    />
                  </View>

                  {/* Summary of split */}
                  {(() => {
                    const totalVal = parseFloat(total || 0);
                    const secVal = parseFloat(secondaryWalletAmount || 0);
                    const primVal = Math.max(0, totalVal - secVal);
                    const primaryName = wallets.find(w => w.id === walletId)?.name || 'الأساسية';
                    const secondaryName = wallets.find(w => w.id === secondaryWalletId)?.name || 'الثانوية';
                    return (
                      <View style={{ backgroundColor: 'rgba(255,255,255,0.01)', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)' }}>
                        <Text style={{ color: COLORS.textSecondary, fontSize: 11, textAlign: 'right' }}>
                          سيتم سحب <Text style={{ color: COLORS.primary, fontWeight: '700' }}>{primVal.toFixed(2)} {currency}</Text> من محفظة {primaryName}
                        </Text>
                        <Text style={{ color: COLORS.textSecondary, fontSize: 11, textAlign: 'right', marginTop: 4 }}>
                          وسيتم سحب <Text style={{ color: COLORS.secondary, fontWeight: '700' }}>{secVal.toFixed(2)} {currency}</Text> من محفظة {secondaryName}
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              )}
            </View>
          )}

          {/* Receipt General Fields */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>بيانات الفاتورة العامة</Text>

            <View style={[styles.fieldRow, styles.suspiciousField]}>
              <Text style={styles.label}>المتجر</Text>
              <TextInput
                style={styles.textInput}
                value={storeName}
                onChangeText={setStoreName}
                placeholder="اسم المتجر"
                placeholderTextColor="rgba(255,255,255,0.2)"
              />
            </View>

            <View style={styles.fieldRow}>
              <Text style={styles.label}>التاريخ</Text>
              <TextInput
                style={styles.textInput}
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="rgba(255,255,255,0.2)"
              />
            </View>

            <View style={styles.rowFields}>
              <View style={[styles.fieldRow, { flex: 1 }]}>
                <Text style={styles.label}>العملة</Text>
                <TouchableOpacity
                  onPress={() => setShowCurrencySelector(true)}
                  style={{
                    height: 40,
                    borderBottomWidth: 1,
                    borderBottomColor: 'rgba(255,255,255,0.05)',
                    justifyContent: 'center',
                    alignItems: 'flex-end',
                    paddingRight: 4
                  }}
                >
                  <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '600' }}>{currency}</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.fieldRow, styles.suspiciousField, { flex: 2 }]}>
                <Text style={styles.label}>الإجمالي الكلي</Text>
                <TextInput
                  style={styles.textInput}
                  value={total}
                  onChangeText={setTotal}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />
              </View>
            </View>

            <View style={styles.rowFields}>
              <View style={[styles.fieldRow, { flex: 1 }]}>
                <Text style={styles.label}>الضريبة</Text>
                <TextInput
                  style={styles.textInput}
                  value={tax}
                  onChangeText={setTax}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />
              </View>
              <View style={[styles.fieldRow, { flex: 1 }]}>
                <Text style={styles.label}>الخصم العام</Text>
                <TextInput
                  style={styles.textInput}
                  value={discount}
                  onChangeText={setDiscount}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />
              </View>
            </View>
          </View>

          {/* Scanned Items List */}
          <Text style={styles.itemsTitle}>تفاصيل المنتجات المشتراة</Text>

          {items.map((item, idx) => (
            <View key={item.id || idx} style={styles.itemCard}>
              <View style={styles.itemCardHeader}>
                <TouchableOpacity
                  style={styles.productLinkRow}
                  onPress={() => selectProductForItem(idx)}
                >
                  <Ionicons name="chevron-down" size={16} color={COLORS.primary} />
                  <Text style={styles.productLinkText}>{item.productName}</Text>
                  <Text style={styles.productLinkLabel}>المنتج الموحد:</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteItemBtn}
                  onPress={() => handleDeleteItem(idx)}
                >
                  <Ionicons name="trash-outline" size={16} color={COLORS.error} />
                </TouchableOpacity>
              </View>

              <View style={[styles.fieldRow, styles.itemField]}>
                <Text style={styles.label}>الاسم المقروء</Text>
                <TextInput
                  style={[styles.textInput, { textAlign: 'right', fontWeight: '500' }]}
                  value={item.originalName}
                  onChangeText={(val) => handleUpdateItemField(idx, 'originalName', val)}
                />
              </View>

              <View style={styles.rowFields}>
                <View style={[styles.fieldRow, styles.itemField, { flex: 1 }]}>
                  <Text style={styles.label}>الكمية</Text>
                  <TextInput
                    style={styles.textInput}
                    value={item.quantity}
                    keyboardType="numeric"
                    onChangeText={(val) => handleUpdateItemField(idx, 'quantity', val)}
                  />
                </View>
                <View style={[styles.fieldRow, styles.itemField, { flex: 1.5 }]}>
                  <Text style={styles.label}>سعر الوحدة</Text>
                  <TextInput
                    style={styles.textInput}
                    value={item.price}
                    keyboardType="numeric"
                    onChangeText={(val) => handleUpdateItemField(idx, 'price', val)}
                  />
                </View>
                <View style={[styles.fieldRow, styles.itemField, { flex: 1.5 }]}>
                  <Text style={styles.label}>المجموع</Text>
                  <Text style={styles.calculatedValText}>{item.total}</Text>
                </View>
              </View>

              {/* Split Button */}
              <TouchableOpacity
                style={[
                  styles.splitBtn,
                  item.splits && item.splits.length > 1 && styles.splitBtnActive
                ]}
                onPress={() => openSplitModal(idx)}
              >
                <Ionicons
                  name={item.splits && item.splits.length > 1 ? "people" : "people-outline"}
                  size={15}
                  color={item.splits && item.splits.length > 1 ? COLORS.primary : COLORS.textSecondary}
                />
                <Text style={[
                  styles.splitBtnText,
                  item.splits && item.splits.length > 1 && { color: COLORS.primary }
                ]}>
                  {item.splits && item.splits.length > 1
                    ? `مقسّم على ${item.splits.length} أشخاص`
                    : 'تقسيم هذا المنتج'}
                </Text>
                {item.splits && item.splits.length > 1 && (
                  <Ionicons name="checkmark-circle" size={15} color={COLORS.primary} />
                )}
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity style={styles.addItemBtn} onPress={handleAddItem}>
            <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
            <Text style={styles.addItemBtnText}>إضافة عنصر جديد للفاتورة</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSave}
            disabled={saving}
          >
            <LinearGradient colors={[COLORS.primary, COLORS.secondary]} style={styles.saveBtnGrad}>
              {saving ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={20} color={COLORS.white} />
                  <Text style={styles.saveBtnText}>حفظ واعتماد الفاتورة</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <View style={{ height: 60 }} />
        </ScrollView>

        {/* Currency Selector Modal */}
        <CurrencySelector
          visible={showCurrencySelector}
          onClose={() => setShowCurrencySelector(false)}
          currentCurrency={currency}
          onSelect={(code) => setCurrency(code)}
        />

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* WHO PAID Modal */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <Modal visible={showPayerModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowPayerModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.white} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>من قام بالدفع؟</Text>
                <View style={{ width: 24 }} />
              </View>

              <Text style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: '700', textAlign: 'right', marginBottom: 8, marginRight: 8 }}>محافظي الخاصة (دفع المستخدم):</Text>
              
              {wallets.map(w => (
                <TouchableOpacity
                  key={`wallet-${w.id}`}
                  style={[styles.payerOption, payerType === 'USER' && walletId === w.id && styles.payerOptionSelected]}
                  onPress={() => {
                    setPayerType('USER');
                    setWalletId(w.id);
                    if (secondaryWalletId === w.id) {
                      const otherWallet = wallets.find(ot => ot.id !== w.id);
                      setSecondaryWalletId(otherWallet ? otherWallet.id : null);
                    }
                    setPayerPersonId(null);
                    setPayerName('أنا');
                    setShowPayerModal(false);
                  }}
                >
                  <Text style={styles.payerOptionEmoji}>💳</Text>
                  <Text style={styles.payerOptionName}>{w.name} ({parseFloat(w.balance).toFixed(1)} {currency})</Text>
                  {payerType === 'USER' && walletId === w.id && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
                </TouchableOpacity>
              ))}

              <Text style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: '700', textAlign: 'right', marginTop: 12, marginBottom: 8, marginRight: 8 }}>أشخاص آخرين دفعوا الفاتورة:</Text>

              {people.map(p => (
                <TouchableOpacity
                  key={`person-${p.id}`}
                  style={[styles.payerOption, payerType === 'PERSON' && payerPersonId === p.id && styles.payerOptionSelected]}
                  onPress={() => {
                    setPayerType('PERSON');
                    setWalletId(null);
                    setPayerPersonId(p.id);
                    setPayerName(p.name);
                    setShowPayerModal(false);
                  }}
                >
                  <View style={[styles.payerAvatar, { backgroundColor: p.color + '25', borderColor: p.color + '60' }]}>
                    <Text style={styles.payerOptionEmoji}>{p.emoji}</Text>
                  </View>
                  <Text style={styles.payerOptionName}>{p.name}</Text>
                  {payerType === 'PERSON' && payerPersonId === p.id && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
                </TouchableOpacity>
              ))}

              {people.length === 0 && (
                <Text style={styles.noPersonHint}>
                  لم يتم إضافة أشخاص بعد لتحديدهم كدافعين.
                </Text>
              )}
            </View>
          </View>
        </Modal>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* SPLIT ITEM Modal */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <Modal visible={showSplitModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxHeight: '90%' }]}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowSplitModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.white} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>تقسيم المنتج</Text>
                <TouchableOpacity onPress={saveSplits}>
                  <Text style={styles.modalSaveText}>حفظ</Text>
                </TouchableOpacity>
              </View>

              {/* Item Info */}
              {splitItemIndex !== null && (
                <View style={styles.splitItemInfo}>
                  <Text style={styles.splitItemName}>{items[splitItemIndex]?.originalName}</Text>
                  <Text style={styles.splitItemTotal}>{items[splitItemIndex]?.total} {currency}</Text>
                </View>
              )}

              {/* Split Method Selector */}
              <View style={styles.splitMethodRow}>
                {SPLIT_METHODS.map(m => (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.splitMethodBtn, splitMethod === m.key && styles.splitMethodBtnActive]}
                    onPress={() => setSplitMethod(m.key)}
                  >
                    <Ionicons name={m.icon} size={14} color={splitMethod === m.key ? '#fff' : COLORS.textSecondary} />
                    <Text style={[styles.splitMethodText, splitMethod === m.key && { color: '#fff' }]}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Participants Selection */}
              <Text style={styles.fieldLabelModal}>اختر المشاركين</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.participantsScroll}>
                {allPossibleParticipants.map((person) => {
                  const isSelected = splitParticipants.some(p =>
                    person.isUser ? p.isUser : p.personId === person.id
                  );
                  return (
                    <TouchableOpacity
                      key={person.id || 'user'}
                      style={[
                        styles.participantChip,
                        { borderColor: person.color || COLORS.primary },
                        isSelected && { backgroundColor: (person.color || COLORS.primary) + '25' }
                      ]}
                      onPress={() => toggleParticipant(person)}
                    >
                      <Text style={styles.participantEmoji}>{person.emoji || '👤'}</Text>
                      <Text style={[styles.participantName, isSelected && { color: person.color || COLORS.primary }]}>
                        {person.name}
                      </Text>
                      {isSelected && <Ionicons name="checkmark-circle" size={14} color={person.color || COLORS.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Split Preview / Input */}
              <Text style={styles.fieldLabelModal}>توزيع المبلغ</Text>
              <ScrollView style={styles.splitPreviewScroll} nestedScrollEnabled>
                {splitParticipantsCalced.map((p, i) => (
                  <View key={i} style={styles.splitRow}>
                    <View style={styles.splitRowLeft}>
                      {splitMethod === 'CUSTOM' ? (
                        <TextInput
                          style={styles.splitAmountInput}
                          value={p.amount.toString()}
                          onChangeText={(v) => updateParticipantField(i, 'amount', v)}
                          keyboardType="numeric"
                          textAlign="center"
                        />
                      ) : splitMethod === 'PERCENTAGE' ? (
                        <View style={styles.splitPercentRow}>
                          <Text style={styles.splitPctSymbol}>%</Text>
                          <TextInput
                            style={styles.splitAmountInput}
                            value={p.ratio.toString()}
                            onChangeText={(v) => updateParticipantField(i, 'ratio', v)}
                            keyboardType="numeric"
                            textAlign="center"
                          />
                        </View>
                      ) : (
                        <Text style={styles.splitAmountFixed}>
                          {p.amount.toFixed(2)} {currency}
                        </Text>
                      )}
                    </View>
                    <View style={styles.splitRowRight}>
                      <Text style={styles.splitParticipantName}>{p.personName}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>

              <TouchableOpacity style={styles.splitSaveBtn} onPress={saveSplits}>
                <LinearGradient colors={[COLORS.primary, COLORS.secondary]} style={styles.splitSaveBtnGrad}>
                  <Ionicons name="checkmark-done" size={18} color="#fff" />
                  <Text style={styles.splitSaveBtnText}>حفظ التقسيم</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Product Selector Modal */}
        <Modal visible={showProductModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowProductModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.white} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>اختر المنتج الموحد المناسب</Text>
              </View>

              <View style={styles.modalSearchRow}>
                <TextInput
                  style={styles.modalSearchInput}
                  placeholder="ابحث أو اكتب اسم منتج جديد..."
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  value={modalSearch}
                  onChangeText={setModalSearch}
                />
              </View>

              {modalSearch.trim().length > 0 && !products.some(p => p.name.toLowerCase() === modalSearch.trim().toLowerCase()) ? (
                <TouchableOpacity
                  style={styles.modalCreateBtn}
                  onPress={() => handleCreateProductDirectly(modalSearch)}
                  disabled={creatingProduct}
                >
                  <Ionicons name="add-circle" size={20} color={COLORS.primary} style={{ marginLeft: 8 }} />
                  <Text style={styles.modalCreateBtnText}>إنشاء منتج جديد باسم: "{modalSearch}"</Text>
                  {creatingProduct && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 8 }} />}
                </TouchableOpacity>
              ) : null}

              <FlatList
                data={filteredModalProducts}
                keyExtractor={(p) => p.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.productModalItem}
                    onPress={() => confirmProductSelection(item)}
                  >
                    <Ionicons name="basket-outline" size={20} color={COLORS.primary} />
                    <View style={styles.productModalInfo}>
                      <Text style={styles.productModalName}>{item.name}</Text>
                      <Text style={styles.productModalCat}>{item.category}</Text>
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.modalEmpty}>
                    <Text style={styles.modalEmptyText}>لا توجد منتجات موحدة مسجلة بعد.</Text>
                  </View>
                }
              />
            </View>
          </View>
        </Modal>

      </LinearGradient>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
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
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { color: COLORS.text, fontSize: 17, fontWeight: '700' },
  scrollContent: { padding: 20 },
  warningCard: {
    flexDirection: 'row-reverse',
    backgroundColor: 'rgba(255, 183, 3, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 183, 3, 0.25)',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  warningTextContainer: { flex: 1, alignItems: 'flex-end' },
  warningTitle: { color: COLORS.warning, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  warningDesc: { color: COLORS.text, fontSize: 12, lineHeight: 18, textAlign: 'right' },
  sectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    gap: 16,
    marginBottom: 24,
  },
  sectionHeading: {
    color: COLORS.text, fontSize: 15, fontWeight: '700',
    textAlign: 'right', marginBottom: 4,
  },
  payerSelector: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(76,201,240,0.07)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(76,201,240,0.3)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  payerSelectorText: { color: COLORS.text, fontSize: 14, fontWeight: '600', flex: 1, textAlign: 'right' },
  fieldRow: { gap: 6 },
  suspiciousField: {
    borderWidth: 1,
    borderColor: 'rgba(255, 183, 3, 0.4)',
    borderRadius: 16,
    padding: 8,
    backgroundColor: 'rgba(255, 183, 3, 0.02)',
  },
  label: {
    color: COLORS.textSecondary, fontSize: 11, fontWeight: '600',
    textAlign: 'right', paddingRight: 4,
  },
  textInput: {
    color: COLORS.text, fontSize: 14, textAlign: 'right',
    paddingHorizontal: 4, height: 36,
  },
  rowFields: { flexDirection: 'row-reverse', gap: 12 },
  itemsTitle: {
    color: COLORS.text, fontSize: 15, fontWeight: '700',
    textAlign: 'right', marginBottom: 14, paddingHorizontal: 4,
  },
  itemCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    gap: 12,
    marginBottom: 16,
  },
  productLinkRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  itemCardHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  deleteItemBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255, 94, 94, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 94, 94, 0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  addItemBtn: {
    flexDirection: 'row-reverse',
    height: 48,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 20,
    backgroundColor: 'rgba(76, 201, 240, 0.02)',
  },
  addItemBtnText: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
  productLinkText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  productLinkLabel: { color: COLORS.textSecondary, fontSize: 11 },
  itemField: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    paddingBottom: 4,
  },
  calculatedValText: {
    color: COLORS.text, fontSize: 14, fontWeight: '700',
    textAlign: 'right', paddingVertical: 8, paddingRight: 4,
  },
  saveBtn: { height: 56, borderRadius: 20, overflow: 'hidden', marginTop: 20 },
  saveBtnGrad: {
    flex: 1, flexDirection: 'row-reverse',
    justifyContent: 'center', alignItems: 'center', gap: 10,
  },
  saveBtnText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  // Split button on item card
  splitBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  splitBtnActive: {
    borderColor: 'rgba(76,201,240,0.4)',
    borderStyle: 'solid',
    backgroundColor: 'rgba(76,201,240,0.06)',
  },
  splitBtnText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#12131F',
    borderTopLeftRadius: 30, borderTopRightRadius: 30,
    height: '80%',
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  modalSaveText: { color: COLORS.primary, fontSize: 15, fontWeight: '700' },
  modalSearchRow: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    height: 46,
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalSearchInput: { color: COLORS.text, fontSize: 14, textAlign: 'right' },
  modalCreateBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(76, 201, 240, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(76, 201, 240, 0.25)',
    borderRadius: 12,
    height: 46,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  modalCreateBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  productModalItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 12,
  },
  productModalInfo: { flex: 1, alignItems: 'flex-end' },
  productModalName: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  productModalCat: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  modalEmpty: { padding: 40, alignItems: 'center' },
  modalEmptyText: { color: COLORS.textSecondary, fontSize: 13 },
  // Who Paid Modal
  payerOption: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  payerOptionSelected: {
    backgroundColor: 'rgba(76,201,240,0.1)',
    borderColor: 'rgba(76,201,240,0.4)',
  },
  payerAvatar: {
    width: 38, height: 38, borderRadius: 19,
    borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
  },
  payerOptionEmoji: { fontSize: 22 },
  payerOptionName: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  noPersonHint: {
    color: COLORS.textSecondary, fontSize: 13, textAlign: 'center',
    paddingVertical: 20, lineHeight: 20,
  },
  // Split Modal
  splitItemInfo: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  splitItemName: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  splitItemTotal: { color: COLORS.primary, fontSize: 16, fontWeight: '800' },
  splitMethodRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginBottom: 16,
  },
  splitMethodBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  splitMethodBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  splitMethodText: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '600' },
  fieldLabelModal: {
    color: COLORS.textSecondary, fontSize: 12, fontWeight: '600',
    textAlign: 'right', marginBottom: 8,
  },
  participantsScroll: { marginBottom: 16 },
  participantChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  participantEmoji: { fontSize: 18 },
  participantName: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  splitPreviewScroll: { maxHeight: 180, marginBottom: 16 },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  splitRowLeft: { alignItems: 'center' },
  splitRowRight: { alignItems: 'flex-end' },
  splitAmountInput: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '700',
    backgroundColor: 'rgba(76,201,240,0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 80,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'rgba(76,201,240,0.3)',
  },
  splitAmountFixed: { color: COLORS.primary, fontSize: 15, fontWeight: '700' },
  splitPercentRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  splitPctSymbol: { color: COLORS.textSecondary, fontSize: 14 },
  splitParticipantName: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  splitSaveBtn: { height: 50, borderRadius: 16, overflow: 'hidden' },
  splitSaveBtnGrad: {
    flex: 1, flexDirection: 'row-reverse',
    justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  splitSaveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
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
    height: 350,
    borderRadius: 16,
  },
});

export default Review;
