import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrudelCollaboration } from '../collaboration';
import type { AwarenessLike } from '../collaboration';

function createMockAwareness({
  clientID = 1
}: { clientID?: number } = {}): AwarenessLike & {
  triggerChange: () => void;
  setRemoteState: (
    remoteClientId: number,
    state: Record<string, unknown>
  ) => void;
} {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const states = new Map<number, Record<string, unknown>>();
  const localState: Record<string, unknown> = {};
  states.set(clientID, localState);

  return {
    clientID,
    getStates: () => states,
    setLocalStateField: (field: string, value: unknown) => {
      localState[field] = value;
    },
    on: (event: string, callback: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)!.push(callback);
    },
    off: (event: string, callback: (...args: unknown[]) => void) => {
      const cbs = listeners.get(event);
      if (cbs) {
        const idx = cbs.indexOf(callback);
        if (idx >= 0) {
          cbs.splice(idx, 1);
        }
      }
    },
    triggerChange: () => {
      for (const cb of listeners.get('change') ?? []) {
        cb();
      }
    },
    setRemoteState: (
      remoteClientId: number,
      state: Record<string, unknown>
    ) => {
      states.set(remoteClientId, state);
    }
  };
}

describe('StrudelCollaboration', () => {
  let collaboration: StrudelCollaboration;
  let awareness: ReturnType<typeof createMockAwareness>;

  beforeEach(() => {
    collaboration = new StrudelCollaboration();
    awareness = createMockAwareness({ clientID: 1 });
  });

  describe('broadcastUpdate', () => {
    it('sets strudelUpdate on awareness local state', () => {
      collaboration.setAwareness(awareness);
      collaboration.broadcastUpdate();

      const states = awareness.getStates();
      const localState = states.get(1);
      expect(localState).toBeDefined();
      expect(localState!['strudelUpdate']).toBeDefined();
      expect(
        (localState!['strudelUpdate'] as { timestamp: number }).timestamp
      ).toBeGreaterThan(0);
    });

    it('is a no-op when awareness is null', () => {
      collaboration.broadcastUpdate();
    });
  });

  describe('receiving remote updates', () => {
    it('emits remoteUpdateReceived when listening and remote state changes', () => {
      collaboration.setAwareness(awareness);
      collaboration.setListening(true);

      const handler = vi.fn();
      collaboration.remoteUpdateReceived.connect(handler);

      awareness.setRemoteState(2, { strudelUpdate: { timestamp: 100 } });
      awareness.triggerChange();

      expect(handler).toHaveBeenCalledOnce();
    });

    it('does not emit when listening is off', () => {
      collaboration.setAwareness(awareness);
      collaboration.setListening(false);

      const handler = vi.fn();
      collaboration.remoteUpdateReceived.connect(handler);

      awareness.setRemoteState(2, { strudelUpdate: { timestamp: 100 } });
      awareness.triggerChange();

      expect(handler).not.toHaveBeenCalled();
    });

    it('ignores updates from own client', () => {
      collaboration.setAwareness(awareness);
      collaboration.setListening(true);

      const handler = vi.fn();
      collaboration.remoteUpdateReceived.connect(handler);

      awareness.setLocalStateField('strudelUpdate', { timestamp: 100 });
      awareness.triggerChange();

      expect(handler).not.toHaveBeenCalled();
    });

    it('does not re-emit for the same timestamp', () => {
      collaboration.setAwareness(awareness);
      collaboration.setListening(true);

      const handler = vi.fn();
      collaboration.remoteUpdateReceived.connect(handler);

      awareness.setRemoteState(2, { strudelUpdate: { timestamp: 100 } });
      awareness.triggerChange();
      awareness.triggerChange();

      expect(handler).toHaveBeenCalledOnce();
    });

    it('emits again when timestamp increases', () => {
      collaboration.setAwareness(awareness);
      collaboration.setListening(true);

      const handler = vi.fn();
      collaboration.remoteUpdateReceived.connect(handler);

      awareness.setRemoteState(2, { strudelUpdate: { timestamp: 100 } });
      awareness.triggerChange();

      awareness.setRemoteState(2, { strudelUpdate: { timestamp: 200 } });
      awareness.triggerChange();

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('setListening', () => {
    it('emits listeningChanged signal', () => {
      const handler = vi.fn();
      collaboration.listeningChanged.connect(handler);

      collaboration.setListening(true);
      collaboration.setListening(false);

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenNthCalledWith(1, collaboration, true);
      expect(handler).toHaveBeenNthCalledWith(2, collaboration, false);
    });

    it('does not emit when value does not change', () => {
      const handler = vi.fn();
      collaboration.listeningChanged.connect(handler);

      collaboration.setListening(false);
      collaboration.setListening(false);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('removes awareness listener', () => {
      collaboration.setAwareness(awareness);
      collaboration.setListening(true);
      collaboration.dispose();

      const handler = vi.fn();
      collaboration.remoteUpdateReceived.connect(handler);

      awareness.setRemoteState(2, { strudelUpdate: { timestamp: 100 } });
      awareness.triggerChange();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('setAwareness', () => {
    it('snapshots existing timestamps to avoid spurious triggers', () => {
      awareness.setRemoteState(2, { strudelUpdate: { timestamp: 50 } });

      collaboration.setAwareness(awareness);
      collaboration.setListening(true);

      const handler = vi.fn();
      collaboration.remoteUpdateReceived.connect(handler);

      // Trigger without updating timestamp — should not fire
      awareness.triggerChange();
      expect(handler).not.toHaveBeenCalled();

      // New timestamp — should fire
      awareness.setRemoteState(2, { strudelUpdate: { timestamp: 100 } });
      awareness.triggerChange();
      expect(handler).toHaveBeenCalledOnce();
    });

    it('emits connectionChanged when awareness is set or cleared', () => {
      const handler = vi.fn();
      collaboration.connectionChanged.connect(handler);

      collaboration.setAwareness(awareness);
      expect(handler).toHaveBeenCalledWith(collaboration, true);

      collaboration.setAwareness(null);
      expect(handler).toHaveBeenCalledWith(collaboration, false);
    });

    it('cleans up old awareness listener when switching', () => {
      const awareness2 = createMockAwareness({ clientID: 10 });

      collaboration.setAwareness(awareness);
      collaboration.setListening(true);
      collaboration.setAwareness(awareness2);

      const handler = vi.fn();
      collaboration.remoteUpdateReceived.connect(handler);

      // Update on old awareness — should not fire
      awareness.setRemoteState(2, { strudelUpdate: { timestamp: 100 } });
      awareness.triggerChange();
      expect(handler).not.toHaveBeenCalled();

      // Update on new awareness — should fire
      awareness2.setRemoteState(20, { strudelUpdate: { timestamp: 100 } });
      awareness2.triggerChange();
      expect(handler).toHaveBeenCalledOnce();
    });
  });
});
