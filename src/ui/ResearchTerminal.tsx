import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { knowledgeStore, SavedChat, CorpusInfo } from '../rag/KnowledgeStore';
import {
  researchSynthesizer,
  ChatMessage,
  ResearchCitation,
  ResearchMode,
  RESEARCH_MODES,
} from '../rag/ResearchSynthesizer';
import { llamaEngine } from '../inference/LlamaEngine';
import { RequestGate } from '../inference/RequestGate';
import { assetManager } from '../assets/AssetManager';
import { MODELS } from '../assets/manifest';
import { MarkdownView } from './MarkdownView';
import { formatCalculation } from '../math/Calculator';
import { colors, ui } from './theme';
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong. Please retry.';
const Button = ({
  title,
  onPress,
  disabled = false,
  primary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={[ui.button, primary && ui.primary, disabled && { opacity: 0.45 }]}
  >
    <Text style={primary ? ui.primaryText : ui.buttonText}>{title}</Text>
  </Pressable>
);
const MessageCard = React.memo(
  ({
    message,
    onSource,
  }: {
    message: ChatMessage;
    onSource: (source: ResearchCitation) => void;
  }) => {
    const [details, setDetails] = useState(false);
    const [copied, setCopied] = useState(false);
    const citationPress = useCallback(
      (id: number) => {
        const source = message.citations?.find((c) => c.id === id);
        if (source) onSource(source);
      },
      [message.citations, onSource],
    );
    return (
      <View
        style={[
          ui.panel,
          { marginBottom: 12 },
          message.role === 'user' && { marginLeft: 24, backgroundColor: colors.raised },
        ]}
      >
        <Text style={ui.muted}>
          {message.role === 'user'
            ? 'YOU'
            : message.calculation
              ? 'CALCULATOR · LOCAL'
              : message.stopped
                ? 'NOMADLM · STOPPED'
                : 'NOMADLM'}
        </Text>
        {message.calculation ? (
          <>
            <Text selectable style={ui.muted}>
              {message.calculation.expression}
            </Text>
            <Text selectable style={[ui.title, { color: colors.green }]}>
              {formatCalculation(message.calculation)}
            </Text>
            {message.calculation.note ? (
              <Text style={ui.muted}>{message.calculation.note}</Text>
            ) : null}
          </>
        ) : message.role === 'user' ? (
          <Text selectable style={ui.text}>
            {message.content}
          </Text>
        ) : (
          <MarkdownView content={message.content} onCitationPress={citationPress} />
        )}
        {message.role === 'assistant' && (
          <>
            <Text style={ui.muted}>
              {message.calculation
                ? 'Computed without a language model. Check the interpreted expression above.'
                : message.citations?.length
                  ? 'Source references · support has not been independently verified'
                  : 'No supporting source references'}
            </Text>
            {!!message.citations?.length && (
              <View style={ui.row}>
                {message.citations.map((c) => (
                  <Button key={c.id} title={`[${c.id}] ${c.title}`} onPress={() => onSource(c)} />
                ))}
              </View>
            )}
            <View style={ui.row}>
              <Button
                title={copied ? 'Copied' : 'Copy'}
                onPress={() =>
                  void Clipboard.setStringAsync(message.content)
                    .then(() => setCopied(true))
                    .catch((e) => Alert.alert('Copy failed', errorText(e)))
                }
              />
              {message.metrics && (
                <Button
                  title={details ? 'Hide metrics' : 'Show metrics'}
                  onPress={() => setDetails(!details)}
                />
              )}
            </View>
            {details && message.metrics && (
              <Text selectable style={ui.muted}>
                Retrieval {message.metrics.retrievalMs ?? 0} ms · First output{' '}
                {message.metrics.timeToFirstTokenMs === null
                  ? 'none'
                  : message.metrics.timeToFirstTokenMs + ' ms'}{' '}
                · {message.metrics.totalTokens} native tokens ·{' '}
                {message.metrics.tokensPerSecond.toFixed(1)} tokens/s ·{' '}
                {(message.metrics.durationMs / 1000).toFixed(1)} s
                {message.metrics.truncated
                  ? '\nOutput reached a limit; ask for a shorter answer.'
                  : ''}
              </Text>
            )}
          </>
        )}
      </View>
    );
  },
);
export default function ResearchTerminal({ onRepair }: { onRepair: () => Promise<void> }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<ResearchMode>('balanced');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Loading offline model…');
  const [error, setError] = useState('');
  const [stream, setStream] = useState('');
  const [sheet, setSheet] = useState<'history' | 'settings' | 'mode' | null>(null);
  const [source, setSource] = useState<ResearchCitation | null>(null);
  const [history, setHistory] = useState<SavedChat[]>([]);
  const [search, setSearch] = useState('');
  const [rename, setRename] = useState<{ id: string; title: string } | null>(null);
  const [city, setCity] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [model, setModel] = useState('');
  const [storage, setStorage] = useState(0);
  const [corpora, setCorpora] = useState<CorpusInfo[]>([]);
  const sessionId = useRef<string | null>(null);
  const gate = useRef(new RequestGate());
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const buffer = useRef('');
  const list = useRef<FlatList<ChatMessage>>(null);
  const historyRequest = useRef(0);
  const initialize = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([knowledgeStore.initialize(), llamaEngine.autoInitialize()]);
      const settings = await assetManager.settings();
      if (!mounted.current) return;
      setSelectedModelId(settings.modelId);
      setCity(settings.city);
      setModel(MODELS.find((m) => m.id === settings.modelId)!.label);
      setCorpora(await knowledgeStore.corpusInfo());
      setStorage(await assetManager.storageBytes());
      setReady(true);
      setStatus('Offline and ready');
    } catch (e) {
      if (mounted.current) {
        setError(errorText(e));
        setStatus('Loading failed');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);
  const stop = useCallback(() => {
    gate.current.cancel();
    controller.current?.abort();
    setStatus('Stopping…');
    void llamaEngine.stopGeneration().catch((e) => {
      if (mounted.current) setError(errorText(e));
    });
  }, []);
  useEffect(() => {
    mounted.current = true;
    void initialize();
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && gate.current.busy()) stop();
    });
    return () => {
      mounted.current = false;
      controller.current?.abort();
      gate.current.cancel();
      appState.remove();
      void llamaEngine.stopGeneration().catch(() => {});
    };
  }, [initialize, stop]);
  const refreshHistory = useCallback(async (term: string) => {
    const request = ++historyRequest.current;
    try {
      const rows = await knowledgeStore.getChatHistory(100, term);
      if (mounted.current && request === historyRequest.current) setHistory(rows);
    } catch (e) {
      if (mounted.current) setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    if (sheet !== 'history') return;
    const timer = setTimeout(() => void refreshHistory(search), 200);
    return () => clearTimeout(timer);
  }, [sheet, search, refreshHistory]);
  const run = async () => {
    const query = draft.trim();
    if (!query || !ready || gate.current.busy()) return;
    if (query.length > 12000) {
      setError('Please shorten your question to 12,000 characters.');
      return;
    }
    const request = gate.current.begin();
    const abort = new AbortController();
    controller.current = abort;
    const previous = messages;
    const user: ChatMessage = {
      id: `u${request}_${Date.now()}`,
      role: 'user',
      content: query,
      createdAt: Date.now(),
    };
    const base = [...previous, user];
    setMessages(base);
    setDraft('');
    setError('');
    setBusy(true);
    setStream('');
    buffer.current = '';
    setStatus('Preparing answer…');
    const timer = setInterval(() => {
      if (mounted.current && gate.current.isCurrent(request)) setStream(buffer.current);
    }, 50);
    try {
      const result = await researchSynthesizer.executeResearch(
        query,
        previous,
        (text) => {
          if (!gate.current.isCancelled(request)) buffer.current += text;
        },
        (text) => {
          if (mounted.current && !gate.current.isCancelled(request)) setStatus(text);
        },
        mode,
        abort.signal,
      );
      if (!mounted.current || !gate.current.isCurrent(request)) return;
      const cancelled = gate.current.isCancelled(request);
      const content = cancelled ? buffer.current : result.answer;
      if (!content.trim()) {
        setMessages(previous);
        setDraft(query);
        return;
      }
      const assistant: ChatMessage = {
        id: `a${request}_${Date.now()}`,
        role: 'assistant',
        content,
        createdAt: Date.now(),
        citations: cancelled ? [] : result.citations,
        calculation: cancelled ? undefined : result.calculation,
        modelId: selectedModelId,
        mode,
        metrics: result.metrics,
        grounding: cancelled ? 'unsupported' : result.grounding,
        stopped: cancelled,
      };
      const completed = [...base, assistant];
      setMessages(completed);
      try {
        sessionId.current = await knowledgeStore.saveChat(
          sessionId.current,
          query,
          content,
          JSON.stringify(assistant.citations),
          JSON.stringify(assistant.metrics || {}),
          JSON.stringify(completed),
        );
      } catch (e) {
        setError('Answer is available, but saving failed: ' + errorText(e));
      }
    } catch (e) {
      if (!mounted.current || !gate.current.isCurrent(request)) return;
      if (gate.current.isCancelled(request) && buffer.current.trim()) {
        const assistant: ChatMessage = {
          id: `a${request}_${Date.now()}`,
          role: 'assistant',
          content: buffer.current,
          createdAt: Date.now(),
          citations: [],
          stopped: true,
          grounding: 'unsupported',
        };
        const completed = [...base, assistant];
        setMessages(completed);
        try {
          sessionId.current = await knowledgeStore.saveChat(
            sessionId.current,
            query,
            assistant.content,
            '[]',
            '',
            JSON.stringify(completed),
          );
        } catch (saveError) {
          setError('Saving failed: ' + errorText(saveError));
        }
      } else {
        setMessages(previous);
        setDraft(query);
        if (!abort.signal.aborted) setError(errorText(e));
      }
    } finally {
      clearInterval(timer);
      if (gate.current.finish(request) && mounted.current) {
        setBusy(false);
        setStream('');
        setStatus('Offline and ready');
        controller.current = null;
      }
    }
  };
  const openSession = (saved: SavedChat) => {
    if (gate.current.busy()) return;
    try {
      const parsed: unknown = saved.messagesJson ? JSON.parse(saved.messagesJson) : null;
      const restored =
        Array.isArray(parsed) &&
        parsed.length &&
        parsed.every(
          (m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string',
        )
          ? (parsed as ChatMessage[])
          : [
              {
                id: saved.id + 'u',
                role: 'user' as const,
                content: saved.query,
                createdAt: saved.createdAt,
              },
              {
                id: saved.id + 'a',
                role: 'assistant' as const,
                content: saved.answer,
                citations: JSON.parse(saved.citationsJson || '[]'),
                createdAt: saved.createdAt,
              },
            ];
      setMessages(restored);
      sessionId.current = saved.id;
      setSheet(null);
      setDraft('');
      setError('');
    } catch {
      setError('This saved session cannot be read. Other sessions are unaffected.');
    }
  };
  const editLatest = () => {
    if (gate.current.busy()) return;
    let index = messages.length - 1;
    while (index >= 0 && messages[index].role !== 'user') index--;
    if (index < 0) return;
    setDraft(messages[index].content);
    setMessages(messages.slice(0, index));
    setError('');
  };
  const repair = async () => {
    setSheet(null);
    try {
      await onRepair();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const showSource = useCallback((citation: ResearchCitation) => setSource(citation), []);
  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => <MessageCard message={item} onSource={showSource} />,
    [showSource],
  );
  return (
    <SafeAreaView style={ui.page}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[ui.body, { paddingBottom: 8 }]}>
          <View style={ui.row}>
            <Text style={[ui.title, { flex: 1 }]}>
              NomadLM<Text style={{ color: colors.green }}>_</Text>
            </Text>
            <Button title="History" disabled={busy || !ready} onPress={() => setSheet('history')} />
            <Button
              title="Settings"
              disabled={busy || loading}
              onPress={() => setSheet('settings')}
            />
          </View>
          <View style={ui.row}>
            <Text style={[ui.muted, { flex: 1 }]} accessibilityLiveRegion="polite">
              {status}
            </Text>
            {messages.length > 0 && (
              <Button
                title="Latest"
                onPress={() => list.current?.scrollToEnd({ animated: true })}
              />
            )}
          </View>
          {loading && <ActivityIndicator color={colors.green} />}
          {error ? (
            <Text style={ui.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          {!ready && !loading && (
            <View style={ui.row}>
              <Button title="Retry loading" onPress={() => void initialize()} />
              <Button title="Repair assets" onPress={() => void repair()} />
            </View>
          )}
        </View>
        <FlatList
          ref={list}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(m) => m.id}
          initialNumToRender={6}
          maxToRenderPerBatch={4}
          windowSize={7}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}
          ListEmptyComponent={
            <View style={[ui.panel, { marginTop: 12 }]}>
              <Text style={ui.title}>Research, wherever you are.</Text>
              <Text style={ui.text}>
                Ask about a place, explore a topic, or calculate a budget. Your questions stay on
                this device.
              </Text>
              {['What can I visit in Lisbon?', 'Why do volcanoes erupt?', '15% of 200'].map((q) => (
                <Button key={q} title={q} disabled={busy} onPress={() => setDraft(q)} />
              ))}
            </View>
          }
          ListFooterComponent={
            busy ? (
              <View style={ui.panel}>
                <Text style={ui.muted}>{status}</Text>
                <Text selectable style={ui.text}>
                  {stream || 'Working…'}
                </Text>
              </View>
            ) : null
          }
        />
        <View style={[ui.body, { padding: 12, borderTopColor: colors.border, borderTopWidth: 1 }]}>
          {!busy && messages.length > 0 && (
            <View style={ui.row}>
              <Button title="Edit latest question" onPress={editLatest} />
              <Button
                title="New chat"
                onPress={() => {
                  setMessages([]);
                  sessionId.current = null;
                  setDraft('');
                  setError('');
                }}
              />
            </View>
          )}
          <TextInput
            accessibilityLabel="Research question or calculation"
            style={[ui.input, { minHeight: 60, maxHeight: 160 }]}
            multiline
            editable={!busy && ready}
            placeholder="Ask a question or enter a calculation…"
            placeholderTextColor={colors.muted}
            value={draft}
            onChangeText={setDraft}
            maxLength={12000}
          />
          <View style={ui.row}>
            <Button
              title={RESEARCH_MODES[mode].name + ' ▾'}
              disabled={busy}
              onPress={() => setSheet('mode')}
            />
            <View style={{ flex: 1 }} />
            {busy ? (
              <Button title="Stop" onPress={stop} />
            ) : (
              <Button
                title="Send"
                primary
                disabled={!ready || !draft.trim()}
                onPress={() => void run()}
              />
            )}
          </View>
        </View>
        <Modal
          visible={!!sheet || !!source}
          animationType="slide"
          onRequestClose={() => {
            setSheet(null);
            setSource(null);
          }}
        >
          <SafeAreaView style={ui.page}>
            <View style={[ui.body, { flexDirection: 'row', justifyContent: 'space-between' }]}>
              <Text style={ui.title}>
                {source
                  ? 'Source excerpt'
                  : sheet === 'history'
                    ? 'Your chats'
                    : sheet === 'mode'
                      ? 'Answer length'
                      : 'Settings'}
              </Text>
              <Button
                title="Close"
                onPress={() => {
                  setSheet(null);
                  setSource(null);
                }}
              />
            </View>
            {source ? (
              <ScrollView contentContainerStyle={ui.body}>
                <Text style={ui.title}>{source.title}</Text>
                <Text style={ui.muted}>
                  {source.section} · {source.corpus || 'Legacy source'} · Snapshot{' '}
                  {source.sourceDate || 'unknown'}
                </Text>
                <Text selectable style={ui.text}>
                  {source.excerpt}
                </Text>
                <Text selectable style={ui.muted}>
                  {source.sourceUrl || 'No URL recorded in this older chat.'}
                </Text>
                <Text style={ui.muted}>
                  Excerpt from Wikipedia / Wikivoyage, CC BY-SA. Sources may have changed. Reading
                  this excerpt uses no network.
                </Text>
                {source.sourceUrl && (
                  <Button
                    title="Copy source URL"
                    onPress={() =>
                      void Clipboard.setStringAsync(source.sourceUrl).catch((e) =>
                        setError(errorText(e)),
                      )
                    }
                  />
                )}
              </ScrollView>
            ) : sheet === 'mode' ? (
              <View style={ui.body}>
                {(Object.keys(RESEARCH_MODES) as ResearchMode[]).map((id) => (
                  <Button
                    key={id}
                    title={RESEARCH_MODES[id].name + (mode === id ? ' ✓' : '')}
                    onPress={() => {
                      setMode(id);
                      setSheet(null);
                    }}
                  />
                ))}
              </View>
            ) : sheet === 'history' ? (
              <>
                <View style={ui.body}>
                  <TextInput
                    style={ui.input}
                    accessibilityLabel="Search chat history"
                    placeholder="Search chats…"
                    placeholderTextColor={colors.muted}
                    value={search}
                    onChangeText={setSearch}
                  />
                  {rename && (
                    <View style={ui.panel}>
                      <TextInput
                        style={ui.input}
                        accessibilityLabel="Session title"
                        value={rename.title}
                        onChangeText={(title) => setRename({ ...rename, title })}
                      />
                      <Button
                        title="Save title"
                        onPress={() =>
                          void knowledgeStore
                            .renameChat(rename.id, rename.title)
                            .then(() => {
                              setRename(null);
                              void refreshHistory(search);
                            })
                            .catch((e) => setError(errorText(e)))
                        }
                      />
                    </View>
                  )}
                </View>
                <FlatList
                  data={history}
                  keyExtractor={(h) => h.id}
                  contentContainerStyle={ui.body}
                  ListEmptyComponent={<Text style={ui.muted}>No matching chats.</Text>}
                  renderItem={({ item }) => (
                    <View style={ui.panel}>
                      <Button title={item.title || item.query} onPress={() => openSession(item)} />
                      <Text style={ui.muted}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                      <View style={ui.row}>
                        <Button
                          title="Rename"
                          onPress={() =>
                            setRename({ id: item.id, title: item.title || item.query })
                          }
                        />
                        <Button
                          title="Delete"
                          onPress={() =>
                            Alert.alert(
                              'Delete chat?',
                              'This removes the saved conversation from this device.',
                              [
                                { text: 'Cancel' },
                                {
                                  text: 'Delete',
                                  style: 'destructive',
                                  onPress: () =>
                                    void knowledgeStore
                                      .deleteChat(item.id)
                                      .then(() => {
                                        if (sessionId.current === item.id) sessionId.current = null;
                                        void refreshHistory(search);
                                      })
                                      .catch((e) => setError(errorText(e))),
                                },
                              ],
                            )
                          }
                        />
                      </View>
                    </View>
                  )}
                />
              </>
            ) : (
              <ScrollView contentContainerStyle={ui.body}>
                <Text style={ui.text}>City for "here" and "near me"</Text>
                <TextInput
                  accessibilityLabel="City"
                  style={ui.input}
                  value={city}
                  onChangeText={setCity}
                  maxLength={100}
                  placeholder="For example, Mumbai"
                  placeholderTextColor={colors.muted}
                />
                <Button
                  title="Save city"
                  onPress={() =>
                    void assetManager
                      .settings()
                      .then((s) => assetManager.saveSettings({ ...s, city }))
                      .then(() => setSheet(null))
                      .catch((e) => setError(errorText(e)))
                  }
                />
                <View style={ui.panel}>
                  <Text style={ui.text}>{model || 'Model not loaded'}</Text>
                  <Text style={ui.muted}>
                    Asset storage: {(storage / 1073741824).toFixed(2)} GB
                  </Text>
                  {corpora.map((c) => (
                    <Text key={c.id} style={ui.muted}>
                      {c.label} · {c.date}\n{c.articles.toLocaleString()} articles ·{' '}
                      {c.passages.toLocaleString()} passages
                    </Text>
                  ))}
                </View>
                <Button
                  title="Copy session for benchmark"
                  disabled={!messages.length}
                  onPress={() =>
                    void Clipboard.setStringAsync(
                      JSON.stringify(
                        {
                          modelId: selectedModelId,
                          model,
                          mode,
                          contextTokens: 4096,
                          corpora,
                          messages,
                        },
                        null,
                        2,
                      ),
                    )
                      .then(() =>
                        Alert.alert(
                          'Copied',
                          'Session answers and metrics are on your clipboard. Paste them into your benchmark record.',
                        ),
                      )
                      .catch((e) => setError(errorText(e)))
                  }
                />
                <Button
                  title="Change model / repair assets"
                  disabled={busy}
                  onPress={() => void repair()}
                />
                <Text style={ui.muted}>
                  Generation and search run locally. Settings and chat history remain on this
                  device. Changing assets returns to setup and preserves saved chats.
                </Text>
              </ScrollView>
            )}
            {error && (
              <Text style={[ui.error, { padding: 16 }]} accessibilityRole="alert">
                {error}
              </Text>
            )}
          </SafeAreaView>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
