import React, { useState, useEffect, useContext, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, Alert, Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AppContext } from '../context/AppContext';
import { COLORS } from '../theme/colors';
import { useFocusEffect } from '@react-navigation/native';

// Preset colors for person badges
const PRESET_COLORS = [
  '#4CC9F0', '#F72585', '#7209B7', '#3A0CA3',
  '#4361EE', '#4CAF50', '#FF9800', '#E91E63',
  '#00BCD4', '#9C27B0', '#FF5722', '#8BC34A'
];

// Preset emojis
const PRESET_EMOJIS = ['👤', '👨', '👩', '👦', '👧', '👴', '👵', '🧑', '👨‍👩‍👦', '🧔', '👱', '🙂'];

const PeopleScreen = ({ navigation }) => {
  const { people, fetchPeople, createPerson, deletePerson, user } = useContext(AppContext);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#4CC9F0');
  const [newEmoji, setNewEmoji] = useState('👤');
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        setLoading(true);
        await fetchPeople();
        setLoading(false);
      };
      load();
    }, [fetchPeople])
  );

  const totalOwedToMe = people.reduce((sum, p) => p.balance > 0 ? sum + p.balance : sum, 0);
  const totalIOwe = people.reduce((sum, p) => p.balance < 0 ? sum + Math.abs(p.balance) : sum, 0);
  const currency = user?.baseCurrency || 'SAR';

  const handleAddPerson = async () => {
    if (!newName.trim()) {
      Alert.alert('خطأ', 'يرجى إدخال اسم الشخص.');
      return;
    }
    setSaving(true);
    const result = await createPerson(newName.trim(), newColor, newEmoji);
    setSaving(false);

    if (result.success) {
      setShowAddModal(false);
      setNewName('');
      setNewColor('#4CC9F0');
      setNewEmoji('👤');
    } else {
      Alert.alert('خطأ', result.error);
    }
  };

  const handleDeletePerson = (person) => {
    Alert.alert(
      'حذف الشخص',
      `هل أنت متأكد من حذف "${person.name}"؟ سيتم حذف جميع سجلات الديون المرتبطة.`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            const result = await deletePerson(person.id);
            if (!result.success) Alert.alert('خطأ', result.error);
          }
        }
      ]
    );
  };

  const formatAmount = (amount) => {
    const formattedNum = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${formattedNum} ${currency}`;
  };

  return (
    <LinearGradient colors={[COLORS.background, '#131422', COLORS.background]} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ width: 40 }} />
        <Text style={styles.headerTitle}>الأشخاص والديون</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
          <Ionicons name="add" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <LinearGradient colors={['#0D2B1F', '#1A3A2A']} style={[styles.summaryCard, { borderColor: 'rgba(76, 175, 80, 0.3)' }]}>
            <View style={styles.summaryIconBg}>
              <Ionicons name="arrow-down-circle" size={22} color="#4CAF50" />
            </View>
            <Text style={[styles.summaryLabel, { color: 'rgba(255,255,255,0.6)' }]}>مدينون لك</Text>
            <Text style={[styles.summaryAmount, { color: '#4CAF50' }]}>{formatAmount(totalOwedToMe)}</Text>
          </LinearGradient>

          <LinearGradient colors={['#2B0D0D', '#3A1A1A']} style={[styles.summaryCard, { borderColor: 'rgba(244, 67, 54, 0.3)' }]}>
            <View style={[styles.summaryIconBg, { backgroundColor: 'rgba(244,67,54,0.15)' }]}>
              <Ionicons name="arrow-up-circle" size={22} color="#F44336" />
            </View>
            <Text style={[styles.summaryLabel, { color: 'rgba(255,255,255,0.6)' }]}>أنت مدين</Text>
            <Text style={[styles.summaryAmount, { color: '#F44336' }]}>{formatAmount(totalIOwe)}</Text>
          </LinearGradient>
        </View>

        {/* People List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>جاري تحميل الأشخاص...</Text>
          </View>
        ) : people.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>👥</Text>
            <Text style={styles.emptyTitle}>لا يوجد أشخاص بعد</Text>
            <Text style={styles.emptyDesc}>أضف الأشخاص الذين تشارك معهم المصاريف لتتبع الديون بسهولة</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowAddModal(true)}>
              <Ionicons name="person-add" size={18} color={COLORS.primary} />
              <Text style={styles.emptyBtnText}>إضافة شخص جديد</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>قائمة الأشخاص ({people.length})</Text>
            {people.map((person) => (
              <TouchableOpacity
                key={person.id}
                style={styles.personCard}
                onPress={() => navigation.navigate('PersonDetails', { personId: person.id })}
                activeOpacity={0.8}
              >
                {/* Avatar */}
                <View style={[styles.avatar, { backgroundColor: person.color + '25', borderColor: person.color + '60' }]}>
                  <Text style={styles.avatarEmoji}>{person.emoji}</Text>
                </View>

                {/* Info */}
                <View style={styles.personInfo}>
                  <Text style={styles.personName}>{person.name}</Text>
                  <Text style={[
                    styles.personBalance,
                    { color: person.balance > 0 ? '#4CAF50' : person.balance < 0 ? '#F44336' : COLORS.textSecondary }
                  ]}>
                    {person.balance > 0
                      ? `مدين لك بـ ${formatAmount(person.balance)}`
                      : person.balance < 0
                        ? `أنت مدين بـ ${formatAmount(person.balance)}`
                        : 'لا توجد ديون مستحقة'}
                  </Text>
                </View>

                {/* Actions */}
                <View style={styles.personActions}>
                  <Ionicons name="chevron-back" size={18} color={COLORS.textSecondary} />
                  <TouchableOpacity
                    style={styles.deletePersonBtn}
                    onPress={() => handleDeletePerson(person)}
                  >
                    <Ionicons name="trash-outline" size={15} color="#F44336" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Add Debt Action Button */}
      <TouchableOpacity
        style={styles.fabAddDebt}
        onPress={() => navigation.navigate('AddDebt')}
      >
        <Ionicons name="receipt" size={24} color={COLORS.white} />
      </TouchableOpacity>

      {/* Add Person Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.white} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>إضافة شخص جديد</Text>
              <View style={{ width: 24 }} />
            </View>

            {/* Emoji Preview */}
            <View style={[styles.emojiPreview, { backgroundColor: newColor + '20', borderColor: newColor + '50' }]}>
              <Text style={styles.emojiPreviewText}>{newEmoji}</Text>
            </View>

            {/* Name Input */}
            <Text style={styles.fieldLabel}>الاسم</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.nameInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="مثال: أخي، أمي، خالد..."
                placeholderTextColor="rgba(255,255,255,0.25)"
                textAlign="right"
                autoFocus
              />
            </View>

            {/* Emoji Picker */}
            <Text style={styles.fieldLabel}>الأيقونة</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiScroll}>
              {PRESET_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.emojiOption, newEmoji === emoji && { backgroundColor: newColor + '30', borderColor: newColor }]}
                  onPress={() => setNewEmoji(emoji)}
                >
                  <Text style={styles.emojiOptionText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Color Picker */}
            <Text style={styles.fieldLabel}>اللون</Text>
            <View style={styles.colorGrid}>
              {PRESET_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[styles.colorDot, { backgroundColor: color }, newColor === color && styles.colorDotSelected]}
                  onPress={() => setNewColor(color)}
                >
                  {newColor === color && <Ionicons name="checkmark" size={14} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleAddPerson}
              disabled={saving}
            >
              <LinearGradient colors={[COLORS.primary, COLORS.secondary]} style={styles.saveBtnGrad}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="person-add" size={18} color="#fff" />
                    <Text style={styles.saveBtnText}>إضافة الشخص</Text>
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
  headerTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: { padding: 20 },
  summaryRow: {
    flexDirection: 'row-reverse',
    gap: 14,
    marginBottom: 28,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  summaryIconBg: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(76,175,80,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  summaryAmount: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
  emptyDesc: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  emptyBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  emptyBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
    marginBottom: 14,
  },
  personCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
    gap: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEmoji: { fontSize: 24 },
  personInfo: { flex: 1, alignItems: 'flex-end' },
  personName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  personBalance: { fontSize: 12, fontWeight: '600' },
  personActions: {
    alignItems: 'center',
    gap: 8,
  },
  deletePersonBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(244,67,54,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#12131F',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  emojiPreview: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  emojiPreviewText: { fontSize: 40 },
  fieldLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
    marginBottom: 8,
  },
  inputRow: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    height: 48,
    justifyContent: 'center',
    marginBottom: 20,
  },
  nameInput: { color: COLORS.text, fontSize: 15 },
  emojiScroll: { marginBottom: 20 },
  emojiOption: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  emojiOptionText: { fontSize: 22 },
  colorGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorDotSelected: {
    borderWidth: 2.5,
    borderColor: '#fff',
  },
  saveBtn: {
    height: 52,
    borderRadius: 18,
    overflow: 'hidden',
  },
  saveBtnGrad: {
    flex: 1,
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  fabAddDebt: {
    position: 'absolute',
    bottom: 30,
    left: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7209B7',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#7209B7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
});

export default PeopleScreen;
