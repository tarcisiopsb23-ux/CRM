/**
 * PagesMessagingPage — /meta-review/pages-messaging
 * Permissão: pages_messaging
 * Status: IMPLEMENT_LATER — Inbox Messenger será implementado na Fase 3.
 */

import { NotReadyBanner } from "../shared/NotReadyBanner";
import { MetaReviewLayout } from "../shared/MetaReviewLayout";

export function PagesMessagingPage() {
  return (
    <MetaReviewLayout
      permission="pages_messaging"
      useCase="Manage and access Page conversations in Messenger"
      group="GRUPO 2 — FACEBOOK PAGES"
      groupNumber={2}
      testMode="DEVELOPMENT_MOCK"
      docsUrl="https://developers.facebook.com/docs/messenger-platform/"
    >
      <NotReadyBanner
        permission="pages_messaging"
        reason="planned"
        plannedFor="Fase 3 — Conversas (Inbox de Atendimento)"
        notes="O inbox do Messenger será implementado como parte do módulo Mensagens do C8 Control. O fluxo demonstrará: usuário Messenger → webhook → C8 Inbox → resposta humana → Meta API → mensagem entregue no Messenger."
      />
    </MetaReviewLayout>
  );
}
