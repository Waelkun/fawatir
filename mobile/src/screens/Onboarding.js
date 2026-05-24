import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const PAGES = [
  {
    title: 'مسح الفواتير بالذكاء الاصطناعي',
    desc: 'حوّل فواتيرك الورقية والرقمية لبيانات مالية منظمة فوراً. يتعرف Gemini AI على المحتوى والعملات والمنتجات بدقة متناهية.',
    icon: 'scan-circle-outline'
  },
  {
    title: 'توحيد المنتجات الذكي',
    desc: 'ذاكرة ذاتية التعلم تجمع السلع المتشابهة بأسماء موحدة وعربية. Chicken Breast وصدر دجاج يتم ترميزهما كمنتج واحد.',
    icon: 'shuffle-outline'
  },
  {
    title: 'تحليلات عميقة ورؤى مخصصة',
    desc: 'تتبع تطور أسعار السلع الفردية عبر الزمن وتلقّ نصائح مالية فورية من مستشارك الذكي لخفض إنفاقك بنسبة تصل لـ 18%.',
    icon: 'trending-up-outline'
  }
];

const Onboarding = ({ navigation }) => {
  const [currentPage, setCurrentPage] = useState(0);

  const handleNext = () => {
    if (currentPage < PAGES.length - 1) {
      setCurrentPage(currentPage + 1);
    } else {
      navigation.navigate('Login');
    }
  };

  const page = PAGES[currentPage];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.background, '#141522', COLORS.background]}
        style={styles.gradient}
      >
        {/* Skip button */}
        <TouchableOpacity 
          style={styles.skipButton}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.skipText}>تخطي</Text>
        </TouchableOpacity>

        {/* Dynamic Icon */}
        <View style={styles.iconContainer}>
          <LinearGradient
            colors={[COLORS.primary, COLORS.secondary]}
            style={styles.iconBg}
          >
            <Ionicons name={page.icon} size={64} color={COLORS.white} />
          </LinearGradient>
          {/* Abstract Glow */}
          <View style={styles.glow} />
        </View>

        {/* Text Contents */}
        <View style={styles.textContainer}>
          <Text style={styles.title}>{page.title}</Text>
          <Text style={styles.desc}>{page.desc}</Text>
        </View>

        {/* Indicators and Actions */}
        <View style={styles.footer}>
          {/* Dots */}
          <View style={styles.dotsRow}>
            {PAGES.map((_, i) => (
              <View 
                key={i} 
                style={[
                  styles.dot, 
                  i === currentPage ? styles.activeDot : null
                ]} 
              />
            ))}
          </View>

          {/* Next Action Button */}
          <TouchableOpacity 
            style={styles.nextButton}
            onPress={handleNext}
          >
            <LinearGradient
              colors={[COLORS.primary, COLORS.secondary]}
              style={styles.nextButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.nextButtonText}>
                {currentPage === PAGES.length - 1 ? 'ابدأ الآن' : 'التالي'}
              </Text>
              <Ionicons name="arrow-back" size={18} color={COLORS.white} style={styles.arrow} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
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
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 40,
  },
  skipButton: {
    alignSelf: 'flex-start',
    padding: 10,
  },
  skipText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginTop: 20,
  },
  iconBg: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  glow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: COLORS.primary,
    opacity: 0.15,
    filter: 'blur(30px)',
    zIndex: 1,
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: 12,
    marginVertical: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 30,
  },
  desc: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    alignItems: 'center',
    gap: 30,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  activeDot: {
    width: 24,
    backgroundColor: COLORS.primary,
  },
  nextButton: {
    width: '100%',
    height: 56,
    borderRadius: 20,
    overflow: 'hidden',
  },
  nextButtonGradient: {
    flex: 1,
    flexDirection: 'row-reverse', // Align items for Arabic RTL feel
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  nextButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  arrow: {
    transform: [{ rotate: '180deg' }], // Adjust arrow for RTL layout flow
  }
});

export default Onboarding;
