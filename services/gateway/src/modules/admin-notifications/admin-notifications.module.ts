import { Module } from '@nestjs/common';
import { EmailDeliveryModule } from '../email-delivery/email-delivery.module';
import { AdminNotificationsService } from './admin-notifications.service';

@Module({
  imports: [EmailDeliveryModule],
  providers: [AdminNotificationsService],
  exports: [AdminNotificationsService],
})
export class AdminNotificationsModule {}
