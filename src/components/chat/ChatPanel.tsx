import { useState } from "react";
import { X, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConversationList } from "./ConversationList";
import { MessageThread } from "./MessageThread";
import { MessageInput } from "./MessageInput";
import { NewConversationModal } from "./NewConversationModal";
import type { UseChatReturn } from "@/hooks/useChat";
import { useAuth } from "@/contexts/AuthContext";

interface ChatPanelProps {
  chat: UseChatReturn;
  onClose: () => void;
}

export function ChatPanel({ chat, onClose }: ChatPanelProps) {
  const { profile } = useAuth();
  const [newConvOpen, setNewConvOpen] = useState(false);

  const {
    conversations,
    activeConversation,
    openConversation,
    backToList,
    messages,
    loadMoreMessages,
    hasMoreMessages,
    sendMessage,
    openOrCreateDirect,
    createGroup,
    addGroupMember,
    removeGroupMember,
    deleteGroup,
    archiveConversation,
    unarchiveConversation,
  } = chat;

  const currentUserId = profile?.id ?? "";

  return (
    <>
      <div
        className="fixed bottom-4 right-4 w-[380px] h-[560px] bg-background border rounded-xl shadow-2xl flex flex-col z-50 overflow-hidden"
        style={{ maxWidth: "calc(100vw - 2rem)", maxHeight: "calc(100vh - 5rem)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 shrink-0">
          {activeConversation ? (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={backToList}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : (
            <div className="w-7" />
          )}
          <p className="flex-1 text-sm font-semibold truncate">
            {activeConversation
              ? activeConversation.type === "direct"
                ? activeConversation.participants?.find((p) => p.user_id !== currentUserId)?.profile?.full_name ?? "Conversa"
                : activeConversation.name ?? "Grupo"
              : "Chat"}
          </p>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          {activeConversation ? (
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-hidden">
                <MessageThread
                  conversation={activeConversation}
                  messages={messages}
                  currentUserId={currentUserId}
                  hasMoreMessages={hasMoreMessages}
                  onLoadMore={loadMoreMessages}
                  onAddMember={(uid) => addGroupMember(activeConversation.id, uid)}
                  onRemoveMember={(uid) => removeGroupMember(activeConversation.id, uid)}
                  onArchive={() => archiveConversation(activeConversation.id)}
                  onUnarchive={() => unarchiveConversation(activeConversation.id)}
                  onDelete={() => deleteGroup(activeConversation.id)}
                />
              </div>
              <MessageInput
                onSend={sendMessage}
                archived={activeConversation.is_archived}
              />
            </div>
          ) : (
            <ConversationList
              conversations={conversations}
              onSelect={openConversation}
              onNewConversation={() => setNewConvOpen(true)}
            />
          )}
        </div>
      </div>

      <NewConversationModal
        open={newConvOpen}
        onOpenChange={setNewConvOpen}
        onCreateDirect={openOrCreateDirect}
        onCreateGroup={createGroup}
      />
    </>
  );
}
