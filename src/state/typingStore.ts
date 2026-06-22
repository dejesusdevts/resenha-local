import { create } from 'zustand';

type TypingState = {
  typingByConversation: Record<string, boolean>;
  setTyping: (conversationId: string, isTyping: boolean) => void;
  reset: () => void;
};

export const useTypingStore = create<TypingState>((set) => ({
  typingByConversation: {},
  setTyping: (conversationId, isTyping) =>
    set((state) => ({
      typingByConversation: { ...state.typingByConversation, [conversationId]: isTyping },
    })),
  reset: () => set({ typingByConversation: {} }),
}));
