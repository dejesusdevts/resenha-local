import { create } from 'zustand';
import { Profile } from '../types';

type ProfileState = {
  profile: Profile | null;
  biometricReady: boolean;
  setProfile: (profile: Profile) => void;
  clearProfile: () => void;
  setBiometricReady: (ready: boolean) => void;
};

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  biometricReady: false,
  setProfile: (profile) => set({ profile }),
  clearProfile: () => set({ profile: null }),
  setBiometricReady: (ready) => set({ biometricReady: ready }),
}));
