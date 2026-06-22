import { create } from 'zustand';

export type PendingIdentityChange = {
  endpointId: string;
  username: string;
  oldFingerprint: string;
  newFingerprint: string;
  logId: string;
  pendingIdentityPublicKey: string; // base64
  pendingEphemeralPublicKey: string; // base64
};

type SecurityState = {
  pendingChangesByEndpoint: Record<string, PendingIdentityChange>;
  setPendingChange: (endpointId: string, change: PendingIdentityChange) => void;
  clearPendingChange: (endpointId: string) => void;
  reset: () => void;
};

export const useSecurityStore = create<SecurityState>((set) => ({
  pendingChangesByEndpoint: {},
  setPendingChange: (endpointId, change) =>
    set((state) => ({ pendingChangesByEndpoint: { ...state.pendingChangesByEndpoint, [endpointId]: change } })),
  clearPendingChange: (endpointId) =>
    set((state) => {
      const next = { ...state.pendingChangesByEndpoint };
      delete next[endpointId];
      return { pendingChangesByEndpoint: next };
    }),
  reset: () => set({ pendingChangesByEndpoint: {} }),
}));
