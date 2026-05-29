import { Signal, ISignal } from '@lumino/signaling';

export interface EvaluationResult {
  readonly success: boolean;
  readonly error?: string;
}

export type EngineState = 'uninitialized' | 'stopped' | 'playing';

/**
 * Wraps the Strudel repl() from @strudel/core with lazy initialization.
 * AudioContext is only created on first play (user gesture required).
 */
export class StrudelEngine {
  private _replInstance: {
    evaluate: (
      code: string,
      autostart?: boolean,
      reset?: boolean
    ) => Promise<unknown>;
    start: () => void;
    stop: () => void;
    state: { evalError?: Error; schedulerError?: Error; started: boolean };
  } | null = null;

  private _state: EngineState = 'uninitialized';
  private _stateChanged = new Signal<this, EngineState>(this);
  private _evaluationCompleted = new Signal<this, EvaluationResult>(this);

  get state(): EngineState {
    return this._state;
  }

  get stateChanged(): ISignal<this, EngineState> {
    return this._stateChanged;
  }

  get evaluationCompleted(): ISignal<this, EvaluationResult> {
    return this._evaluationCompleted;
  }

  get isInitialized(): boolean {
    return this._replInstance !== null;
  }

  get isPlaying(): boolean {
    return this._state === 'playing';
  }

  async initialize(): Promise<void> {
    if (this._replInstance) {
      return;
    }

    // Import the repl factory from @strudel/core (not @strudel/repl)
    const { repl } = await import('@strudel/core');
    const { getAudioContext, webaudioOutput, initAudioOnFirstClick } =
      await import('@strudel/webaudio');

    // Register pattern functions via evalScope
    const { evalScope } = await import('@strudel/core');
    await evalScope(
      import('@strudel/core'),
      import('@strudel/mini'),
      import('@strudel/tonal'),
      import('@strudel/webaudio')
    );

    initAudioOnFirstClick();
    const audioContext = getAudioContext();
    const defaultOutput = webaudioOutput({ audioContext });

    let lastEvalError: Error | undefined;

    this._replInstance = repl({
      defaultOutput,
      getTime: () => audioContext.currentTime,
      onEvalError: (error: Error) => {
        lastEvalError = error;
      },
      onToggle: (started: boolean) => {
        this._state = started ? 'playing' : 'stopped';
        this._stateChanged.emit(this._state);
      }
    });

    // Expose lastEvalError via a getter on state
    const instance = this._replInstance;
    Object.defineProperty(instance, '_getLastEvalError', {
      value: () => {
        const err = lastEvalError;
        lastEvalError = undefined;
        return err;
      }
    });

    this._state = 'stopped';
    this._stateChanged.emit(this._state);
  }

  async evaluateAndPlay(code: string): Promise<EvaluationResult> {
    if (!this._replInstance) {
      await this.initialize();
    }

    const instance = this._replInstance!;

    try {
      // evaluate(code, autostart=true, reset=true)
      // autostart=true means it will call start() if not already started
      await instance.evaluate(code, true, true);

      // Check if an eval error was captured by the callback
      const lastError = (instance as any)._getLastEvalError?.();
      if (lastError) {
        const result: EvaluationResult = {
          success: false,
          error: lastError.message
        };
        this._evaluationCompleted.emit(result);
        return result;
      }

      const result: EvaluationResult = { success: true };
      this._evaluationCompleted.emit(result);
      return result;
    } catch (err) {
      const result: EvaluationResult = {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      };
      this._evaluationCompleted.emit(result);
      return result;
    }
  }

  stop(): void {
    if (!this._replInstance || !this.isPlaying) {
      return;
    }
    this._replInstance.stop();
    // State transition is handled by the onToggle callback
  }
}
