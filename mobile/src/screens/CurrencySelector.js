import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput } from 'react-native';
import { COLORS } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';

const CurrencySelector = ({ visible, onClose, currentCurrency, onSelect }) => {
  const [customCurrency, setCustomCurrency] = React.useState('');
  const [showCustomInput, setShowCustomInput] = React.useState(false);

  const mainCurrencies = [
    { code: 'SAR', name: 'ريال سعودي (SAR)' },
    { code: 'TRY', name: 'ليرة تركية (TRY)' },
    { code: 'EUR', name: 'يورو (EUR)' },
    { code: 'USD', name: 'دولار أمريكي (USD)' },
  ];

  const handleSelect = (code) => {
    onSelect(code);
    setShowCustomInput(false);
    onClose();
  };

  const handleCustomSubmit = () => {
    if (customCurrency.trim()) {
      onSelect(customCurrency.trim().toUpperCase());
      setCustomCurrency('');
      setShowCustomInput(false);
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={styles.title}>اختر عملة الفاتورة</Text>
            <View style={{ width: 36 }} />
          </View>

          <View style={styles.grid}>
            {mainCurrencies.map((cur) => {
              const isSelected = currentCurrency === cur.code;
              return (
                <TouchableOpacity
                  key={cur.code}
                  style={[styles.curBtn, isSelected && styles.curBtnSelected]}
                  onPress={() => handleSelect(cur.code)}
                >
                  <Text style={[styles.curText, isSelected && styles.curTextSelected]}>
                    {cur.name}
                  </Text>
                  {isSelected && <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.curBtn, showCustomInput && styles.curBtnSelected]}
              onPress={() => setShowCustomInput(!showCustomInput)}
            >
              <Text style={[styles.curText, showCustomInput && styles.curTextSelected]}>
                أخرى (رمز مخصص)
              </Text>
              <Ionicons name="add-circle-outline" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {showCustomInput && (
            <View style={styles.customInputRow}>
              <TouchableOpacity style={styles.customSubmitBtn} onPress={handleCustomSubmit}>
                <Text style={styles.customSubmitText}>تطبيق</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.customInput}
                placeholder="مثال: CAD, GBP"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={customCurrency}
                onChangeText={setCustomCurrency}
                autoCapitalize="characters"
                maxLength={4}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: '100%',
    maxWidth: 340,
    padding: 20,
    gap: 16,
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    paddingBottom: 12,
  },
  title: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  grid: {
    gap: 10,
  },
  curBtn: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  curBtnSelected: {
    backgroundColor: 'rgba(76, 201, 240, 0.08)',
    borderColor: COLORS.primary,
  },
  curText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  curTextSelected: {
    color: COLORS.text,
    fontWeight: '700',
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  customInput: {
    flex: 1,
    height: 44,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    color: COLORS.text,
    paddingHorizontal: 12,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
  customSubmitBtn: {
    backgroundColor: COLORS.primary,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  customSubmitText: {
    color: COLORS.background,
    fontSize: 13,
    fontWeight: '700',
  },
});

export default CurrencySelector;
