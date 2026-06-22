import { Module } from '@nestjs/common';
import { AiChatModule } from '../ai-chat/ai-chat.module';
import { RedeemModule } from '../redeem/redeem.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { FeedbackService } from './feedback.service';

@Module({
  imports: [AiChatModule, RedeemModule, AdminNotificationsModule],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
