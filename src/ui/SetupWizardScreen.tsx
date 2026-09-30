import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Image
} from 'react-native';
import * as FileSystem from 'expo-file-system';

interface DownloadPackage {
  id: string;
  name: string;
  tagline: string;
  badge: string;
  totalSizeMb: number;
  model: {
    name: string;
    filename: string;
    url: string;
    sizeMb: number;
  };
  corpus: {
    name: string;
    filename: string;
    url: string;
    sizeMb: number;
  };
  wiki: {
    name: string;
    filename: string;
    url: string;
    sizeMb: number;
  };
}

const PACKAGES: DownloadPackage[] = [
  {
    id: 'qwen-1.5b',
    name: 'NomadLM High-Speed Research Pack',
    tagline: 'Qwen2.5 1.5B Ultra-Fast Neural Core + Wikivoyage Travel + Wikipedia Core',
    badge: 'OPTIMIZED & FAST (4GB+ RAM)',
    totalSizeMb: 1467,
    model: {
      name: 'Qwen2.5-1.5B-Instruct (Q4_K_M)',
      filename: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
      url: 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
      sizeMb: 940
    },
    corpus: {
      name: 'Wikivoyage World Travel Pack (549k places)',
      filename: 'voyage.db',
      url: 'https://github.com/nabeelmun/nomad-research/releases/download/v1.1.0/voyage.db',
      sizeMb: 313
    },
    wiki: {
      name: 'Wikipedia Core Knowledge Base (2.5k+ core articles)',
      filename: 'wiki_core.db',
      url: 'https://github.com/nabeelmun/nomad-research/releases/download/v1.1.0/wiki_core.db',
      sizeMb: 214
    }
  }
];

interface SetupWizardProps {
  onComplete: () => void;
}

export default function SetupWizardScreen({ onComplete }: SetupWizardProps) {
  const [selectedPkgId, setSelectedPkgId] = useState<string>('qwen-1.5b');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [downloadedMb, setDownloadedMb] = useState<number>(0);
  const [totalExpectedMb, setTotalExpectedMb] = useState<number>(0);
  const [isDone, setIsDone] = useState<boolean>(false);

  const activePackage = PACKAGES.find((p) => p.id === selectedPkgId) || PACKAGES[0];

  const handleStartDownload = async () => {
    try {
      setIsDownloading(true);
      setIsDone(false);

      const modelsDir = `${FileSystem.documentDirectory}models/`;
      const dataDir = `${FileSystem.documentDirectory}data/`;

      await FileSystem.makeDirectoryAsync(modelsDir, { intermediates: true });
      await FileSystem.makeDirectoryAsync(dataDir, { intermediates: true });

      // Step 1: Download Corpus (Wikivoyage)
      setCurrentStep(`[1/3] Downloading ${activePackage.corpus.name}...`);
      setTotalExpectedMb(activePackage.corpus.sizeMb);
      setProgressPercent(0);
      setDownloadedMb(0);

      const corpusDest = `${dataDir}${activePackage.corpus.filename}`;
      const corpusDownloader = FileSystem.createDownloadResumable(
        activePackage.corpus.url,
        corpusDest,
        {},
        (dp) => {
          const writtenMb = Math.round(dp.totalBytesWritten / (1024 * 1024));
          const totalMb = Math.round(dp.totalBytesExpectedToWrite / (1024 * 1024)) || activePackage.corpus.sizeMb;
          const pct = Math.round((dp.totalBytesWritten / dp.totalBytesExpectedToWrite) * 100) || 0;
          setDownloadedMb(writtenMb);
          setTotalExpectedMb(totalMb);
          setProgressPercent(pct);
        }
      );

      await corpusDownloader.downloadAsync();

      // Step 2: Download Wikipedia Core Knowledge Base
      setCurrentStep(`[2/3] Downloading ${activePackage.wiki.name}...`);
      setTotalExpectedMb(activePackage.wiki.sizeMb);
      setProgressPercent(0);
      setDownloadedMb(0);

      const wikiDest = `${dataDir}${activePackage.wiki.filename}`;
      const wikiDownloader = FileSystem.createDownloadResumable(
        activePackage.wiki.url,
        wikiDest,
        {},
        (dp) => {
          const writtenMb = Math.round(dp.totalBytesWritten / (1024 * 1024));
          const totalMb = Math.round(dp.totalBytesExpectedToWrite / (1024 * 1024)) || activePackage.wiki.sizeMb;
          const pct = Math.round((dp.totalBytesWritten / dp.totalBytesExpectedToWrite) * 100) || 0;
          setDownloadedMb(writtenMb);
          setTotalExpectedMb(totalMb);
          setProgressPercent(pct);
        }
      );

      await wikiDownloader.downloadAsync();

      // Step 3: Download Model
      setCurrentStep(`[3/3] Downloading ${activePackage.model.name}...`);
      setTotalExpectedMb(activePackage.model.sizeMb);
      setProgressPercent(0);
      setDownloadedMb(0);

      const modelDest = `${modelsDir}${activePackage.model.filename}`;
      const modelDownloader = FileSystem.createDownloadResumable(
        activePackage.model.url,
        modelDest,
        {},
        (dp) => {
          const writtenMb = Math.round(dp.totalBytesWritten / (1024 * 1024));
          const totalMb = Math.round(dp.totalBytesExpectedToWrite / (1024 * 1024)) || activePackage.model.sizeMb;
          const pct = Math.round((dp.totalBytesWritten / dp.totalBytesExpectedToWrite) * 100) || 0;
          setDownloadedMb(writtenMb);
          setTotalExpectedMb(totalMb);
          setProgressPercent(pct);
        }
      );

      await modelDownloader.downloadAsync();

      setIsDone(true);
      setCurrentStep('Setup Complete! Knowledge pack installed.');
    } catch (err: any) {
      console.error('Download failed:', err);
      Alert.alert(
        'Download Interrupted',
        `Could not complete download: ${err?.message || 'Check your Wi-Fi connection and retry.'}`,
        [{ text: 'OK' }]
      );
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.logo}>NomadLM</Text>
          </View>
          <Text style={styles.title}>Offline Setup Wizard</Text>
          <Text style={styles.subtitle}>
            Set up once over Wi-Fi. After this single initial download, the app works 100% in Airplane Mode with zero network calls.
          </Text>
        </View>

        {/* Tiers Selection */}
        {!isDownloading && !isDone && (
          <View style={styles.tierSection}>
            <Text style={styles.sectionHeader}>CHOOSE KNOWLEDGE PACKAGE:</Text>
            {PACKAGES.map((pkg) => {
              const isSelected = pkg.id === selectedPkgId;
              return (
                <TouchableOpacity
                  key={pkg.id}
                  style={[styles.tierCard, isSelected && styles.tierCardSelected]}
                  onPress={() => setSelectedPkgId(pkg.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.tierTopRow}>
                    <Text style={styles.tierName}>{pkg.name}</Text>
                    <Text style={[styles.tierBadge, isSelected && styles.tierBadgeSelected]}>
                      {pkg.badge}
                    </Text>
                  </View>
                  <Text style={styles.tierTagline}>{pkg.tagline}</Text>
                  <View style={styles.tierMetaRow}>
                    <Text style={styles.tierMeta}>🧠 {pkg.model.name} ({pkg.model.sizeMb} MB)</Text>
                    <Text style={styles.tierMeta}>🗺️ {pkg.corpus.filename} ({pkg.corpus.sizeMb} MB)</Text>
                    <Text style={styles.tierSizeHighlight}>Total: ~{Math.round(pkg.totalSizeMb / 1024 * 10) / 10} GB</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Active Download Progress Box */}
        {(isDownloading || isDone) && (
          <View style={styles.progressCard}>
            <Text style={styles.progressStepTitle}>{currentStep}</Text>
            
            {isDownloading && (
              <View style={styles.progressBarWrapper}>
                <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
              </View>
            )}

            {isDownloading && (
              <View style={styles.progressMetaRow}>
                <Text style={styles.progressText}>{progressPercent}%</Text>
                <Text style={styles.progressText}>
                  {downloadedMb} MB / {totalExpectedMb} MB
                </Text>
              </View>
            )}

            {isDone && (
              <View style={styles.successBox}>
                <Text style={styles.successTitle}>✈️ Ready for 100% Offline Research</Text>
                <Text style={styles.successDesc}>
                  All weights and encyclopedic databases are safely written to your device storage. You can now turn on Airplane Mode!
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Action Button */}
        <View style={styles.buttonContainer}>
          {!isDownloading && !isDone && (
            <TouchableOpacity style={styles.downloadButton} onPress={handleStartDownload}>
              <Text style={styles.downloadButtonText}>
                Download & Install (~{Math.round(activePackage.totalSizeMb / 1024 * 10) / 10} GB)
              </Text>
            </TouchableOpacity>
          )}

          {isDownloading && (
            <View style={styles.downloadingIndicatorRow}>
              <ActivityIndicator color="#4ADE80" size="small" />
              <Text style={styles.downloadingText}>Downloading assets directly to storage...</Text>
            </View>
          )}

          {isDone && (
            <TouchableOpacity style={styles.enterButton} onPress={onComplete}>
              <Text style={styles.enterButtonText}>Enter Offline Research Terminal ➔</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Note on manual PC transfer */}
        {!isDownloading && !isDone && (
          <View style={styles.footerTip}>
            <Text style={styles.footerTipText}>
              💡 Have a PC? You can also transfer the model and databases directly to your phone's Download folder via USB to skip this download entirely.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A'
  },
  scroll: {
    padding: 20
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8
  },
  logoImage: {
    width: 36,
    height: 36,
    borderRadius: 8
  },
  logo: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 1
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#E0E0E0',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 10
  },
  sectionHeader: {
    color: '#777',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 12
  },
  tierSection: {
    marginBottom: 24
  },
  tierCard: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#262626',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14
  },
  tierCardSelected: {
    borderColor: '#4ADE80',
    backgroundColor: '#141E16'
  },
  tierTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  tierName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700'
  },
  tierBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: '#888',
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4
  },
  tierBadgeSelected: {
    color: '#4ADE80',
    backgroundColor: '#1E3A24'
  },
  tierTagline: {
    color: '#AAA',
    fontSize: 13,
    marginBottom: 10
  },
  tierMetaRow: {
    borderTopWidth: 1,
    borderTopColor: '#222',
    paddingTop: 8,
    gap: 4
  },
  tierMeta: {
    color: '#777',
    fontSize: 12
  },
  tierSizeHighlight: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2
  },
  progressCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24
  },
  progressStepTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12
  },
  progressBarWrapper: {
    height: 8,
    backgroundColor: '#262626',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4ADE80'
  },
  progressMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  progressText: {
    color: '#888',
    fontSize: 12,
    fontFamily: 'monospace'
  },
  successBox: {
    backgroundColor: '#152E1D',
    borderWidth: 1,
    borderColor: '#2F6A3E',
    borderRadius: 8,
    padding: 14,
    marginTop: 8
  },
  successTitle: {
    color: '#4ADE80',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4
  },
  successDesc: {
    color: '#A3E635',
    fontSize: 12,
    lineHeight: 18
  },
  buttonContainer: {
    marginTop: 8,
    marginBottom: 24
  },
  downloadButton: {
    backgroundColor: '#FFF',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center'
  },
  downloadButtonText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '800'
  },
  downloadingIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12
  },
  downloadingText: {
    color: '#AAA',
    fontSize: 13
  },
  enterButton: {
    backgroundColor: '#4ADE80',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center'
  },
  enterButtonText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '800'
  },
  footerTip: {
    padding: 12,
    backgroundColor: '#111',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#222'
  },
  footerTipText: {
    color: '#666',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center'
  }
});
