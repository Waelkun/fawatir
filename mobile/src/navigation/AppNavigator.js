import React, { useContext } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, View, StyleSheet, Platform } from 'react-native';
import { AppContext } from '../context/AppContext';
import { COLORS } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';

// Import Screens
import Splash from '../screens/Splash';
import Onboarding from '../screens/Onboarding';
import Login from '../screens/Login';
import Register from '../screens/Register';
import Dashboard from '../screens/Dashboard';
import Scanner from '../screens/Scanner';
import Review from '../screens/Review';
import ReceiptDetails from '../screens/ReceiptDetails';
import ProductDetails from '../screens/ProductDetails';
import Logs from '../screens/Insights';
import Settings from '../screens/Settings';
import PeopleScreen from '../screens/PeopleScreen';
import PersonDetails from '../screens/PersonDetails';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Custom Glassmorphic Tab Bar Styles
const TabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size, focused }) => {
          let iconName;

          if (route.name === 'الرئيسية') {
            iconName = focused ? 'grid' : 'grid-outline';
          } else if (route.name === 'الماسح') {
            iconName = focused ? 'scan' : 'scan-outline';
          } else if (route.name === 'السجلات') {
            iconName = focused ? 'document-text' : 'document-text-outline';
          } else if (route.name === 'الأشخاص') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'الإعدادات') {
            iconName = focused ? 'settings' : 'settings-outline';
          }

          return (
            <View style={focused ? styles.activeIconContainer : null}>
              <Ionicons name={iconName} size={size} color={color} />
            </View>
          );
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        headerShown: false,
      })}
    >
      <Tab.Screen name="الرئيسية" component={Dashboard} />
      <Tab.Screen name="الماسح" component={Scanner} options={{ unmountOnBlur: true }} />
      <Tab.Screen name="السجلات" component={Logs} />
      <Tab.Screen name="الأشخاص" component={PeopleScreen} />
      <Tab.Screen name="الإعدادات" component={Settings} />
    </Tab.Navigator>
  );
};

export const AppNavigator = () => {
  const { token, loading } = useContext(AppContext);

  if (loading) {
    return <Splash />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {token === null ? (
          // Auth flow
          <>
            <Stack.Screen name="Onboarding" component={Onboarding} />
            <Stack.Screen name="Login" component={Login} />
            <Stack.Screen name="Register" component={Register} />
          </>
        ) : (
          // Authenticated App flow
          <>
            <Stack.Screen name="Main" component={TabNavigator} />
            <Stack.Screen name="Review" component={Review} />
            <Stack.Screen name="ReceiptDetails" component={ReceiptDetails} />
            <Stack.Screen name="SingleProductDetails" component={ProductDetails} />
            <Stack.Screen name="PersonDetails" component={PersonDetails} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(21, 24, 33, 0.85)',
    borderRadius: 30,
    height: 70,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 8,
    paddingBottom: 8,
    paddingTop: 8,
  },
  tabBarLabel: {
    fontFamily: Platform.OS === 'ios' ? 'System' : 'normal',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  activeIconContainer: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  }
});
