import React, { useContext, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, TextInput, FlatList, Modal, Image, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { AppContext } from '../context/AppContext';
import { COLORS } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const { width } = Dimensions.get('window');

const PRODUCT_CATEGORIES = ['الكل', 'طعام ومشروبات', 'تقنية وإلكترونيات', 'مواصلات وسيارات', 'ملابس وموضة', 'صحة وعناية شخصية', 'منزل وأثاث', 'أخرى'];

const Logs = ({ navigation }) => {
  const { 
    apiUrl, 
    dashboardData, 
    fetchDashboardData, 
    wallets, 
    fetchWallets, 
    people, 
    fetchPeople,
    updateWalletTransaction,
    deleteWalletTransaction
  } = useContext(AppContext);

  const baseCurrency = dashboardData?.baseCurrency || 'SAR';

  const [activeTab, setActiveTab] = useState('transactions'); // 'transactions' | 'products'
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Transactions ledger filter states
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState('all'); // 'all', 'expenses', 'deposits'
  const [ledgerPersonFilter, setLedgerPersonFilter] = useState('all'); // 'all', 'user', or personId (number)

  // Edit Transaction states
  const [editTx, setEditTx] = useState(null);
  const [showEditTxModal, setShowEditTxModal] = useState(false);
  const [editTxType, setEditTxType] = useState('DEPOSIT');
  const [editTxAmount, setEditTxAmount] = useState('');
  const [editTxDesc, setEditTxDesc] = useState('');
  const [editTxDate, setEditTxDate] = useState('');
  const [savingEditTx, setSavingEditTx] = useState(false);

  // Products catalog states
  const [products, setProducts] = useState([]);
  const [selectedProductCategory, setSelectedProductCategory] = useState('الكل');
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Add Product states
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCat, setNewProductCat] = useState('طعام ومشروبات');
  const [newProductDesc, setNewProductDesc] = useState('');
  const [newProductImage, setNewProductImage] = useState(null); // Local URI
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);

  // Load everything
  const loadData = useCallback(async () => {
    setLoading(true);
    await fetchDashboardData();
    await fetchWallets();
    await fetchPeople();
    await loadProducts();
    setLoading(false);
  }, [fetchDashboardData, fetchWallets, fetchPeople]);

  const loadProducts = async () => {
    setLoadingProducts(true);
    try {
      const res = await axios.get(`${apiUrl}/products`);
      setProducts(res.data.products);
    } catch (e) {
      console.log('Failed to fetch products:', e.message);
    } finally {
      setLoadingProducts(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDashboardData();
    await fetchWallets();
    await fetchPeople();
    await loadProducts();
    setRefreshing(false);
  }, [fetchDashboardData, fetchWallets, fetchPeople]);

  // Helper to map relative uploaded path to absolute server URL
  const getImageUri = (imagePath) => {
    if (!imagePath) return null;
    if (imagePath.startsWith('http')) return imagePath;
    return apiUrl.replace('/api', '') + imagePath;
  };

  // Image picking handler
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
      setNewProductImage(result.assets[0].uri);
    }
  };

  // Server upload image handler
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

  // Create Product handler
  const handleSaveProduct = async () => {
    if (!newProductName.trim()) {
      alert('اسم المنتج مطلوب.');
      return;
    }

    setSavingProduct(true);
    try {
      let uploadedUrl = null;
      if (newProductImage) {
        uploadedUrl = await uploadImageToServer(newProductImage);
      }

      await axios.post(`${apiUrl}/products`, {
        name: newProductName.trim(),
        category: newProductCat,
        description: newProductDesc.trim(),
        imageUrl: uploadedUrl
      });

      setNewProductName('');
      setNewProductDesc('');
      setNewProductImage(null);
      setShowAddProductModal(false);
      alert('تم حفظ المنتج بنجاح.');
      await loadProducts();
    } catch (e) {
      alert(e.response?.data?.error || 'فشل حفظ المنتج.');
    } finally {
      setSavingProduct(false);
    }
  };

  // Edit Manual Transaction functions
  const handleOpenEditTx = (item) => {
    const txId = parseInt(item.id.replace('manual-', ''));
    const absAmount = Math.abs(item.amount);
    setEditTx({ ...item, dbId: txId });
    setEditTxType(item.amount >= 0 ? 'DEPOSIT' : 'WITHDRAW');
    setEditTxAmount(absAmount.toFixed(2));
    setEditTxDesc(item.description);
    setEditTxDate(item.date ? new Date(item.date).toISOString().split('T')[0] : '');
    setShowEditTxModal(true);
  };

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
      editTx.walletId || wallets[0]?.id,
      editTx.dbId,
      signedAmount,
      editTxDesc.trim(),
      editTxDate || undefined
    );
    setSavingEditTx(false);

    if (res.success) {
      setShowEditTxModal(false);
      setEditTx(null);
      await fetchDashboardData();
    } else {
      alert(res.error);
    }
  };

  const handleDeleteTx = async (item) => {
    const txId = parseInt(item.id.replace('manual-', ''));
    if (confirm('هل أنت متأكد من حذف هذه المعاملة؟')) {
      const res = await deleteWalletTransaction(item.walletId || wallets[0]?.id, txId);
      if (res.success) {
        await fetchDashboardData();
      } else {
        alert(res.error);
      }
    }
  };

  // Filter Transactions Logic
  const getFilteredTransactions = () => {
    let txs = dashboardData?.allTransactions || [];

    // Filter by Search text
    if (search.trim()) {
      const q = search.toLowerCase();
      txs = txs.filter(t => 
        t.description.toLowerCase().includes(q) || 
        Math.abs(t.amount).toString().includes(q)
      );
    }

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

  // Filter Products Logic
  const getFilteredProducts = () => {
    let prods = products || [];

    // Filter by search text
    if (search.trim()) {
      const q = search.toLowerCase();
      prods = prods.filter(p => 
        p.name.toLowerCase().includes(q) || 
        (p.description && p.description.toLowerCase().includes(q))
      );
    }

    // Filter by Category
    if (selectedProductCategory !== 'الكل') {
      prods = prods.filter(p => p.category === selectedProductCategory);
    }

    return prods;
  };

  // Calculate totals for currently filtered transactions
  const filteredTxs = getFilteredTransactions();
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

  const filteredProducts = getFilteredProducts();

  return (
    <View style={styles.container}>
      <LinearGradient colors={[COLORS.background, '#11121C', COLORS.background]} style={styles.gradient}>
        
        {/* Top Header */}
        <View style={styles.header}>
          {activeTab === 'products' ? (
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddProductModal(true)}>
              <Ionicons name="add" size={24} color={COLORS.primary} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
          <Text style={styles.headerTitle}>أرشيف السجلات والبيانات</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Tab Selector */}
        <View style={styles.segmentContainer}>
          <TouchableOpacity 
            style={[styles.segmentBtn, activeTab === 'transactions' && styles.segmentBtnActive]}
            onPress={() => {
              setActiveTab('transactions');
              setSearch('');
            }}
          >
            <Text style={[styles.segmentText, activeTab === 'transactions' && styles.segmentTextActive]}>سجل المعاملات المالية</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.segmentBtn, activeTab === 'products' && styles.segmentBtnActive]}
            onPress={() => {
              setActiveTab('products');
              setSearch('');
            }}
          >
            <Text style={[styles.segmentText, activeTab === 'products' && styles.segmentTextActive]}>المنتجات المسجلة</Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={20} color={COLORS.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder={activeTab === 'transactions' ? "ابحث بالبيان، الوصف أو القيمة..." : "ابحث بالاسم، الوصف والملحوظات..."}
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={search}
              onChangeText={setSearch}
            />
          </View>
        </View>

        {/* Render Transaction tab or Products tab */}
        {activeTab === 'transactions' ? (
          /* TRANSACTION LEDGER VIEW */
          <FlatList
            data={filteredTxs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshing={refreshing}
            onRefresh={onRefresh}
            ListHeaderComponent={
              <View style={{ gap: 12, marginBottom: 12 }}>
                {/* Filters Row */}
                <View style={styles.ledgerFiltersContainer}>
                  {/* Type Filter */}
                  <View style={styles.ledgerFilterRow}>
                    <Text style={styles.ledgerFilterLabel}>نوع الحركة:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ledgerFilterChips}>
                      <TouchableOpacity 
                        style={[styles.filterChip, ledgerTypeFilter === 'all' && styles.filterChipActive]}
                        onPress={() => setLedgerTypeFilter('all')}
                      >
                        <Text style={[styles.filterChipText, ledgerTypeFilter === 'all' && styles.filterChipTextActive]}>الكل</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.filterChip, ledgerTypeFilter === 'expenses' && styles.filterChipActive]}
                        onPress={() => setLedgerTypeFilter('expenses')}
                      >
                        <Text style={[styles.filterChipText, ledgerTypeFilter === 'expenses' && styles.filterChipTextActive]}>مصاريف (-)</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.filterChip, ledgerTypeFilter === 'deposits' && styles.filterChipActive]}
                        onPress={() => setLedgerTypeFilter('deposits')}
                      >
                        <Text style={[styles.filterChipText, ledgerTypeFilter === 'deposits' && styles.filterChipTextActive]}>إيداعات (+)</Text>
                      </TouchableOpacity>
                    </ScrollView>
                  </View>

                  {/* Person Filter */}
                  <View style={[styles.ledgerFilterRow, { marginTop: 8 }]}>
                    <Text style={styles.ledgerFilterLabel}>حسب الشخص:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ledgerFilterChips}>
                      <TouchableOpacity 
                        style={[styles.filterChip, ledgerPersonFilter === 'all' && styles.filterChipActive]}
                        onPress={() => setLedgerPersonFilter('all')}
                      >
                        <Text style={[styles.filterChipText, ledgerPersonFilter === 'all' && styles.filterChipTextActive]}>الجميع</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.filterChip, ledgerPersonFilter === 'user' && styles.filterChipActive]}
                        onPress={() => setLedgerPersonFilter('user')}
                      >
                        <Text style={[styles.filterChipText, ledgerPersonFilter === 'user' && styles.filterChipTextActive]}>أنا</Text>
                      </TouchableOpacity>
                      {people && people.map(p => (
                        <TouchableOpacity 
                          key={p.id}
                          style={[styles.filterChip, ledgerPersonFilter === p.id && styles.filterChipActive]}
                          onPress={() => setLedgerPersonFilter(p.id)}
                        >
                          <Text style={[styles.filterChipText, ledgerPersonFilter === p.id && styles.filterChipTextActive]}>{p.emoji} {p.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>

                {/* Totals Summary */}
                <View style={styles.totalsSummaryCard}>
                  <View style={styles.totalSummaryItem}>
                    <Text style={styles.totalSummaryLabel}>إجمالي المقبوضات (+)</Text>
                    <Text style={[styles.totalSummaryValue, { color: '#4CAF50' }]}>
                      {viewInflow.toLocaleString('en-US', { minimumFractionDigits: 2 })} {baseCurrency}
                    </Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.08)', height: '80%' }} />
                  <View style={styles.totalSummaryItem}>
                    <Text style={styles.totalSummaryLabel}>إجمالي المصاريف (-)</Text>
                    <Text style={[styles.totalSummaryValue, { color: '#F44336' }]}>
                      {viewOutflow.toLocaleString('en-US', { minimumFractionDigits: 2 })} {baseCurrency}
                    </Text>
                  </View>
                </View>
              </View>
            }
            renderItem={({ item }) => {
              let displayAmount = item.amount;
              let displayDesc = item.description;

              if (ledgerPersonFilter !== 'all' && ledgerPersonFilter !== 'user') {
                const targetPersonId = ledgerPersonFilter;
                if (item.type === 'RECEIPT') {
                  displayAmount = -(item.shares?.[targetPersonId] || 0);
                  displayDesc = `${item.description} (حصة ${people.find(p => p.id === targetPersonId)?.name || ''})`;
                } else if (item.type === 'SETTLEMENT') {
                  displayAmount = -item.amount;
                }
              } else if (ledgerPersonFilter === 'user') {
                if (item.type === 'RECEIPT') {
                  displayAmount = -(item.shares?.user || 0);
                  displayDesc = `${item.description} (حصتي)`;
                }
              }

              const isPositive = displayAmount >= 0;

              return (
                <View style={styles.transactionCard}>
                  <TouchableOpacity
                    style={{ flex: 1, flexDirection: 'row-reverse', alignItems: 'center' }}
                    onPress={() => {
                      if (item.type === 'RECEIPT') {
                        navigation.navigate('ReceiptDetails', { id: item.dbId });
                      }
                    }}
                  >
                    <View style={styles.txIconContainer}>
                      <Ionicons 
                        name={
                          item.type === 'RECEIPT' ? 'receipt-outline' :
                          item.type === 'DEPOSIT' ? 'arrow-down-circle-outline' :
                          item.type === 'WITHDRAW' ? 'arrow-up-circle-outline' :
                          'swap-horizontal-outline'
                        } 
                        size={20} 
                        color={isPositive ? '#4CAF50' : '#F44336'} 
                      />
                    </View>
                    <View style={styles.txInfo}>
                      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.txStore}>{displayDesc}</Text>
                        {item.type === 'MANUAL' && (
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity onPress={() => handleOpenEditTx(item)}>
                              <Ionicons name="pencil" size={13} color={COLORS.primary} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleDeleteTx(item)}>
                              <Ionicons name="trash" size={13} color="#F44336" />
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <Text style={styles.txDate}>
                          {new Date(item.date).toLocaleDateString('ar-u-ca-gregory', { day: 'numeric', month: 'short' })}
                        </Text>
                        {item.walletName && <Text style={styles.txWalletTag}>👛 {item.walletName}</Text>}
                        {item.payerName && <Text style={styles.txWalletTag}>👤 الدافع: {item.payerName}</Text>}
                      </View>
                    </View>
                    <View style={styles.txPriceCol}>
                      <Text style={[styles.txAmount, { color: isPositive ? '#4CAF50' : '#F44336' }]}>
                        {isPositive ? '+' : ''}{displayAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {baseCurrency}
                      </Text>
                      <Text style={styles.txStatus}>
                        {item.type === 'RECEIPT' ? '🧾 فاتورة' :
                         item.type === 'DEPOSIT' ? '📥 إيداع' :
                         item.type === 'WITHDRAW' ? '📤 سحب' :
                         '🤝 تسوية'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="list-outline" size={48} color={COLORS.textSecondary} />
                <Text style={styles.emptyText}>لا توجد معاملات مسجلة تطابق خيارات التصفية.</Text>
              </View>
            }
          />
        ) : (
          /* REGISTERED PRODUCTS VIEW */
          <FlatList
            data={filteredProducts}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.listContent}
            refreshing={refreshing}
            onRefresh={onRefresh}
            ListHeaderComponent={
              /* Category list for product filtering */
              <View style={styles.catContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
                  {PRODUCT_CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.catChip, selectedProductCategory === cat ? styles.activeCatChip : null]}
                      onPress={() => setSelectedProductCategory(cat)}
                    >
                      <Text style={[styles.catChipText, selectedProductCategory === cat ? styles.activeCatChipText : null]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            }
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
                
                {/* Product Thumbnail with image or basket icon */}
                <View style={styles.productImgCircle}>
                  {item.imageUrl ? (
                    <Image source={{ uri: getImageUri(item.imageUrl) }} style={styles.productThumbnail} />
                  ) : (
                    <Ionicons name="basket-sharp" size={20} color={COLORS.primary} />
                  )}
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              loadingProducts ? (
                <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 30 }} />
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="basket-outline" size={48} color={COLORS.textSecondary} />
                  <Text style={styles.emptyText}>لا توجد منتجات مسجلة تطابق البحث.</Text>
                </View>
              )
            }
          />
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* EDIT MANUAL TRANSACTION MODAL */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <Modal visible={showEditTxModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowEditTxModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.white} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>تعديل المعاملة اليدوية</Text>
                <View style={{ width: 24 }} />
              </View>

              <View style={styles.modalFormCard}>
                <Text style={styles.modalLabel}>نوع العملية</Text>
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

                <Text style={styles.modalLabel}>المبلغ</Text>
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

                <Text style={styles.modalLabel}>الوصف والبيان</Text>
                <View style={styles.adjustInputRow}>
                  <TextInput
                    style={[styles.adjustTextInput, { flex: 1 }]}
                    placeholder="مثال: زيادة رصيد..."
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    value={editTxDesc}
                    onChangeText={setEditTxDesc}
                    textAlign="right"
                  />
                </View>
                
                <TouchableOpacity 
                  style={styles.saveEditBtn} 
                  onPress={handleSaveEditTx}
                  disabled={savingEditTx}
                >
                  <LinearGradient colors={[COLORS.primary, COLORS.secondary]} style={styles.saveEditBtnGrad}>
                    {savingEditTx ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={16} color="#fff" />
                        <Text style={styles.saveEditBtnText}>حفظ التعديلات</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* ADD REGISTERED PRODUCT MODAL */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <Modal visible={showAddProductModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowAddProductModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.white} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>إضافة منتج موحد جديد</Text>
                <View style={{ width: 24 }} />
              </View>

              <ScrollView contentContainerStyle={styles.modalForm}>
                {/* Image Picker */}
                <View style={styles.imagePickerContainer}>
                  <Text style={styles.modalLabel}>صورة المنتج</Text>
                  <TouchableOpacity style={styles.pickerBox} onPress={pickImage}>
                    {newProductImage ? (
                      <Image source={{ uri: newProductImage }} style={styles.pickedImage} />
                    ) : (
                      <View style={{ alignItems: 'center', gap: 6 }}>
                        <Ionicons name="camera-outline" size={28} color={COLORS.primary} />
                        <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>اختر صورة للمنتج</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  {newProductImage && (
                    <TouchableOpacity style={styles.removeImgBtn} onPress={() => setNewProductImage(null)}>
                      <Text style={{ color: '#F44336', fontSize: 11, fontWeight: '700' }}>إزالة الصورة</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Name */}
                <View style={styles.modalField}>
                  <Text style={styles.modalLabel}>اسم المنتج</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="مثال: لحم بقري مفروم"
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    value={newProductName}
                    onChangeText={setNewProductName}
                  />
                </View>

                {/* Category Selection */}
                <View style={styles.modalField}>
                  <Text style={styles.modalLabel}>التصنيف</Text>
                  <View style={styles.catChipsWrapper}>
                    {PRODUCT_CATEGORIES.slice(1).map((c) => (
                      <TouchableOpacity
                        key={c}
                        style={[styles.modalCatChip, newProductCat === c ? styles.activeModalCatChip : null]}
                        onPress={() => setNewProductCat(c)}
                      >
                        <Text style={[styles.modalCatChipText, newProductCat === c ? styles.activeModalCatChipText : null]}>
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
                    multiline
                    numberOfLines={3}
                    placeholder="تفاصيل ووصف المنتج..."
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    value={newProductDesc}
                    onChangeText={setNewProductDesc}
                  />
                </View>

                {/* Save Product Button */}
                <TouchableOpacity 
                  style={styles.saveProductBtn}
                  onPress={handleSaveProduct}
                  disabled={savingProduct || uploadingImage}
                >
                  <LinearGradient colors={[COLORS.primary, COLORS.secondary]} style={styles.saveProductBtnGrad}>
                    {savingProduct || uploadingImage ? (
                      <ActivityIndicator color={COLORS.white} />
                    ) : (
                      <>
                        <Ionicons name="checkmark-done" size={20} color={COLORS.white} />
                        <Text style={styles.saveProductBtnText}>حفظ المنتج</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <View style={{ height: 30 }} />
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
  headerTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(76, 201, 240, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(76, 201, 240, 0.15)',
  },
  segmentContainer: {
    flexDirection: 'row-reverse',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginHorizontal: 20,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: COLORS.primary,
  },
  segmentText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: COLORS.background,
    fontWeight: '700',
  },
  searchSection: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: 'row-reverse',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    height: 48,
    alignItems: 'center',
    gap: 12,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 13,
    textAlign: 'right',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 110,
    gap: 12,
  },
  ledgerFiltersContainer: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
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
  transactionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  txIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
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
  },
  txWalletTag: {
    color: COLORS.primary,
    fontSize: 9,
    backgroundColor: 'rgba(76, 201, 240, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
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
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
  // Products tab styles
  catContainer: {
    height: 38,
    marginBottom: 8,
  },
  catScroll: {
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
    fontSize: 11,
    fontWeight: '600',
  },
  activeCatChipText: {
    color: COLORS.background,
    fontWeight: '700',
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
  productImgCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(76, 201, 240, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 14,
    borderWidth: 1,
    borderColor: 'rgba(76, 201, 240, 0.15)',
    overflow: 'hidden',
  },
  productThumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  cardInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  productName: {
    color: COLORS.text,
    fontSize: 14,
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
    fontSize: 11,
    marginTop: 6,
    textAlign: 'right',
  },
  cardArrow: {
    paddingLeft: 4,
  },
  // Modal forms
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#12131F',
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    maxHeight: '90%',
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
    fontSize: 16,
    fontWeight: '700',
  },
  modalFormCard: {
    gap: 12,
  },
  modalForm: {
    gap: 16,
  },
  modalField: {
    gap: 6,
  },
  modalLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
    paddingRight: 4,
  },
  modalInput: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 48,
    paddingHorizontal: 16,
    color: COLORS.text,
    fontSize: 13,
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
    height: 80,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  saveProductBtn: {
    height: 52,
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 10,
  },
  saveProductBtnGrad: {
    flex: 1,
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  saveProductBtnText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
  },
  saveEditBtn: {
    height: 52,
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
    fontSize: 15,
    fontWeight: '700',
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

export default Logs;
