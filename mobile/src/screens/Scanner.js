import React, { useState, useEffect, useRef, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator, Image, Dimensions } from 'react-native';
import { CameraView, requestCameraPermissionsAsync, getCameraPermissionsAsync } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useIsFocused } from '@react-navigation/native';
import { AppContext } from '../context/AppContext';
import { COLORS } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const { width, height } = Dimensions.get('window');

const isValidComponent = (component) => {
  if (!component) return false;
  const type = typeof component;
  return type === 'function' || (type === 'object' && !!component.$$typeof);
};

const IsCameraAvailable = isValidComponent(CameraView);

const Scanner = ({ navigation }) => {
  const { apiUrl } = useContext(AppContext);
  const isFocused = useIsFocused();
  const [hasCameraPermission, setHasCameraPermission] = useState(null);
  const [hasLibraryPermission, setHasLibraryPermission] = useState(null);
  const [type, setType] = useState('back');
  const [flash, setFlash] = useState('off');
  const [scanning, setScanning] = useState(false);
  const [statusText, setStatusText] = useState('وجه الكاميرا نحو الفاتورة');

  const cameraRef = useRef(null);
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  // Request Permissions
  useEffect(() => {
    let active = true;

    const checkCamera = async () => {
      try {
        // First check existing permission
        let statusObj;
        if (typeof getCameraPermissionsAsync === 'function') {
          statusObj = await getCameraPermissionsAsync();
        } else if (CameraView && typeof CameraView.getCameraPermissionsAsync === 'function') {
          statusObj = await CameraView.getCameraPermissionsAsync();
        }

        if (statusObj && statusObj.status === 'granted') {
          if (active) setHasCameraPermission(true);
          return;
        }

        // If not already granted, request with a timeout
        const requestPromise = typeof requestCameraPermissionsAsync === 'function'
          ? requestCameraPermissionsAsync()
          : (CameraView && typeof CameraView.requestCameraPermissionsAsync === 'function'
            ? CameraView.requestCameraPermissionsAsync()
            : Promise.reject(new Error('No request camera permission method found')));

        const result = await Promise.race([
          requestPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Permission request timeout')), 2500))
        ]);

        if (active) {
          setHasCameraPermission(result && result.status === 'granted');
        }
      } catch (err) {
        console.log('Camera permission check error:', err.message);
        if (active) setHasCameraPermission(false);
      }
    };

    const checkLibrary = async () => {
      try {
        // First check existing permission
        let statusObj = await ImagePicker.getMediaLibraryPermissionsAsync();
        if (statusObj && statusObj.status === 'granted') {
          if (active) setHasLibraryPermission(true);
          return;
        }

        // If not already granted, request with a timeout
        const result = await Promise.race([
          ImagePicker.requestMediaLibraryPermissionsAsync(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Permission request timeout')), 2500))
        ]);

        if (active) {
          setHasLibraryPermission(result && result.status === 'granted');
        }
      } catch (err) {
        console.log('Library permission check error:', err.message);
        if (active) setHasLibraryPermission(false);
      }
    };

    checkCamera();
    checkLibrary();

    return () => {
      active = false;
    };
  }, []);

  // Loop scan laser animation
  useEffect(() => {
    if (scanning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          })
        ])
      ).start();
    } else {
      scanLineAnim.stopAnimation();
    }
  }, [scanning]);

  // No full screen blocking loader to prevent infinite hang/stuck UI

  const uploadAndParseImage = async (uri) => {
    setScanning(true);
    setStatusText('يجري معالجة جودة الصورة وتصفيتها...');
    
    try {
      const rawFilename = uri.split('/').pop();
      let cleanFilename = rawFilename.split('?')[0];

      const hasExtension = /\.(png|jpg|jpeg|webp|pdf)$/i.test(cleanFilename);
      if (!hasExtension) {
        cleanFilename = cleanFilename + '.jpg';
      }

      const match = /\.(\w+)$/.exec(cleanFilename);
      const type = match ? `image/${match[1]}` : `image/jpeg`;

      const formData = new FormData();
      formData.append('receipt', { uri, name: cleanFilename, type });

      setStatusText('الذكاء الاصطناعي يقرأ بنود الفاتورة...');

      const response = await axios.post(`${apiUrl}/receipts/scan`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const { receipt } = response.data;
      setScanning(false);

      if (receipt.status === 'NEEDS_REVIEW') {
        navigation.navigate('Review', { receipt });
      } else {
        navigation.navigate('ReceiptDetails', { id: receipt.id, approvedDirectly: true });
      }

    } catch (error) {
      console.log('Scanning upload error:', error.message);
      setScanning(false);
      setStatusText('وجه الكاميرا نحو الفاتورة');
      
      let errorMsg = 'فشل الاتصال بالخادم لمسح الفاتورة.';
      if (error.message && error.message.includes('Network Error')) {
        errorMsg = `فشل الاتصال بالخادم (Network Error).\n\nإذا كنت تستخدم هاتفاً حقيقياً، تأكد من تشغيل الخادم على الحاسوب وتغيير الـ IP في صفحة الإعدادات إلى الـ IP الخاص بحاسوبك بدلاً من localhost.\n\nالرابط الحالي:\n${apiUrl}`;
      } else if (error.response?.data?.error) {
        errorMsg = error.response.data.error;
      }
      alert(errorMsg);
    }
  };

  const takePicture = async () => {
    if (cameraRef.current && !scanning) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
        await uploadAndParseImage(photo.uri);
      } catch (err) {
        alert('فشل التقاط الصورة.');
      }
    }
  };

  const pickImage = async () => {
    if (scanning) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await uploadAndParseImage(result.assets[0].uri);
      }
    } catch (err) {
      alert('فشل اختيار الصورة.');
    }
  };

  const handleManualCreate = async () => {
    setScanning(true);
    setStatusText('جاري إنشاء مسودة فاتورة يدوية...');
    try {
      const res = await axios.post(`${apiUrl}/receipts`, {});
      const { receipt } = res.data;
      setScanning(false);
      navigation.navigate('Review', { receipt });
    } catch (error) {
      console.log('Manual receipt creation error:', error.message);
      setScanning(false);
      alert('فشل إنشاء الفاتورة اليدوية.');
    }
  };

  const toggleFlash = () => {
    setFlash(
      flash === 'off' ? 'on' : 'off'
    );
  };

  const scanLineTranslateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, height * 0.5 - 20],
  });

  const overlayContent = (
    <View style={styles.overlayContainer}>
      
      {/* Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.closeBtn} 
          onPress={() => navigation.navigate('الرئيسية')}
          disabled={scanning}
        >
          <Ionicons name="close" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ماسك الفواتير الذكي</Text>
        <TouchableOpacity style={styles.flashBtn} onPress={toggleFlash} disabled={scanning || !hasCameraPermission}>
          <Ionicons 
            name={flash === 'on' ? 'flash' : 'flash-off'} 
            size={22} 
            color={flash === 'on' ? COLORS.primary : COLORS.white} 
          />
        </TouchableOpacity>
      </View>

      {/* Vision Frame Visor */}
      <View style={styles.visorContainer}>
        <View style={styles.visorFrame}>
          {/* Corner brackets */}
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
          
          {/* Active Laser line */}
          {scanning ? (
            <Animated.View 
              style={[
                styles.laserLine, 
                { transform: [{ translateY: scanLineTranslateY }] }
              ]} 
            />
          ) : null}

          {scanning ? (
            <View style={styles.processingCover}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.processingText}>{statusText}</Text>
            </View>
          ) : hasCameraPermission === null ? (
            <View style={styles.cameraDisabledCover}>
              <ActivityIndicator size="small" color={COLORS.primary} style={{ marginBottom: 12 }} />
              <Text style={styles.cameraDisabledText}>جاري التحقق من صلاحية الكاميرا...</Text>
            </View>
          ) : hasCameraPermission === false ? (
            <View style={styles.cameraDisabledCover}>
              <Ionicons name="camera-outline" size={40} color={COLORS.textSecondary} style={{ marginBottom: 12 }} />
              <Text style={styles.cameraDisabledText}>الكاميرا غير متوفرة</Text>
              <Text style={styles.cameraDisabledSub}>يمكنك اختيار الفاتورة بالضغط على زر المعرض بالأسفل.</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Manual Entry Button */}
      <TouchableOpacity 
        style={styles.manualEntryBtn}
        onPress={handleManualCreate}
        disabled={scanning}
      >
        <Ionicons name="create-outline" size={16} color={COLORS.primary} style={{ marginLeft: 6 }} />
        <Text style={styles.manualEntryBtnText}>إضافة الفاتورة يدوياً (بدون تصوير)</Text>
      </TouchableOpacity>

      {/* Footer Controls */}
      <View style={styles.footer}>
        <Text style={styles.tipText}>
          {scanning 
            ? 'جاري التحليل الفوري...' 
            : hasCameraPermission === null
              ? 'جاري التحقق من الصلاحيات...'
              : !hasCameraPermission 
                ? 'اختر صورة الفاتورة من الاستوديو' 
                : statusText}
        </Text>
        
        <View style={styles.controlsRow}>
          {/* Gallery Import */}
          <TouchableOpacity style={styles.sideControlBtn} onPress={pickImage} disabled={scanning}>
            <Ionicons name="images-outline" size={24} color={COLORS.white} />
          </TouchableOpacity>

          {/* Shutter Shutter */}
          <TouchableOpacity 
            style={styles.shutterOuter}
            onPress={takePicture}
            disabled={scanning || !hasCameraPermission}
          >
            <View style={[styles.shutterInner, !hasCameraPermission ? { backgroundColor: 'rgba(255,255,255,0.08)' } : null]}>
              <Ionicons name="scan-sharp" size={28} color={!hasCameraPermission ? COLORS.textSecondary : COLORS.background} />
            </View>
          </TouchableOpacity>

          {/* Flip Camera */}
          <TouchableOpacity 
            style={styles.sideControlBtn} 
            onPress={() => {
              setType(
                type === 'back' ? 'front' : 'back'
              );
            }}
            disabled={scanning || !hasCameraPermission}
          >
            <Ionicons name="camera-reverse-outline" size={24} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      </View>

    </View>
  );

  return (
    <View style={styles.container}>
      {hasCameraPermission && isFocused && IsCameraAvailable ? (
        <>
          <CameraView 
            style={StyleSheet.absoluteFillObject} 
            facing={type} 
            flash={flash}
            ref={cameraRef}
          />
          {overlayContent}
        </>
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: COLORS.background }]}>
          {overlayContent}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loaderContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  loaderText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 20,
    textAlign: 'center',
  },
  subLoaderText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  overlayContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 110,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flashBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  visorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  visorFrame: {
    width: '100%',
    height: '70%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    position: 'relative',
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: COLORS.primary,
  },
  topLeft: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  topRight: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  bottomLeft: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  bottomRight: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  laserLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 2,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 3,
  },
  processingCover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 11, 15, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  processingText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
    lineHeight: 20,
  },
  footer: {
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  tipText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
  },
  sideControlBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  shutterOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  shutterInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraDisabledCover: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  cameraDisabledText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center',
  },
  cameraDisabledSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  manualEntryBtn: {
    flexDirection: 'row-reverse',
    alignSelf: 'center',
    backgroundColor: 'rgba(76, 201, 240, 0.12)',
    borderColor: COLORS.primary,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualEntryBtnText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
});

export default Scanner;
