import React, { useContext, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppContext } from '../context/AppContext';
import { COLORS } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import axios from 'axios';

const CURRENCIES = [
  { code: 'SAR', name: 'ريال سعودي (SAR)' },
  { code: 'USD', name: 'دولار أمريكي (USD)' },
  { code: 'EUR', name: 'يورو أوروبي (EUR)' },
  { code: 'TRY', name: 'ليرة تركية (TRY)' }
];

const Settings = () => {
  const { 
    user, 
    apiUrl, 
    updateBaseCurrencySetting, 
    updateCustomApiUrl, 
    logout,
    receipts,
    fetchReceipts,
    monthlyBudget,
    updateMonthlyBudgetSetting
  } = useContext(AppContext);

  const [savingCurrency, setSavingCurrency] = useState(false);
  const [ipAddress, setIpAddress] = useState(apiUrl);
  const [savingIp, setSavingIp] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [budgetValue, setBudgetValue] = useState(monthlyBudget ? monthlyBudget.toString() : '');
  const [savingBudget, setSavingBudget] = useState(false);

  const [exportFilterType, setExportFilterType] = useState('all'); // 'all', 'custom'
  const [exportStartDate, setExportStartDate] = useState(null);
  const [exportEndDate, setExportEndDate] = useState(null);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [tempStartDate, setTempStartDate] = useState(null);
  const [tempEndDate, setTempEndDate] = useState(null);

  // Calendar Helpers for Date Selection
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
    setExportStartDate(tempStartDate);
    setExportEndDate(tempEndDate);
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

  useEffect(() => {
    fetchReceipts();
  }, []);

  useEffect(() => {
    setBudgetValue(monthlyBudget ? monthlyBudget.toString() : '');
  }, [monthlyBudget]);


  const handleCurrencyChange = async (code) => {
    setSavingCurrency(true);
    const res = await updateBaseCurrencySetting(code);
    setSavingCurrency(false);
    if (res.success) {
      alert('تم تحديث العملة الأساسية للحساب.');
    } else {
      alert(res.error);
    }
  };

  const handleIpChange = async () => {
    setSavingIp(true);
    const res = await updateCustomApiUrl(ipAddress);
    setSavingIp(false);
    if (res.success) {
      alert('تم حفظ رابط خادم الـ API بنجاح.');
    } else {
      alert('فشل حفظ إعدادات الـ IP.');
    }
  };

  const handleBudgetChange = async () => {
    setSavingBudget(true);
    const res = await updateMonthlyBudgetSetting(budgetValue);
    setSavingBudget(false);
    if (res.success) {
      alert('تم حفظ الميزانية الشهرية بنجاح.');
    } else {
      alert(res.error || 'فشل حفظ الميزانية.');
    }
  };


  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      if (receipts.length === 0) {
        alert('لا توجد فواتير لتصديرها.');
        setExportingExcel(false);
        return;
      }

      // Filter by range if custom
      let targetReceipts = receipts;
      if (exportFilterType === 'custom' && exportStartDate && exportEndDate) {
        const start = new Date(exportStartDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(exportEndDate);
        end.setHours(23, 59, 59, 999);
        targetReceipts = receipts.filter(r => {
          const d = new Date(r.date);
          return d >= start && d <= end;
        });
      }

      if (targetReceipts.length === 0) {
        alert('لا توجد فواتير لتصديرها في الفترة الزمنية المحددة.');
        setExportingExcel(false);
        return;
      }

      let csvContent = 'معرف الفاتورة,المتجر,التاريخ,المبلغ الإجمالي,العملة,الحالة\n';
      targetReceipts.forEach(r => {
        const dateObj = new Date(r.date);
        let dateStr = '';
        try {
          dateStr = new Intl.DateTimeFormat('ar-u-ca-gregory', { day: 'numeric', month: 'numeric', year: 'numeric' }).format(dateObj);
        } catch (e) {
          dateStr = r.date.split('T')[0];
        }
        const statusText = r.status === 'NEEDS_REVIEW' ? 'يتطلب مراجعة' : 'معتمد';
        csvContent += `${r.id},"${r.storeName}",${dateStr},${r.total},${r.currency},"${statusText}"\n`;
      });

      const fileUri = FileSystem.cacheDirectory + 'fawatir_receipts.csv';
      await FileSystem.writeAsStringAsync(fileUri, '\uFEFF' + csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'تصدير بيانات المصاريف إلى Excel',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        alert('المشاركة غير متاحة على هذا الجهاز.');
      }
    } catch (e) {
      console.log('Failed to export Excel:', e.message);
      alert('فشل تصدير ملف Excel: ' + e.message);
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      if (receipts.length === 0) {
        alert('لا توجد فواتير لتصديرها.');
        setExportingPdf(false);
        return;
      }

      // Filter by range if custom
      let targetReceipts = receipts;
      if (exportFilterType === 'custom' && exportStartDate && exportEndDate) {
        const start = new Date(exportStartDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(exportEndDate);
        end.setHours(23, 59, 59, 999);
        targetReceipts = receipts.filter(r => {
          const d = new Date(r.date);
          return d >= start && d <= end;
        });
      }

      if (targetReceipts.length === 0) {
        alert('لا توجد فواتير لتصديرها في الفترة الزمنية المحددة.');
        setExportingPdf(false);
        return;
      }

      let tableRows = '';
      let totalSum = 0;
      targetReceipts.forEach(r => {
        const dateObj = new Date(r.date);
        let dateStr = '';
        try {
          dateStr = new Intl.DateTimeFormat('ar-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' }).format(dateObj);
        } catch (e) {
          dateStr = r.date.split('T')[0];
        }
        const statusText = r.status === 'NEEDS_REVIEW' ? 'يتطلب مراجعة' : 'معتمد';
        const statusClass = r.status === 'NEEDS_REVIEW' ? 'status-review' : 'status-approved';
        tableRows += `
          <tr>
            <td style="font-weight: bold; text-align: right;">${r.storeName}</td>
            <td style="text-align: right;">${dateStr}</td>
            <td style="font-weight: bold; color: #4CC9F0; text-align: right;">${r.total.toFixed(2)} ${r.currency}</td>
            <td class="${statusClass}" style="text-align: right;">${statusText}</td>
          </tr>
        `;
        totalSum += r.total;
      });

      const reportDate = new Intl.DateTimeFormat('ar-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

      const rangeText = exportFilterType === 'custom' && exportStartDate && exportEndDate
        ? `الفترة المحددة: من ${formatShortDate(exportStartDate)} إلى ${formatShortDate(exportEndDate)}`
        : 'كل البيانات التاريخية';

      const htmlContent = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif;
              color: #e2e8f0;
              padding: 30px;
              background-color: #0b0c13;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #4CC9F0;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .logo-container {
              display: flex;
              align-items: center;
              gap: 10px;
            }
            .logo-text {
              font-size: 28px;
              font-weight: bold;
              color: #ffffff;
            }
            .report-title {
              font-size: 20px;
              font-weight: bold;
              color: #4CC9F0;
            }
            .meta-info {
              margin-bottom: 30px;
              font-size: 14px;
              line-height: 1.8;
              background: rgba(255,255,255,0.03);
              padding: 15px;
              border-radius: 12px;
              border: 1px solid rgba(255,255,255,0.05);
            }
            .stats-grid {
              display: flex;
              gap: 20px;
              margin-bottom: 30px;
            }
            .stat-card {
              flex: 1;
              background: rgba(255,255,255,0.02);
              border: 1px solid rgba(255,255,255,0.05);
              border-radius: 16px;
              padding: 15px;
              text-align: center;
            }
            .stat-val {
              font-size: 22px;
              font-weight: bold;
              color: #ffffff;
              margin-top: 5px;
            }
            .stat-lbl {
              font-size: 12px;
              color: #a0aec0;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
              background: rgba(255,255,255,0.01);
              border-radius: 12px;
              overflow: hidden;
              border: 1px solid rgba(255,255,255,0.05);
            }
            th, td {
              padding: 14px 16px;
              text-align: right;
              border-bottom: 1px solid rgba(255,255,255,0.05);
            }
            th {
              background-color: rgba(255,255,255,0.04);
              color: #4CC9F0;
              font-size: 14px;
              font-weight: bold;
            }
            td {
              font-size: 13px;
              color: #cbd5e0;
            }
            .status-approved {
              color: #2ec4b6;
              font-weight: bold;
            }
            .status-review {
              color: #ffb703;
              font-weight: bold;
            }
            .footer {
              margin-top: 60px;
              text-align: center;
              font-size: 11px;
              color: #718096;
              border-top: 1px solid rgba(255,255,255,0.05);
              padding-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo-container">
              <span class="logo-text">فواتير 🧾</span>
            </div>
            <div class="report-title">تقرير المصروفات والملخص المالي</div>
          </div>
          
          <div class="meta-info">
            <strong>اسم المستخدم:</strong> ${user?.name || 'أليكس'}<br>
            <strong>البريد الإلكتروني:</strong> ${user?.email || 'alex@fintech.ai'}<br>
            <strong>تاريخ استخراج التقرير:</strong> ${reportDate}<br>
            <strong>نطاق التقرير:</strong> ${rangeText}<br>
            <strong>العملة الأساسية:</strong> ${user?.baseCurrency || 'SAR'}
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-lbl">إجمالي الفواتير</div>
              <div class="stat-val">${totalSum.toFixed(2)} ${user?.baseCurrency || 'SAR'}</div>
            </div>
            <div class="stat-card">
              <div class="stat-lbl">الميزانية الشهرية</div>
              <div class="stat-val">${(monthlyBudget || 0).toFixed(2)} ${user?.baseCurrency || 'SAR'}</div>
            </div>
            <div class="stat-card">
              <div class="stat-lbl">عدد المعاملات</div>
              <div class="stat-val">${targetReceipts.length}</div>
            </div>
          </div>

          <h3>سجل الفواتير والمعاملات</h3>
          <table>
            <thead>
              <tr>
                <th style="text-align: right;">المتجر</th>
                <th style="text-align: right;">التاريخ</th>
                <th style="text-align: right;">المبلغ</th>
                <th style="text-align: right;">الحالة</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>

          <div class="footer">
            تم إنشاء هذا التقرير تلقائياً بواسطة تطبيق فواتير لتتبع وإدارة المصروفات بالذكاء الاصطناعي.
          </div>
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      const pdfUri = FileSystem.cacheDirectory + 'fawatir_report.pdf';
      await FileSystem.moveAsync({
        from: uri,
        to: pdfUri,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'تصدير تقرير المصروفات PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        alert('المشاركة غير متاحة على هذا الجهاز.');
      }
    } catch (e) {
      console.log('Failed to export PDF:', e.message);
      alert('فشل تصدير ملف PDF: ' + e.message);
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.background, '#11121C', COLORS.background]}
        style={styles.gradient}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ width: 40 }} />
          <Text style={styles.headerTitle}>الملف الشخصي والإعدادات</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          
          {/* User Profile Card */}
          <View style={styles.profileCard}>
            <View style={styles.avatarLarge}>
              <Ionicons name="person" size={36} color={COLORS.primary} />
            </View>
            <Text style={styles.userName}>{user?.name || 'أليكس ستيرلينغ'}</Text>
            <Text style={styles.userEmail}>{user?.email || 'alex@fintech.ai'}</Text>
            
            <View style={styles.badgeRow}>
              <Text style={styles.badgeText}>مستخدم متميز</Text>
              <Ionicons name="shield-checkmark" size={14} color={COLORS.primary} />
            </View>
          </View>

          {/* Base Currency selection */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>العملة الأساسية للتقارير والتحليلات</Text>
            <View style={styles.currencyOptions}>
              {CURRENCIES.map((cur) => (
                <TouchableOpacity
                  key={cur.code}
                  style={[
                    styles.currencyBtn,
                    user?.baseCurrency === cur.code ? styles.activeCurrencyBtn : null
                  ]}
                  onPress={() => handleCurrencyChange(cur.code)}
                  disabled={savingCurrency}
                >
                  <Text style={[
                    styles.currencyBtnText,
                    user?.baseCurrency === cur.code ? styles.activeCurrencyBtnText : null
                  ]}>
                    {cur.name}
                  </Text>
                  <Ionicons 
                    name={user?.baseCurrency === cur.code ? 'radio-button-on' : 'radio-button-off'} 
                    size={18} 
                    color={user?.baseCurrency === cur.code ? COLORS.primary : COLORS.textSecondary} 
                  />
                </TouchableOpacity>
              ))}
            </View>
            {savingCurrency ? <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 8 }} /> : null}
          </View>

          {/* Backend Connection IP */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>إعدادات خادم الـ API (المطورين)</Text>
            <Text style={styles.ipDesc}>
              لتوصيل هاتفك الشخصي، قم بكتابة عنوان الـ IP الخاص بحاسوبك بدلاً من localhost:
            </Text>
            <View style={styles.ipRow}>
              <TextInput
                style={styles.ipInput}
                value={ipAddress}
                onChangeText={setIpAddress}
                placeholder="http://192.168.1.5:5000/api"
                placeholderTextColor="rgba(255,255,255,0.2)"
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.ipSaveBtn} onPress={handleIpChange} disabled={savingIp}>
                {savingIp ? (
                  <ActivityIndicator size="small" color={COLORS.background} />
                ) : (
                  <Text style={styles.ipSaveBtnText}>حفظ</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Data Export Options */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>تصدير وتخزين البيانات</Text>
            <Text style={styles.ipDesc}>
              قم بتصدير فواتيرك ومعاملاتك المالية بصيغ مختلفة لحفظها أو مشاركتها:
            </Text>

            {/* Filter Toggle */}
            <View style={styles.exportFilterToggleRow}>
              <TouchableOpacity 
                style={[styles.exportFilterBtn, exportFilterType === 'all' ? styles.activeExportFilterBtn : null]}
                onPress={() => setExportFilterType('all')}
              >
                <Text style={[styles.exportFilterBtnText, exportFilterType === 'all' ? styles.activeExportFilterBtnText : null]}>
                  تصدير كل الفواتير
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.exportFilterBtn, exportFilterType === 'custom' ? styles.activeExportFilterBtn : null]}
                onPress={() => {
                  setExportFilterType('custom');
                  setTempStartDate(exportStartDate);
                  setTempEndDate(exportEndDate);
                  setShowCalendarModal(true);
                }}
              >
                <Text style={[styles.exportFilterBtnText, exportFilterType === 'custom' ? styles.activeExportFilterBtnText : null]}>
                  تصدير فترة محددة
                </Text>
              </TouchableOpacity>
            </View>

            {/* Selected Range Display */}
            {exportFilterType === 'custom' && exportStartDate && exportEndDate && (
              <TouchableOpacity 
                style={styles.selectedRangeDisplay}
                onPress={() => {
                  setTempStartDate(exportStartDate);
                  setTempEndDate(exportEndDate);
                  setShowCalendarModal(true);
                }}
              >
                <Ionicons name="calendar-outline" size={16} color={COLORS.primary} />
                <Text style={styles.selectedRangeDisplayText}>
                  الفترة المختارة: {formatShortDate(exportStartDate)} - {formatShortDate(exportEndDate)}
                </Text>
                <Text style={{ fontSize: 11, color: COLORS.primary, marginRight: 'auto', fontWeight: '600' }}>تعديل</Text>
              </TouchableOpacity>
            )}

            <View style={{ height: 16 }} />
            
            {/* Export Excel Button */}
            <TouchableOpacity 
              style={[styles.exportBtn, { marginBottom: 12 }]} 
              onPress={handleExportExcel}
              disabled={exportingExcel}
            >
              {exportingExcel ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <>
                  <Ionicons name="grid-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.exportBtnText}>تصدير كملف Excel (CSV)</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Export PDF Button */}
            <TouchableOpacity 
              style={styles.exportBtn} 
              onPress={handleExportPdf}
              disabled={exportingPdf}
            >
              {exportingPdf ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.exportBtnText}>تصدير كتقرير PDF مميز</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Logout button */}
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
            <Text style={styles.logoutBtnText}>تسجيل الخروج من الحساب</Text>
          </TouchableOpacity>

          {/* Custom Calendar Picker Modal */}
          <Modal
            visible={showCalendarModal}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setShowCalendarModal(false)}
          >
            <View style={styles.calendarModalOverlay}>
              <View style={styles.calendarModalContent}>
                {/* Header */}
                <View style={styles.calendarHeader}>
                  <TouchableOpacity onPress={() => setShowCalendarModal(false)}>
                    <Ionicons name="close" size={24} color={COLORS.white} />
                  </TouchableOpacity>
                  <Text style={styles.calendarTitle}>اختر الفترة الزمنية للتصدير</Text>
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

          <View style={{ height: 100 }} />
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
  headerTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 20,
    gap: 24,
  },
  profileCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    alignItems: 'center',
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(76, 201, 240, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(76, 201, 240, 0.2)',
    marginBottom: 16,
  },
  userName: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  userEmail: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginBottom: 16,
  },
  badgeRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 201, 240, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(76, 201, 240, 0.15)',
  },
  badgeText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
  },
  sectionHeading: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
    marginBottom: 16,
  },
  currencyOptions: {
    gap: 8,
  },
  currencyBtn: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  activeCurrencyBtn: {},
  currencyBtnText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  activeCurrencyBtnText: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  ipDesc: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 18,
    textAlign: 'right',
    marginBottom: 12,
  },
  ipRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  ipInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 14,
    color: COLORS.text,
    fontSize: 13,
  },
  ipSaveBtn: {
    backgroundColor: COLORS.primary,
    height: 44,
    width: 60,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ipSaveBtnText: {
    color: COLORS.background,
    fontSize: 13,
    fontWeight: '700',
  },
  exportBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    height: 50,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
  },
  exportBtnText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  logoutBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    backgroundColor: 'rgba(255, 94, 94, 0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 94, 94, 0.15)',
  },
  logoutBtnText: {
    color: COLORS.error,
    fontSize: 14,
    fontWeight: '700',
  },
  exportFilterToggleRow: {
    flexDirection: 'row-reverse',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 4,
    marginBottom: 16,
    justifyContent: 'space-between',
  },
  exportFilterBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeExportFilterBtn: {
    backgroundColor: COLORS.primary,
  },
  exportFilterBtnText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  activeExportFilterBtnText: {
    color: COLORS.background,
    fontWeight: '700',
  },
  selectedRangeDisplay: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 201, 240, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(76, 201, 240, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  selectedRangeDisplayText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
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
    width: '90%',
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
    width: '14.2%',
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginBottom: 16,
  },
  dayCell: {
    width: '14.2%',
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
});

export default Settings;
