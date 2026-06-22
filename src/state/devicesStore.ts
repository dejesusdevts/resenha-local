import { create } from 'zustand';
import { NearbyDevice } from '../types';

type DevicesState = {
  devices: Record<string, NearbyDevice>;
  upsertDevice: (device: NearbyDevice) => void;
  removeDevice: (endpointId: string) => void;
  reset: () => void;
};

export const useDevicesStore = create<DevicesState>((set) => ({
  devices: {},
  upsertDevice: (device) =>
    set((state) => ({ devices: { ...state.devices, [device.endpointId]: device } })),
  removeDevice: (endpointId) =>
    set((state) => {
      const next = { ...state.devices };
      delete next[endpointId];
      return { devices: next };
    }),
  reset: () => set({ devices: {} }),
}));
