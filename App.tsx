import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import ResearchTerminal from './src/ui/ResearchTerminal';
import SetupWizardScreen from './src/ui/SetupWizardScreen';
import { assetManager } from './src/assets/AssetManager';
import { knowledgeStore } from './src/rag/KnowledgeStore';
import { llamaEngine } from './src/inference/LlamaEngine';
import { ui, colors } from './src/ui/theme';
export default function App() {
  const [state, setState] = useState<'checking' | 'setup' | 'ready'>('checking');
  const [message, setMessage] = useState('Checking offline assets…');
  const [error, setError] = useState('');
  const verify = useCallback(async () => {
    setState('checking');
    try {
      await assetManager.checkInstalled((p) => setMessage(p.message));
      setState('ready');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assets need setup.');
      setState('setup');
    }
  }, []);
  useEffect(() => {
    void verify();
  }, [verify]);
  const repair = async () => {
    await llamaEngine.release();
    await knowledgeStore.close();
    setError('');
    setState('setup');
  };
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {state === 'checking' ? (
        <SafeAreaView style={ui.page}>
          <View style={[ui.body, { flex: 1, justifyContent: 'center' }]}>
            <ActivityIndicator color={colors.green} size="large" />
            <Text style={ui.text}>{message}</Text>
          </View>
        </SafeAreaView>
      ) : state === 'setup' ? (
        <SetupWizardScreen initialError={error} onComplete={verify} />
      ) : (
        <ResearchTerminal onRepair={repair} />
      )}
    </SafeAreaProvider>
  );
}
