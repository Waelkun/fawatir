import React, { useState, useEffect, useContext, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, FlatList } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppContext } from '../context/AppContext';
import { COLORS } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const CATEGORIES = ['الكل', 'طعام ومشروبات', 'تقنية وإلكترونيات', 'مواصلات وسيارات', 'ملابس وموضة', 'صحة وعناية شخصية', 'منزل وأثاث', 'أخرى'];

const ProductList = ({ navigation }) => {
  const { apiUrl } = useContext(AppContext);
  const [products, setProducts] = useState([]);

  
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Manual Add States
  const [showAddModal, setShowAddModal] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [manualQty, setManualQty] = useState('1');
  const [manualCurrency, setManualCurrency] = useState('SAR');
  const [manualCat, setManualCat] = useState('طعام ومشروبات');
  const [manualNotes, setManualNotes] = useState('');
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [savingManual, setSavingManual] = useState(false);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${apiUrl}/products?onlyPurchased=true`);
      setProducts(res.data.products);
    } catch (e) {
      console.log('Error loading products:', e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await axios.get(`${apiUrl}/products?onlyPurchased=true`);
      setProducts(res.data.products);
    } catch (e) {
      console.log('Error refreshing products:', e.message);
    }
    setRefreshing(false);
  };


  // Generate description using Gemini
  const handleGenerateDescription = async () => {
    if (!manualName) {
      alert('يرجى إدخال اسم المنتج لتوليد الوصف.');
      return;
    }
    setGeneratingDesc(true);
    try {
      const res = await axios.post(`${apiUrl}/products/generate-description`, { name: manualName });
      setManualNotes(res.data.description);
    } catch (e) {
      alert('فشل توليد الوصف بالذكاء الاصطناعي.');
    } finally {
      setGeneratingDesc(false);
    }
  };

  const handleSaveManual = async () => {
    if (!manualName || !manualPrice) {
      alert('الاسم والسعر حقول مطلوبة.');
      return;
    }
    setSavingManual(true);
    try {
      const payload = {
        name: manualName,
        price: parseFloat(manualPrice),
        currency: manualCurrency,
        quantity: parseFloat(manualQty || 1),
        category: manualCat,
        notes: manualNotes
      };
      await axios.post(`${apiUrl}/products/manual`, payload);
      await loadProducts();

      
      // Reset & close
      setManualName('');
      setManualPrice('');
      setManualQty('1');
      setManualNotes('');
      setShowAddModal(false);
      
      alert('تم إضافة المنتج وتدوين الحركة بنجاح.');
    } catch (err) {
      alert('فشل إضافة المنتج يدوياً.');
    } finally {
      setSavingManual(false);
    }
  };

  // Filters
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.includes(search) || p.category.includes(search);
    const matchesCat = selectedCategory === 'الكل' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.background, '#11121C', COLORS.background]}
        style={styles.gradient}
      >
        {/* Top Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.addBtn}
            onPress={() => setShowAddModal(true)}
          >
            <Ionicons name="add" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>سجل المنتجات الموحدة</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Search Bar */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={20} color={COLORS.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="ابحث عن منتج، فئة..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={search}
              onChangeText={setSearch}
            />
          </View>
        </View>

        {/* Categories Scroller */}
        <View style={styles.catContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.catChip,
                  selectedCategory === cat ? styles.activeCatChip : null
                ]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={[
                  styles.catChipText,
                  selectedCategory === cat ? styles.activeCatChipText : null
                ]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* List of Products */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <FlatList
            data={filteredProducts}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.listContent}
            refreshing={refreshing}
            onRefresh={onRefresh}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.productCard}
                onPress={() => navigation.navigate('SingleProductDetails', { id: item.id })}
              >
                <View style={styles.cardArrow}>
                  <Ionicons name="chevron-back" size={18} color={COLORS.textSecondary} />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.productName}>{item.name}</Text>
                  <Text style={styles.productCat}>{item.category}</Text>
                  {item.description ? (
                    <Text style={styles.productDesc} numberOfLines={1}>{item.description}</Text>
                  ) : null}
                </View>
                <View style={styles.iconCircle}>
                  <Ionicons name="basket-sharp" size={22} color={COLORS.primary} />
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="basket-outline" size={48} color={COLORS.textSecondary} />
                <Text style={styles.emptyText}>لا توجد منتجات مطابقة لخيارات البحث.</Text>
              </View>
            }
          />
        )}

        {/* Manual Add Product Modal */}
        <Modal
          visible={showAddModal}
          transparent={true}
          animationType="slide"
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowAddModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.white} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>إضافة منتج يدوياً</Text>
              </View>

              <ScrollView contentContainerStyle={styles.modalForm}>
                
                {/* Product Name & Generate Description Button */}
                <View style={styles.modalField}>
                  <Text style={styles.modalLabel}>اسم المنتج</Text>
                  <View style={styles.nameInputContainer}>
                    <TextInput
                      style={[styles.modalInput, { flex: 1 }]}
                      placeholder="مثال: حليب كامل الدسم"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      value={manualName}
                      onChangeText={setManualName}
                    />
                    <TouchableOpacity 
                      style={styles.generateBtn}
                      onPress={handleGenerateDescription}
                      disabled={generatingDesc}
                    >
                      {generatingDesc ? (
                        <ActivityIndicator size="small" color={COLORS.primary} />
                      ) : (
                        <>
                          <Ionicons name="sparkles" size={14} color={COLORS.primary} />
                          <Text style={styles.generateBtnText}>توليد الوصف</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Price, Currency, Quantity */}
                <View style={styles.rowFields}>
                  <View style={[styles.modalField, { flex: 1.5 }]}>
                    <Text style={styles.modalLabel}>السعر</Text>
                    <TextInput
                      style={styles.modalInput}
                      keyboardType="numeric"
                      placeholder="0.00"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      value={manualPrice}
                      onChangeText={setManualPrice}
                    />
                  </View>
                  <View style={[styles.modalField, { flex: 1 }]}>
                    <Text style={styles.modalLabel}>العملة</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="SAR"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      value={manualCurrency}
                      onChangeText={setManualCurrency}
                      autoCapitalize="characters"
                    />
                  </View>
                  <View style={[styles.modalField, { flex: 1 }]}>
                    <Text style={styles.modalLabel}>الكمية</Text>
                    <TextInput
                      style={styles.modalInput}
                      keyboardType="numeric"
                      value={manualQty}
                      onChangeText={setManualQty}
                    />
                  </View>
                </View>

                {/* Category Dropdown Simulator */}
                <View style={styles.modalField}>
                  <Text style={styles.modalLabel}>التصنيف</Text>
                  <View style={styles.catChipsWrapper}>
                    {CATEGORIES.slice(1).map((c) => (
                      <TouchableOpacity
                        key={c}
                        style={[
                          styles.modalCatChip,
                          manualCat === c ? styles.activeModalCatChip : null
                        ]}
                        onPress={() => setManualCat(c)}
                      >
                        <Text style={[
                          styles.modalCatChipText,
                          manualCat === c ? styles.activeModalCatChipText : null
                        ]}>
                          {c}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* AI Description/Notes */}
                <View style={styles.modalField}>
                  <Text style={styles.modalLabel}>الوصف والملحوظات (Gemini AI)</Text>
                  <TextInput
                    style={[styles.modalInput, styles.textArea]}
                    multiline={true}
                    numberOfLines={3}
                    placeholder="يمكنك النقر على زر توليد الوصف لتعبئة الحقل تلقائياً بالذكاء الاصطناعي..."
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    value={manualNotes}
                    onChangeText={setManualNotes}
                  />
                </View>

                {/* Submit Manual Add */}
                <TouchableOpacity 
                  style={styles.saveManualBtn}
                  onPress={handleSaveManual}
                  disabled={savingManual}
                >
                  <LinearGradient
                    colors={[COLORS.primary, COLORS.secondary]}
                    style={styles.saveManualBtnGrad}
                  >
                    {savingManual ? (
                      <ActivityIndicator color={COLORS.white} />
                    ) : (
                      <>
                        <Ionicons name="checkmark-done" size={20} color={COLORS.white} />
                        <Text style={styles.saveManualBtnText}>حفظ المنتج والعملية</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <View style={{ height: 40 }} />
              </ScrollView>
            </View>
          </View>
        </Modal>

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
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(76, 201, 240, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(76, 201, 240, 0.15)',
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
  },
  searchSection: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  searchBar: {
    flexDirection: 'row-reverse',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    height: 50,
    alignItems: 'center',
    gap: 12,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    textAlign: 'right',
  },
  catContainer: {
    height: 38,
    marginBottom: 16,
  },
  catScroll: {
    paddingHorizontal: 20,
    flexDirection: 'row-reverse',
    gap: 8,
  },
  catChip: {
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeCatChip: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  catChipText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  activeCatChipText: {
    color: COLORS.background,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 20,
    gap: 16,
    paddingBottom: 100, // Safe padding for bottom tab bar
  },
  productCard: {
    flexDirection: 'row-reverse',
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    alignItems: 'center',
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(76, 201, 240, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 16,
    borderWidth: 1,
    borderColor: 'rgba(76, 201, 240, 0.15)',
  },
  cardInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  productName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  productCat: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  productDesc: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 6,
    textAlign: 'right',
  },
  cardArrow: {
    paddingLeft: 4,
  },
  emptyContainer: {
    padding: 60,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#12131F',
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    height: '85%',
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
  },
  modalForm: {
    gap: 20,
  },
  modalField: {
    gap: 6,
  },
  modalLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
    paddingRight: 4,
  },
  nameInputContainer: {
    flexDirection: 'row-reverse',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 52,
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  modalInput: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 52,
    paddingHorizontal: 16,
    color: COLORS.text,
    fontSize: 14,
    textAlign: 'right',
  },
  generateBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 201, 240, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(76, 201, 240, 0.25)',
    height: 36,
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  generateBtnText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  rowFields: {
    flexDirection: 'row-reverse',
    gap: 12,
  },
  catChipsWrapper: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalCatChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  activeModalCatChip: {
    backgroundColor: 'rgba(76, 201, 240, 0.1)',
    borderColor: COLORS.primary,
  },
  modalCatChipText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  activeModalCatChipText: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  textArea: {
    height: 90,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  saveManualBtn: {
    height: 56,
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 10,
  },
  saveManualBtnGrad: {
    flex: 1,
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  saveManualBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
});

export default ProductList;
