import React, { useState, useContext, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppContext } from '../context/AppContext';
import { COLORS } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import CurrencySelector from './CurrencySelector';
import axios from 'axios';

const AddDebtScreen = ({ navigation }) => {
  const { apiUrl, user, fetchDashboardData } = useContext(AppContext);
  const [loading, setLoading] = useState(false);

  // Form State
  const [debtPerson, setDebtPerson] = useState('');
  const [debtType, setDebtType] = useState('receivable'); // 'receivable' (لي) | 'payable' (علي)
  const [total, setTotal] = useState('');
  const [currency, setCurrency] = useState(user?.baseCurrency || 'SAR');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Selector Modal
  const [showCurrencySelector, setShowCurrencySelector] = useState(false);

  useEffect(() => {
    if (user?.baseCurrency) {
      setCurrency(user.baseCurrency);
    }
  }, [user]);

  const handleSave = async () => {
    if (!debtPerson.trim()) {
      Alert.alert('خطأ', 'يرجى إدخال اسم الشخص.');
      return;
    }
    const amountVal = parseFloat(total);
    if (!amountVal || amountVal <= 0) {
      Alert.alert('خطأ', 'يرجى إدخال مبلغ صحيح.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        isDebt: true,
        debtType,
        debtPerson: debtPerson.trim(),
        isSettled: false,
        total: amountVal,
        currency,
        date: new Date(date).toISOString(),
        storeName: debtType === 'receivable' ? `دين لي على ${debtPerson.trim()}` : `دين علي لـ ${debtPerson.trim()}`,
        notes: notes.trim()
      };

      await axios.post(`${apiUrl}/receipts`, payload);
      await fetchDashboardData();
      Alert.alert('نجاح', 'تم تسجيل الدين بنجاح.');
      navigation.navigate('Main', { screen: 'الرئيسية' });
    } catch (e) {
      console.log('Error creating debt:', e.message);
      Alert.alert('خطأ', 'فشل تسجيل الدين. يرجى مراجعة الاتصال بالشبكة.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <LinearGradient colors={[COLORS.background, '#131422', COLORS.background]} style={styles.gradient}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-forward" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>إضافة دين جديد 🤝</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Person Name Input */}
          <View style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>اسم الشخص</Text>
            <TextInput
              style={styles.textInput}
              placeholder="مثال: أحمد، خالد..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={debtPerson}
              onChangeText={setDebtPerson}
              textAlign="right"
            />
          </View>

          {/* Debt Type Selector */}
          <View style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>نوع الدين</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeBtn, debtType === 'payable' && styles.typeBtnActivePayable]}
                onPress={() => setDebtType('payable')}
              >
                <Ionicons name="arrow-up-circle-outline" size={16} color={debtType === 'payable' ? '#fff' : '#F44336'} style={{ marginLeft: 6 }} />
                <Text style={[styles.typeBtnText, debtType === 'payable' && styles.typeBtnTextActive]}>
                  علي (الشخص يطلبني)
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.typeBtn, debtType === 'receivable' && styles.typeBtnActiveReceivable]}
                onPress={() => setDebtType('receivable')}
              >
                <Ionicons name="arrow-down-circle-outline" size={16} color={debtType === 'receivable' ? '#fff' : '#4CAF50'} style={{ marginLeft: 6 }} />
                <Text style={[styles.typeBtnText, debtType === 'receivable' && styles.typeBtnTextActive]}>
                  لي (أطلب الشخص)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Amount and Currency Selection */}
          <View style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>المبلغ والعملة</Text>
            <View style={styles.amountRow}>
              <TouchableOpacity
                style={styles.currencyBtn}
                onPress={() => setShowCurrencySelector(true)}
              >
                <Ionicons name="chevron-down" size={14} color={COLORS.primary} style={{ marginRight: 4 }} />
                <Text style={styles.currencyBtnText}>{currency}</Text>
              </TouchableOpacity>
              <TextInput
                style={[styles.textInput, { flex: 1, fontSize: 18, fontWeight: '700' }]}
                placeholder="0.00"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={total}
                onChangeText={setTotal}
                keyboardType="numeric"
                textAlign="right"
              />
            </View>
          </View>

          {/* Date Picker */}
          <View style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>التاريخ</Text>
            <TextInput
              style={styles.textInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={date}
              onChangeText={setDate}
              textAlign="right"
            />
          </View>

          {/* Notes */}
          <View style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>ملاحظات وبيانات إضافية</Text>
            <TextInput
              style={[styles.textInput, { height: 60, textAlignVertical: 'top', paddingTop: 8 }]}
              placeholder="ملاحظات حول الدين..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={notes}
              onChangeText={setNotes}
              multiline
              textAlign="right"
            />
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSave}
            disabled={loading}
          >
            <LinearGradient colors={[COLORS.primary, COLORS.secondary]} style={styles.saveBtnGrad}>
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={20} color={COLORS.white} />
                  <Text style={styles.saveBtnText}>حفظ وتسجيل الدين</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <View style={{ height: 60 }} />
        </ScrollView>

        <CurrencySelector
          visible={showCurrencySelector}
          onClose={() => setShowCurrencySelector(false)}
          currentCurrency={currency}
          onSelect={(code) => setCurrency(code)}
        />
      </LinearGradient>
    </KeyboardAvoidingView>
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
    fontSize: 16,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  fieldCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 8,
  },
  fieldLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
  textInput: {
    color: COLORS.text,
    fontSize: 14,
    height: 44,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  typeRow: {
    flexDirection: 'row-reverse',
    gap: 10,
    marginTop: 4,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 10,
  },
  typeBtnActiveReceivable: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  typeBtnActivePayable: {
    backgroundColor: '#F44336',
    borderColor: '#F44336',
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
  amountRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  currencyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 201, 240, 0.08)',
    borderColor: COLORS.primary,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    justifyContent: 'center',
  },
  currencyBtnText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  saveBtn: {
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: 12,
  },
  saveBtnGrad: {
    flexDirection: 'row-reverse',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
  },
});

export default AddDebtScreen;
