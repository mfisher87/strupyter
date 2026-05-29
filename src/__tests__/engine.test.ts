import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrudelEngine } from '../engine';
import type { EvaluationResult, EngineState } from '../engine';

// Capture the callbacks passed to repl() so tests can invoke them
let capturedOnEvalError: ((error: Error) => void) | undefined;
let capturedOnToggle: ((started: boolean) => void) | undefined;

const mockEvaluate = vi.fn();
const mockStart = vi.fn();
const mockStop = vi.fn();

vi.mock('@strudel/core', () => ({
  repl: vi.fn((options: {
    onEvalError?: (error: Error) => void;
    onToggle?: (started: boolean) => void;
  }) => {
    capturedOnEvalError = options.onEvalError;
    capturedOnToggle = options.onToggle;
    return {
      evaluate: mockEvaluate,
      start: mockStart,
      stop: mockStop,
      state: { started: false }
    };
  }),
  evalScope: vi.fn(() => Promise.resolve())
}));

vi.mock('@strudel/webaudio', () => ({
  getAudioContext: vi.fn(() => ({ currentTime: 0 })),
  webaudioOutput: vi.fn(() => ({})),
  initAudioOnFirstClick: vi.fn()
}));

vi.mock('@strudel/mini', () => ({}));
vi.mock('@strudel/tonal', () => ({}));

describe('StrudelEngine', () => {
  let engine: StrudelEngine;

  beforeEach(() => {
    engine = new StrudelEngine();
    vi.clearAllMocks();
    capturedOnEvalError = undefined;
    capturedOnToggle = undefined;
    mockEvaluate.mockResolvedValue(undefined);
  });

  describe('initial state', () => {
    it('starts uninitialized', () => {
      expect(engine.state).toBe('uninitialized');
      expect(engine.isInitialized).toBe(false);
      expect(engine.isPlaying).toBe(false);
    });
  });

  describe('initialize', () => {
    it('transitions to stopped state after initialization', async () => {
      const states: EngineState[] = [];
      engine.stateChanged.connect((_sender, state) => states.push(state));

      await engine.initialize();

      expect(engine.state).toBe('stopped');
      expect(engine.isInitialized).toBe(true);
      expect(states).toEqual(['stopped']);
    });

    it('is idempotent — second call is a no-op', async () => {
      await engine.initialize();
      await engine.initialize();

      const { repl } = await import('@strudel/core');
      expect(repl).toHaveBeenCalledTimes(1);
    });
  });

  describe('evaluateAndPlay', () => {
    it('auto-initializes on first call', async () => {
      await engine.evaluateAndPlay('note("c3")');

      expect(engine.isInitialized).toBe(true);
      expect(mockEvaluate).toHaveBeenCalledWith('note("c3")', true, true);
    });

    it('emits success on successful evaluation', async () => {
      const results: EvaluationResult[] = [];
      engine.evaluationCompleted.connect((_sender, result) =>
        results.push(result)
      );

      await engine.evaluateAndPlay('note("c3")');

      expect(results).toEqual([{ success: true }]);
    });

    it('emits error when onEvalError callback fires', async () => {
      const results: EvaluationResult[] = [];
      engine.evaluationCompleted.connect((_sender, result) =>
        results.push(result)
      );

      mockEvaluate.mockImplementation(async () => {
        capturedOnEvalError?.(new Error('[mini] parse error at line 1'));
      });

      await engine.evaluateAndPlay('bad code');

      expect(results).toEqual([
        { success: false, error: '[mini] parse error at line 1' }
      ]);
    });

    it('emits error when evaluation throws', async () => {
      const results: EvaluationResult[] = [];
      engine.evaluationCompleted.connect((_sender, result) =>
        results.push(result)
      );

      mockEvaluate.mockRejectedValue(new Error('unexpected error'));
      await engine.evaluateAndPlay('bad code');

      expect(results).toEqual([
        { success: false, error: 'unexpected error' }
      ]);
    });

    it('does not re-initialize if already initialized', async () => {
      await engine.evaluateAndPlay('note("c3")');
      await engine.evaluateAndPlay('note("e3")');

      const { repl } = await import('@strudel/core');
      expect(repl).toHaveBeenCalledTimes(1);
      expect(mockEvaluate).toHaveBeenCalledTimes(2);
    });
  });

  describe('onToggle callback', () => {
    it('updates state to playing when onToggle fires with true', async () => {
      await engine.initialize();

      const states: EngineState[] = [];
      engine.stateChanged.connect((_sender, state) => states.push(state));

      capturedOnToggle?.(true);

      expect(engine.state).toBe('playing');
      expect(engine.isPlaying).toBe(true);
      expect(states).toEqual(['playing']);
    });

    it('updates state to stopped when onToggle fires with false', async () => {
      await engine.initialize();
      capturedOnToggle?.(true);

      const states: EngineState[] = [];
      engine.stateChanged.connect((_sender, state) => states.push(state));

      capturedOnToggle?.(false);

      expect(engine.state).toBe('stopped');
      expect(engine.isPlaying).toBe(false);
      expect(states).toEqual(['stopped']);
    });
  });

  describe('stop', () => {
    it('calls stop on the repl instance when playing', async () => {
      await engine.initialize();
      capturedOnToggle?.(true);

      engine.stop();

      expect(mockStop).toHaveBeenCalledOnce();
    });

    it('is a no-op when not playing', () => {
      engine.stop();

      expect(mockStop).not.toHaveBeenCalled();
    });

    it('is a no-op when stopped', async () => {
      await engine.initialize();

      engine.stop();

      expect(mockStop).not.toHaveBeenCalled();
    });
  });
});
