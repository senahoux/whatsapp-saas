-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_contactId_fkey";

-- DropForeignKey
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_contactId_fkey";

-- DropForeignKey
ALTER TABLE "logs" DROP CONSTRAINT "logs_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_contactId_fkey";

-- DropForeignKey
ALTER TABLE "schedule_blocks" DROP CONSTRAINT "schedule_blocks_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "settings" DROP CONSTRAINT "settings_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_clinicId_fkey";
