import React, { useState, useContext } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppContext } from '../context/AppContext';
import { COLORS } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';

const Login = ({ navigation }) => {
  const { loginByName, apiUrl, updateCustomApiUrl } = useContext(AppContext);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Server connection states
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [customIp, setCustomIp] = useState(apiUrl);
  const [ipSaved, setIpSaved] = useState(false);

  const handleLogin = async () => {
    if (!name.trim()) {
      setError('يرجى إدخال اسمك للمتابعة.');
      return;
    }
    setError('');
    setLoading(true);
    
    const result = await loginByName(name.trim());
    setLoading(false);
    
    if (!result.success) {
      setError(result.error);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <LinearGradient
        colors={[COLORS.background, '#12131F', COLORS.background]}
        style={styles.gradient}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          {/* Header Branding */}
          <View style={styles.header}>
            <Text style={styles.brand}>FAWATIR.AI</Text>
            <Text style={styles.title}>مرحباً بك في فواتير</Text>
            <Text style={styles.subtitle}>أدخل اسمك لحفظ وإدارة مصاريفك بسهولة</Text>
          </View>

          {/* Server Connection Settings */}
          <TouchableOpacity 
            style={styles.settingsToggle}
            onPress={() => {
              setShowServerSettings(!showServerSettings);
              setIpSaved(false);
            }}
          >
            <Ionicons name="server-outline" size={16} color={COLORS.primary} />
            <Text style={styles.settingsToggleText}>إعدادات الاتصال بالخادم (لتشغيل الجوال)</Text>
          </TouchableOpacity>

          {showServerSettings && (
            <View style={styles.serverSettingsCard}>
              <Text style={styles.ipDesc}>
                اكتب عنوان IP الحاسوب الذي يشغل السيرفر (مثال: http://192.168.1.15:5000/api):
              </Text>
              <View style={styles.ipInputRow}>
                <TextInput
                  style={styles.ipInput}
                  value={customIp}
                  onChangeText={(val) => {
                    setCustomIp(val);
                    setIpSaved(false);
                  }}
                  autoCapitalize="none"
                  placeholder="http://192.168.1.X:5000/api"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />
                <TouchableOpacity 
                  style={styles.ipSaveButton}
                  onPress={async () => {
                    await updateCustomApiUrl(customIp);
                    setIpSaved(true);
                  }}
                >
                  <Text style={styles.ipSaveButtonText}>
                    {ipSaved ? 'تم الحفظ!' : 'حفظ'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Form */}
          <View style={styles.form}>
            {error ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={18} color={COLORS.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Name Field */}
            <View style={styles.inputWrapper}>
              <Text style={styles.label}>اسم المستخدم</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="مثال: أحمد، سارة..."
                  placeholderTextColor="rgba(255, 255, 255, 0.3)"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            </View>

            {/* Submit Button */}
            <TouchableOpacity 
              style={styles.button}
              onPress={handleLogin}
              disabled={loading}
            >
              <LinearGradient
                colors={[COLORS.primary, COLORS.secondary]}
                style={styles.buttonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.buttonText}>ابدأ الآن</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Note Banner */}
          <View style={styles.infoBox}>
            <LinearGradient
              colors={['rgba(76, 201, 240, 0.1)', 'rgba(67, 97, 238, 0.05)']}
              style={styles.infoBoxGradient}
            >
              <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} />
              <View style={styles.infoBoxTextContainer}>
                <Text style={styles.infoTitle}>تنبيه بخصوص الحفظ:</Text>
                <Text style={styles.infoDesc}>سيتم حفظ ومزامنة جميع فواتيرك ومصاريفك تحت هذا الاسم. إذا قمت بكتابة نفس الاسم على جهاز آخر سيتم استرجاع بياناتك تلقائياً.</Text>
              </View>
            </LinearGradient>
          </View>

        </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  brand: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 4,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  form: {
    gap: 20,
  },
  errorContainer: {
    flexDirection: 'row-reverse',
    backgroundColor: 'rgba(255, 94, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 94, 94, 0.25)',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  inputWrapper: {
    gap: 8,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
    paddingRight: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    textAlign: 'right',
  },
  button: {
    height: 56,
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 10,
  },
  buttonGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  infoBox: {
    marginTop: 30,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(76, 201, 240, 0.15)',
  },
  infoBoxGradient: {
    flexDirection: 'row-reverse',
    padding: 14,
    alignItems: 'center',
    gap: 12,
  },
  infoBoxTextContainer: {
    flex: 1,
    textAlign: 'right',
    gap: 2,
  },
  infoTitle: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'right',
  },
  infoDesc: {
    color: COLORS.textSecondary,
    fontSize: 11,
    textAlign: 'right',
    lineHeight: 16,
  },
  settingsToggle: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 16,
  },
  settingsToggleText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  serverSettingsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    gap: 10,
  },
  ipDesc: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 18,
    textAlign: 'right',
  },
  ipInputRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  ipInput: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 44,
    paddingHorizontal: 12,
    color: COLORS.text,
    fontSize: 13,
  },
  ipSaveButton: {
    backgroundColor: COLORS.primary,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ipSaveButtonText: {
    color: COLORS.background,
    fontSize: 13,
    fontWeight: '700',
  },
});

export default Login;
