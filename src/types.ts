import { Context, SessionFlavor } from "grammy";
import { ConversationFlavor, Conversation } from "@grammyjs/conversations";

export interface SessionData {
  targetCategoryId?: number | null;
  adminProductDraft?: {
    categoryId?: number;
    name?: string;
    description?: string;
    price?: number;
    stock?: number;
  };
}

export type MyContext = ConversationFlavor<Context & SessionFlavor<SessionData>>;
export type MyConversation = Conversation<MyContext, MyContext>;
