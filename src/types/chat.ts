export type ConversationType = "direct" | "group" | "general";
export type LinkedTo = "team" | "project" | null;

export interface ChatConversation {
  id: string;
  organization_id: string;
  type: ConversationType;
  name: string | null;
  created_by: string | null;
  linked_to: LinkedTo;
  linked_id: string | null;
  is_archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  // campos computados pelo hook
  last_message?: string | null;
  last_message_at?: string | null;
  unread_count: number;
  participants?: ChatParticipant[];
}

export interface ChatParticipant {
  conversation_id: string;
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
  profile?: {
    full_name: string;
    avatar_url: string | null;
    role: string;
  };
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: {
    full_name: string;
    avatar_url: string | null;
  };
}

export interface ProjectMember {
  id: string;
  project_id: string;
  profile_id: string;
  role: string;
  joined_at: string;
  profile?: {
    full_name: string;
    avatar_url: string | null;
    role: string;
  };
}
