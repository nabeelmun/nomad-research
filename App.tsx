import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import * as FileSystem from 'expo-file-system';
import ResearchTerminal from './src/ui/ResearchTerminal';
import SetupWizardScreen from './src/ui/SetupWizardScreen';

export default function App() {
  const [checking, setChecking] = useState<boolean>(true);
  const [hasAssets, setHasAssets] = useState<boolean>(false);

  const verifyAssets = async () => {
    try {
      // 1. Check internal app storage and iOS Files directory
      const internal3b = `${FileSystem.documentDirectory}models/Llama-3.2-3B-Instruct-Q4_K_M.gguf`;
      const internal15b = `${FileSystem.documentDirectory}models/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf`;
      const root3b = `${FileSystem.documentDirectory}Llama-3.2-3B-Instruct-Q4_K_M.gguf`;
      const root15b = `${FileSystem.documentDirectory}Qwen2.5-1.5B-Instruct-Q4_K_M.gguf`;
      const internalVoyage = `${FileSystem.documentDirectory}data/voyage.db`;
      const rootVoyage = `${FileSystem.documentDirectory}voyage.db`;

      const m1 = await FileSystem.getInfoAsync(internal3b);
      const m2 = await FileSystem.getInfoAsync(internal15b);
      const m3 = await FileSystem.getInfoAsync(root3b);
      const m4 = await FileSystem.getInfoAsync(root15b);
      const v1 = await FileSystem.getInfoAsync(internalVoyage);
      const v2 = await FileSystem.getInfoAsync(rootVoyage);

      // 2. Check external /sdcard/Download (Android USB transfer path)
      const ext3b = 'file:///sdcard/Download/Llama-3.2-3B-Instruct-Q4_K_M.gguf';
      const extVoyage = 'file:///sdcard/Download/voyage.db';
      const em = await FileSystem.getInfoAsync(ext3b);
      const ev = await FileSystem.getInfoAsync(extVoyage);

      const hasModel = m1.exists || m2.exists || m3.exists || m4.exists || em.exists;
      const hasCorpus = v1.exists || v2.exists || ev.exists;

      if (hasModel && hasCorpus) {
        setHasAssets(true);
      } else {
        setHasAssets(false);
      }
    } catch (e) {
      console.warn('Error checking offline assets:', e);
      setHasAssets(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    verifyAssets();
  }, []);

  if (checking) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#4ADE80" size="large" />
      </View>
    );
  }

  if (!hasAssets) {
    return (
      <SetupWizardScreen
        onComplete={() => {
          setHasAssets(true);
        }}
      />
    );
  }

  return <ResearchTerminal />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    justifyContent: 'center',
    alignItems: 'center'
  }
});
