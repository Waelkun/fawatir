import React, { useState, useContext } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppContext } from '../context/AppContext';
import { COLORS } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';

const CURRENCIES = [
  { code: 'SAR', name: 'ريال سعودي (SAR)' },
  { code: 'USD', name: 'دولار أمريكي (USD)' },
  { code: 'EUR', name: 'يورو أوروبي (EUR)' },
  { code: 'TRY', name: 'ليرة تركية (TRY)' }
];

const Register = ({ navigation }) => {
  const { register } = useContext(AppContext);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('SAR');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleRegister = async () => {
    if (!email || !password || !name) {
      setError('يرجى ملء جميع الحقول المطلوبة.');
      return;
    }
    setError('');
    setLoading(true);
    
    const result = await register(email, password, name, baseCurrency);
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
          
          <View style={styles.header}>
            <Text style={styles.brand}>FINTECH.AI</Text>
            <Text style={styles.title}>إنشاء حساب جديد</Text>
            <Text style={styles.subtitle}>انضم للمستقبل وأدر مصاريفك بالذكاء الاصطناعي</Text>
          </View>

          <View style={styles.form}>
            {error ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={18} color={COLORS.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Name Field */}
            <View style={styles.inputWrapper}>
              <Text style={styles.label}>الاسم بالكامل</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="أليكس ستيرلينغ"
                  placeholderTextColor="rgba(255, 255, 255, 0.3)"
                  value={name}
                  onChangeText={setName}
                />
              </View>
            </View>

            {/* Email Field */}
            <View style={styles.inputWrapper}>
              <Text style={styles.label}>البريد الإلكتروني</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="name@example.com"
                  placeholderTextColor="rgba(255, 255, 255, 0.3)"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            {/* Password Field */}
            <View style={styles.inputWrapper}>
              <Text style={styles.label}>كلمة المرور</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="rgba(255, 255, 255, 0.3)"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity 
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIcon}
                >
                  <Ionicons 
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'} 
                    size={20} 
                    color={COLORS.textSecondary} 
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Currency Selector Field */}
            <View style={styles.inputWrapper}>
              <Text style={styles.label}>العملة الأساسية للحساب</Text>
              <View style={styles.currencyRow}>
                {CURRENCIES.map((cur) => (
                  <TouchableOpacity
                    key={cur.code}
                    style={[
                      styles.currencyCard,
                      baseCurrency === cur.code ? styles.activeCurrencyCard : null
                    ]}
                    onPress={() => setBaseCurrency(cur.code)}
                  >
                    <Text style={[
                      styles.currencyText,
                      baseCurrency === cur.code ? styles.activeCurrencyText : null
                    ]}>
                      {cur.code}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Submit Button */}
            <TouchableOpacity 
              style={styles.button}
              onPress={handleRegister}
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
                  <Text style={styles.buttonText}>تسجيل الحساب</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>لديك حساب بالفعل؟</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>سجل دخولك</Text>
            </TouchableOpacity>
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
    paddingTop: 50,
    paddingBottom: 30,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
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
  eyeIcon: {
    padding: 4,
    marginLeft: 8,
  },
  currencyRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    gap: 8,
  },
  currencyCard: {
    flex: 1,
    height: 50,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeCurrencyCard: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(76, 201, 240, 0.1)',
  },
  currencyText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  activeCurrencyText: {
    color: COLORS.primary,
    fontWeight: '700',
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
  footer: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 32,
  },
  footerText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  loginLink: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
});

export default Register;
