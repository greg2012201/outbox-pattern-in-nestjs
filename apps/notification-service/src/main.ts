import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { NotificationServiceModule } from './app.module';
import { getRabbitMQConfig } from '@app/messaging';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.notification' });

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    NotificationServiceModule,
    getRabbitMQConfig({ queue: 'notification_service_queue', noAck: false })
  );

  await app.listen();
  console.log('Notification service is listening on RabbitMQ queue: notification_service_queue');
}

bootstrap();
