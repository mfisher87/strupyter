import { Signal, ISignal } from '@lumino/signaling';

/**
 * Minimal subset of the Yjs Awareness interface we depend on.
 * Avoids a hard dependency on the Yjs types package.
 */
export interface AwarenessLike {
  clientID: number;
  getStates(): Map<number, Record<string, unknown>>;
  setLocalStateField(field: string, value: unknown): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
  off(event: string, callback: (...args: unknown[]) => void): void;
}

/**
 * Manages awareness-based update broadcasting for Strudel collaboration.
 * When a user evaluates code, an ephemeral "strudelUpdate" event is broadcast
 * via the Yjs awareness protocol. Remote collaborators who have opted in
 * to listening will receive the event and evaluate the shared document.
 */
export class StrudelCollaboration {
  private _listening = false;
  private _awareness: AwarenessLike | null = null;
  private readonly _lastTimestamps = new Map<number, number>();
  private readonly _remoteUpdateReceived = new Signal<this, void>(this);
  private readonly _listeningChanged = new Signal<this, boolean>(this);
  private readonly _connectionChanged = new Signal<this, boolean>(this);

  get isListening(): boolean {
    return this._listening;
  }

  get remoteUpdateReceived(): ISignal<this, void> {
    return this._remoteUpdateReceived;
  }

  get listeningChanged(): ISignal<this, boolean> {
    return this._listeningChanged;
  }

  get isConnected(): boolean {
    return this._awareness !== null;
  }

  get connectionChanged(): ISignal<this, boolean> {
    return this._connectionChanged;
  }

  setAwareness(awareness: AwarenessLike | null): void {
    if (this._awareness) {
      this._awareness.off('change', this._onAwarenessChange);
    }

    this._awareness = awareness;
    this._lastTimestamps.clear();

    if (this._awareness) {
      this._snapshotTimestamps();
      this._awareness.on('change', this._onAwarenessChange);
    }

    this._connectionChanged.emit(this._awareness !== null);
  }

  setListening(enabled: boolean): void {
    if (this._listening === enabled) {
      return;
    }
    this._listening = enabled;
    this._listeningChanged.emit(enabled);
  }

  broadcastUpdate(): void {
    if (!this._awareness) {
      return;
    }
    this._awareness.setLocalStateField('strudelUpdate', {
      timestamp: Date.now()
    });
  }

  dispose(): void {
    this.setAwareness(null);
  }

  private _snapshotTimestamps(): void {
    if (!this._awareness) {
      return;
    }
    for (const [clientId, state] of this._awareness.getStates()) {
      const update = state['strudelUpdate'] as
        | { timestamp: number }
        | undefined;
      if (update) {
        this._lastTimestamps.set(clientId, update.timestamp);
      }
    }
  }

  private readonly _onAwarenessChange = (): void => {
    if (!this._listening || !this._awareness) {
      return;
    }

    for (const [clientId, state] of this._awareness.getStates()) {
      if (clientId === this._awareness.clientID) {
        continue;
      }

      const update = state['strudelUpdate'] as
        | { timestamp: number }
        | undefined;
      if (!update) {
        continue;
      }

      const lastTimestamp = this._lastTimestamps.get(clientId);
      if (lastTimestamp === undefined || update.timestamp > lastTimestamp) {
        this._lastTimestamps.set(clientId, update.timestamp);
        this._remoteUpdateReceived.emit();
        // Only process one remote update per awareness change batch
        return;
      }
    }
  };
}
