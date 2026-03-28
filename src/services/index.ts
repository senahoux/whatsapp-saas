/**
 * Services barrel export — WhatsApp SaaS
 *
 * Importar via:
 *   import { ContactService, ConversationService, MessageService } from "@/services"
 *   import { ClinicService } from "@/services/clinic.service"
 *   import { LogService } from "@/services/log.service"
 */

export { ContactService } from "./contact.service";
export type {
    UpsertContactInput,
    UpdateContactInput,
    ListContactsOptions,
} from "./contact.service";

export { ConversationService } from "./conversation.service";
export type {
    ConversationWithContact,
    ListConversationsOptions,
} from "./conversation.service";

export { MessageService } from "./message.service";
export type {
    CreateMessageInput,
    ListMessagesOptions,
    HistoryMessage,
} from "./message.service";

export { ClinicService } from "./clinic.service";
export type { ClinicContext } from "./clinic.service";

export { LogService } from "./log.service";
export type { ListLogsOptions } from "./log.service";

export { AppointmentService } from "./appointment.service";
export { NotificationService } from "./notification.service";
export { DashboardService } from "./dashboard.service";
export { SettingsService } from "./settings.service";
