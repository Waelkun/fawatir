import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions, Modal, TextInput, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppContext } from '../context/AppContext';
import { COLORS } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';

const { width } = Dimensions.get('window');

const CATEGORIES = ['طعام ومشروبات', 'تقنية وإلكترونيات', 'مواصلات وسيارات', 'ملابس وموضة', 'صحة وعناية شخصية', 'منزل وأثاث', 'أخرى'];

const ProductDetails = ({ route, navigation }) => {
  // If mounted directly as a tab, route.params might be empty, so handle fallback gracefully
  const productId = route.params?.id;
  const { apiUrl, dashboardData, products } = useContext(AppContext);
  const baseCurrency = dashboardData?.baseCurrency || 'SAR';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  // Edit Product State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editProductImage, setEditProductImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const getImageUri = (imagePath) => {
    if (!imagePath) return null;
    if (imagePath.startsWith('http')) return imagePath;
    return apiUrl.replace('/api', '') + imagePath;
  };

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      alert('يرجى السماح بالوصول إلى مكتبة الصور لإرفاق صورة المنتج.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setEditProductImage(result.assets[0].uri);
    }
  };

  const uploadImageToServer = async (uri) => {
    setUploadingImage(true);
    try {
      const formData = new FormData();
      const filename = uri.split('/').pop();
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image`;

      formData.append('image', {
        uri: uri,
        name: filename,
        type: type
      });

      const res = await axios.post(`${apiUrl}/products/upload-image`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return res.data.imageUrl;
    } catch (e) {
      console.log('Error uploading product image:', e.message);
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveProductEdit = async () => {
    if (!editName.trim()) {
      alert('اسم المنتج مطلوب.');
      return;
    }
    setSavingEdit(true);
    try {
      let uploadedUrl = editProductImage;
      if (editProductImage && (editProductImage.startsWith('file:') || editProductImage.startsWith('content:'))) {
        uploadedUrl = await uploadImageToServer(editProductImage);
        if (!uploadedUrl) {
          alert('فشل رفع الصورة للمنتج.');
          setSavingEdit(false);
          return;
        }
      }

      await axios.put(`${apiUrl}/products/${productId}`, {
        name: editName.trim(),
        category: editCategory,
        description: editDescription.trim(),
        imageUrl: uploadedUrl
      });
      setShowEditModal(false);
      alert('تم تعديل المنتج بنجاح.');
      fetchDetails();
    } catch (e) {
      alert(e.response?.data?.error || 'فشل تعديل المنتج.');
    } finally {
      setSavingEdit(false);
    }
  };

  const fetchDetails = async () => {
    if (!productId) {
      // If no product ID is available, load the first product in the list as fallback
      if (products.length > 0) {
        navigation.setParams({ id: products[0].id });
        return;
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await axios.get(`${apiUrl}/products/${productId}`);
      setData(res.data);
    } catch (e) {
      console.log('Error fetching product details:', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [productId, products]);

  if (!productId && products.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="basket-outline" size={48} color={COLORS.textSecondary} />
        <Text style={styles.emptyText}>لم يتم تسجيل أي منتجات في النظام بعد.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>تحميل التحليلات التفصيلية للمنتج...</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>فشل تحميل بيانات المنتج.</Text>
      </View>
    );
  }

  const { product, analytics } = data;

  // Custom Price Trend Line Chart (SVG)
  const renderPriceChart = () => {
    const prices = analytics.priceTrends || [];
    if (prices.length < 2) return null;

    const chartHeight = 100;
    const chartWidth = width - 72;
    const maxVal = Math.max(...prices.map(p => p.priceInBase), 10);
    const minVal = Math.min(...prices.map(p => p.priceInBase), 0);
    const valRange = maxVal - minVal || 10;

    const points = prices.map((item, index) => {
      const x = (index / (prices.length - 1)) * chartWidth;
      const y = chartHeight - ((item.priceInBase - minVal) / valRange) * (chartHeight - 20) - 10;
      return { x, y };
    });

    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      pathD += ` L ${points[i].x} ${points[i].y}`;
    }

    return (
      <View style={styles.chartBox}>
        <Text style={styles.chartTitle}>تغيّر سعر الوحدة ({baseCurrency})</Text>
        <Svg height={chartHeight} width={chartWidth} style={{ marginTop: 10 }}>
          <Line x1="0" y1="10" x2={chartWidth} y2="10" stroke="rgba(255,255,255,0.03)" />
          <Line x1="0" y1="50" x2={chartWidth} y2="50" stroke="rgba(255,255,255,0.03)" />
          <Line x1="0" y1="90" x2={chartWidth} y2="90" stroke="rgba(255,255,255,0.05)" />
          <Path d={pathD} fill="none" stroke={COLORS.primary} strokeWidth="2.5" />
          {points.map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y} r="3.5" fill={COLORS.primary} />
          ))}
        </Svg>
      </View>
    );
  };

  // Custom Spending Bar Chart (SVG)
  const renderSpendingChart = () => {
    const spends = analytics.spendTrends || [];
    if (spends.length === 0) return null;

    const chartHeight = 80;
    const chartWidth = width - 72;
    const maxVal = Math.max(...spends.map(s => s.spendInBase), 10);
    const barWidth = Math.min(18, chartWidth / spends.length - 6);

    return (
      <View style={styles.chartBox}>
        <Text style={styles.chartTitle}>إجمالي الإنفاق لكل عملية شراء ({baseCurrency})</Text>
        <Svg height={chartHeight} width={chartWidth} style={{ marginTop: 15 }}>
          {spends.map((item, index) => {
            const x = (index / spends.length) * chartWidth + (chartWidth / spends.length - barWidth) / 2;
            const barHeight = (item.spendInBase / maxVal) * (chartHeight - 15);
            const y = chartHeight - barHeight;

            return (
              <Rect
                key={index}
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={COLORS.secondary}
                rx="4"
              />
            );
          })}
        </Svg>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.background, '#11121C', COLORS.background]}
        style={styles.gradient}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-forward" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>تحليلات المنتج</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Product Info Heading */}
          <View style={styles.productHeadingCard}>
            <TouchableOpacity 
              style={styles.editProductBtn}
              onPress={() => {
                setEditName(product.name);
                setEditCategory(product.category);
                setEditDescription(product.description || '');
                setEditProductImage(product.imageUrl || null);
                setShowEditModal(true);
              }}
            >
              <Ionicons name="create-outline" size={20} color={COLORS.primary} />
            </TouchableOpacity>

            {product.imageUrl ? (
              <Image source={{ uri: getImageUri(product.imageUrl) }} style={styles.productHeaderImage} />
            ) : (
              <View style={styles.iconContainer}>
                <Ionicons name="basket" size={32} color={COLORS.primary} />
              </View>
            )}
            <Text style={styles.productName}>{product.name}</Text>
            <Text style={styles.productCat}>{product.category}</Text>
            {product.description ? (
              <Text style={styles.productDesc}>{product.description}</Text>
            ) : null}
          </View>

          {/* Quick Metrics Grid */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>إجمالي الإنفاق</Text>
                <Text style={[styles.metricVal, { color: COLORS.primary }]}>
                  {analytics.totalSpend.toFixed(1)} {baseCurrency}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>عدد المشتريات</Text>
                <Text style={styles.metricVal}>{analytics.purchaseCount} مرات</Text>
              </View>
            </View>

            <View style={styles.metricRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>أعلى سعر شراء</Text>
                <Text style={styles.metricVal}>{analytics.maxPrice} {baseCurrency}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>أقل سعر شراء</Text>
                <Text style={styles.metricVal}>{analytics.minPrice} {baseCurrency}</Text>
              </View>
            </View>

            <View style={styles.metricRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>متوسط سعر الوحدة</Text>
                <Text style={styles.metricVal}>{analytics.avgPrice} {baseCurrency}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>آخر مرة شراء</Text>
                <Text style={[styles.metricVal, { fontSize: 12 }]}>
                  {analytics.lastPurchaseDate 
                    ? (() => {
                        try {
                          const d = new Date(analytics.lastPurchaseDate);
                          return new Intl.DateTimeFormat('ar-u-ca-gregory', { day: 'numeric', month: 'numeric', year: 'numeric' }).format(d);
                        } catch (e) {
                          return analytics.lastPurchaseDate.split('T')[0];
                        }
                      })()
                    : 'لا يوجد'
                  }
                </Text>
              </View>
            </View>
          </View>

          {/* Price chart */}
          {renderPriceChart()}

          {/* Spend chart */}
          {renderSpendingChart()}

          {/* Purchase Distribution by Person */}
          <View style={styles.historySection}>
            <Text style={styles.historyTitle}>توزيع المشتريات حسب الأشخاص</Text>
            {analytics.personBreakdown && analytics.personBreakdown.length > 0 ? (
              analytics.personBreakdown.map((person, idx) => (
                <View key={idx} style={styles.personCard}>
                  <View style={styles.personLeft}>
                    <Text style={styles.personTotal}>
                      {person.totalSpend.toFixed(2)} {baseCurrency}
                    </Text>
                    <Text style={styles.personQty}>
                      {person.purchaseCount} {person.purchaseCount === 1 ? 'مرة' : person.purchaseCount === 2 ? 'مرتين' : 'مرات'}
                    </Text>
                  </View>
                  <View style={styles.personRight}>
                    <View style={styles.personInfoRow}>
                      <Text style={styles.personName}>{person.name}</Text>
                      <View style={styles.personEmojiBg}>
                        <Text style={styles.personEmoji}>{person.emoji}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>لا توجد بيانات توزيع.</Text>
            )}
          </View>

          {/* Purchase Log History */}
          <View style={styles.historySection}>
            <Text style={styles.historyTitle}>سجل الشراء التفصيلي</Text>
            {analytics.history && analytics.history.length > 0 ? (
              analytics.history.map((tx, idx) => (
                <View key={idx} style={styles.historyCard}>
                  <View style={styles.historyLeft}>
                    <Text style={styles.historyTotal}>
                      {tx.total.toFixed(2)} {tx.currency}
                    </Text>
                    <Text style={styles.historyQty}>
                      {tx.quantity} وحدات × {tx.price.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={styles.historyStore}>{tx.storeName}</Text>
                    <Text style={styles.historyDate}>
                      {(() => {
                        try {
                          const d = new Date(tx.date);
                          return new Intl.DateTimeFormat('ar-u-ca-gregory', { day: 'numeric', month: 'long' }).format(d);
                        } catch (e) {
                          return tx.date ? tx.date.split('T')[0] : '';
                        }
                      })()}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>لا توجد سجلات شراء سابقة.</Text>
            )}
          </View>

          {/* Bottom padding for tab bar */}
          <View style={{ height: 60 }} />
        </ScrollView>

        {/* Edit Product Modal */}
        <Modal
          visible={showEditModal}
          transparent={true}
          animationType="slide"
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowEditModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.white} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>تعديل بيانات المنتج</Text>
              </View>

              <ScrollView contentContainerStyle={styles.modalForm}>
                {/* Image Picker */}
                <View style={styles.imagePickerContainer}>
                  <Text style={styles.modalLabel}>صورة المنتج</Text>
                  <TouchableOpacity style={styles.pickerBox} onPress={pickImage}>
                    {editProductImage ? (
                      <Image 
                        source={{ uri: editProductImage.startsWith('http') || editProductImage.startsWith('file:') || editProductImage.startsWith('content:') ? editProductImage : getImageUri(editProductImage) }} 
                        style={styles.pickedImage} 
                      />
                    ) : (
                      <View style={{ alignItems: 'center', gap: 6 }}>
                        <Ionicons name="camera-outline" size={28} color={COLORS.primary} />
                        <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>اختر صورة للمنتج</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  {editProductImage && (
                    <TouchableOpacity style={styles.removeImgBtn} onPress={() => setEditProductImage(null)}>
                      <Text style={{ color: '#F44336', fontSize: 11, fontWeight: '700' }}>إزالة الصورة</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Name */}
                <View style={styles.modalField}>
                  <Text style={styles.modalLabel}>اسم المنتج</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="مثال: حليب كامل الدسم"
                    placeholderTextColor="rgba(255,255,255,0.2)"
                  />
                </View>

                {/* Category selector */}
                <View style={styles.modalField}>
                  <Text style={styles.modalLabel}>التصنيف</Text>
                  <View style={styles.catChipsWrapper}>
                    {CATEGORIES.map((c) => (
                      <TouchableOpacity
                        key={c}
                        style={[
                          styles.modalCatChip,
                          editCategory === c ? styles.activeModalCatChip : null
                        ]}
                        onPress={() => setEditCategory(c)}
                      >
                        <Text style={[
                          styles.modalCatChipText,
                          editCategory === c ? styles.activeModalCatChipText : null
                        ]}>
                          {c}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Description */}
                <View style={styles.modalField}>
                  <Text style={styles.modalLabel}>الوصف والملحوظات</Text>
                  <TextInput
                    style={[styles.modalInput, styles.textArea]}
                    multiline={true}
                    numberOfLines={3}
                    value={editDescription}
                    onChangeText={setEditDescription}
                    placeholder="أدخل وصفاً للمنتج..."
                    placeholderTextColor="rgba(255,255,255,0.2)"
                  />
                </View>

                {/* Save Button */}
                <TouchableOpacity 
                  style={styles.saveEditBtn}
                  onPress={handleSaveProductEdit}
                  disabled={savingEdit || uploadingImage}
                >
                  <LinearGradient
                    colors={[COLORS.primary, COLORS.secondary]}
                    style={styles.saveEditBtnGrad}
                  >
                    {savingEdit || uploadingImage ? (
                      <ActivityIndicator color={COLORS.white} />
                    ) : (
                      <>
                        <Ionicons name="checkmark-done" size={20} color={COLORS.white} />
                        <Text style={styles.saveEditBtnText}>حفظ التعديلات</Text>
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
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 16,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  scrollContent: {
    padding: 20,
    gap: 20,
  },
  productHeadingCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    alignItems: 'center',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: 'rgba(76, 201, 240, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(76, 201, 240, 0.15)',
  },
  productName: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  productCat: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
  },
  productDesc: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingTop: 12,
    width: '100%',
  },
  metricsGrid: {
    gap: 12,
  },
  metricRow: {
    flexDirection: 'row-reverse',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    alignItems: 'flex-end',
  },
  metricLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  metricVal: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  chartBox: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
  },
  chartTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  historySection: {
    gap: 12,
  },
  historyTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
    paddingHorizontal: 4,
  },
  historyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    alignItems: 'center',
  },
  historyLeft: {
    alignItems: 'flex-start',
  },
  historyTotal: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  historyQty: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  historyRight: {
    alignItems: 'flex-end',
  },
  historyStore: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  historyDate: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  editProductBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(76, 201, 240, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(76, 201, 240, 0.15)',
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
  saveEditBtn: {
    height: 56,
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 10,
  },
  saveEditBtnGrad: {
    flex: 1,
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  saveEditBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  productHeaderImage: {
    width: 80,
    height: 80,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  // Person breakdown styling
  personCard: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    alignItems: 'center',
  },
  personLeft: {
    alignItems: 'flex-start',
  },
  personTotal: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  personQty: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  personRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  personInfoRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  personEmojiBg: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  personEmoji: {
    fontSize: 18,
  },
  personName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  // Image picker styles
  imagePickerContainer: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  pickerBox: {
    width: 100,
    height: 100,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  pickedImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removeImgBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(244,67,54,0.08)',
  },
});

export default ProductDetails;
