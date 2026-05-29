declare module '@strudel/core' {
  export function repl(options: {
    defaultOutput: unknown;
    getTime: () => number;
    onEvalError?: (error: Error) => void;
    onToggle?: (started: boolean) => void;
  }): {
    evaluate: (
      code: string,
      autostart?: boolean,
      reset?: boolean
    ) => Promise<unknown>;
    start: () => void;
    stop: () => void;
    state: { evalError?: Error; schedulerError?: Error; started: boolean };
  };

  export function evalScope(...modules: Promise<unknown>[]): Promise<void>;
}

declare module '@strudel/webaudio' {
  export function getAudioContext(): AudioContext;
  export function webaudioOutput(options: {
    audioContext: AudioContext;
  }): unknown;
  export function initAudioOnFirstClick(): void;
}

declare module '@strudel/mini' {}

declare module '@strudel/tonal' {}

declare module '@strudel/codemirror' {}

declare module '@strudel/repl' {}

declare module '@strudel/transpiler' {}
