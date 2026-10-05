import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { assetManager, SetupProgress } from '../assets/AssetManager';
import { MODELS, CORPORA } from '../assets/manifest';
import { colors, ui } from './theme';
export default function SetupWizardScreen({
  onComplete,
  initialError,
}: {
  onComplete: () => Promise<void>;
  initialError?: string;
}) {
  const [modelId, setModelId] = useState(MODELS[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError || '');
  const [progress, setProgress] = useState<SetupProgress | null>(null);
  useEffect(() => {
    let active = true;
    void assetManager.settings().then((s) => {
      if (active) setModelId(s.modelId);
    });
    return () => {
      active = false;
    };
  }, []);
  const run = async (download: boolean) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await assetManager.install(modelId, setProgress, download);
      await onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setup failed. Retry to continue.');
    } finally {
      setBusy(false);
    }
  };
  const importFiles = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: false,
      });
      if (!result.canceled)
        for (const file of [...result.assets].sort(
          (a, b) =>
            Number(b.name === 'corpus-manifest.json') - Number(a.name === 'corpus-manifest.json'),
        ))
          await assetManager.importFile(file.uri, file.name, setProgress);
      setProgress(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={ui.page}>
      <ScrollView contentContainerStyle={ui.body}>
        <Text style={ui.muted}>NOMADLM / OFFLINE RESEARCH</Text>
        <Text style={ui.title}>Your offline library</Text>
        <Text style={ui.text}>
          Download once, then research without a connection. Setup verifies every file and builds
          searchable indexes. Allow at least 5 GB of free space for the default setup and keep the
          app open while indexing.
        </Text>
        <Text style={ui.text}>Choose a model</Text>
        {MODELS.map((model) => (
          <Pressable
            key={model.id}
            disabled={busy}
            accessibilityRole="radio"
            accessibilityState={{ checked: model.id === modelId, disabled: busy }}
            onPress={() => setModelId(model.id)}
            style={[ui.panel, model.id === modelId && { borderColor: colors.green }]}
          >
            <Text style={ui.text}>
              {model.id === modelId ? '● ' : '○ '}
              {model.label}
            </Text>
            <Text style={ui.muted}>
              {(model.bytes / 1073741824).toFixed(2)} GB ·{' '}
              {model.experimental ? 'Experimental - benchmark on your phone' : 'Default baseline'} ·{' '}
              {model.license}
            </Text>
          </Pressable>
        ))}
        <View style={ui.panel}>
          <Text style={ui.text}>Included knowledge</Text>
          {CORPORA.map((c) => (
            <Text key={c.id} style={ui.muted}>
              {c.label} · {c.sourceDate} · {(c.bytes / 1048576).toFixed(0)} MB download
            </Text>
          ))}
          <Text style={ui.muted}>
            Snapshots can be outdated. Search results include source dates and attribution.
          </Text>
        </View>
        {error ? (
          <Text style={ui.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {busy ? (
          <View style={ui.panel}>
            <ActivityIndicator color={colors.green} />
            <Text style={ui.text} accessibilityLiveRegion="polite">
              {progress?.message || 'Preparing…'}
            </Text>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.round((progress?.fraction || 0) * 100),
              }}
              style={{ height: 8, backgroundColor: colors.border, borderRadius: 4 }}
            >
              <View
                style={{
                  height: 8,
                  width: `${Math.round((progress?.fraction || 0) * 100)}%`,
                  backgroundColor: colors.green,
                  borderRadius: 4,
                }}
              />
            </View>
            <Pressable
              style={ui.button}
              accessibilityRole="button"
              onPress={() => void assetManager.cancel().catch((e) => setError(e.message))}
            >
              <Text style={ui.buttonText}>Pause setup</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Pressable
              style={[ui.button, ui.primary]}
              accessibilityRole="button"
              onPress={() => void run(true)}
            >
              <Text style={ui.primaryText}>Download / resume setup</Text>
            </Pressable>
            <Pressable
              style={ui.button}
              accessibilityRole="button"
              onPress={() => void importFiles()}
            >
              <Text style={ui.buttonText}>Import files from this device</Text>
            </Pressable>
            <Pressable style={ui.button} accessibilityRole="button" onPress={() => void run(false)}>
              <Text style={ui.buttonText}>Finish setup with imported files</Text>
            </Pressable>
          </>
        )}
        <Text style={ui.muted}>
          For offline import, select the original filenames below. Raw files must match the
          published SHA-256 digests. You can also select corpus-manifest.json with its .search.db
          packs to skip indexing; use packs you built or obtained from a trusted publisher.
        </Text>
        {[MODELS.find((m) => m.id === modelId)!, ...CORPORA].map((s) => (
          <Text selectable key={s.id} style={ui.muted}>
            {s.filename}
          </Text>
        ))}
        <Text style={ui.muted}>
          No account or location permission is required. Downloads contact GitHub and Hugging Face
          only when you start setup. Completed corpus indexes are kept if setup is interrupted; an
          unfinished index restarts.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
