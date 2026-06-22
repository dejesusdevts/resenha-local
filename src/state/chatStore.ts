import { create } from 'zustand';
import { Message } from '../types';

type ChatState = {
  messagesByConversation: Record<string, Message[]>;
  addMessage: (message: Message) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;
};

export const useChatStore = create<ChatState>((set) => ({
  messagesByConversation: {},
  addMessage: (message) =>
    set((state) => {
      const existing = state.messagesByConversation[message.conversationId] ?? [];
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [message.conversationId]: [...existing, message],
        },
      };
    }),
  setMessages: (conversationId, messages) =>
    set((state) => ({
      messagesByConversation: { ...state.messagesByConversation, [conversationId]: messages },
    })),
}));
