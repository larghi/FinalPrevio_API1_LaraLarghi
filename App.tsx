import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PlantScreen } from './src/views/PlantScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <PlantScreen />
    </SafeAreaProvider>
  );
}
