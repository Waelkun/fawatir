import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from './src/context/AppContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useFonts } from 'expo-font';
import { 
  Ionicons, 
  MaterialCommunityIcons, 
  MaterialIcons, 
  FontAwesome, 
  Feather, 
  AntDesign 
} from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';

export default function App() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
    'Ionicons': Ionicons.font.ionicons,
    ...MaterialCommunityIcons.font,
    'MaterialCommunityIcons': MaterialCommunityIcons.font['material-community'],
    ...MaterialIcons.font,
    'MaterialIcons': MaterialIcons.font['material'],
    ...FontAwesome.font,
    'fontawesome': FontAwesome.font.FontAwesome,
    ...Feather.font,
    'Feather': Feather.font.feather,
    ...AntDesign.font,
    'AntDesign': AntDesign.font.anticon,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0b0c13', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4CC9F0" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AppProvider>
        <AppNavigator />
        <StatusBar style="light" />
      </AppProvider>
    </SafeAreaProvider>
  );
}
