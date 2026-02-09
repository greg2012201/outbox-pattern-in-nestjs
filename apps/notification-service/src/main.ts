import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { NotificationServiceModule } from './app.module';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.notification' });

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(NotificationServiceModule, {
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
      queue: 'notification_service_queue',
      queueOptions: {
        durable: true,
      },
    },
  });

  await app.listen();
  console.log('Notification service is listening on RabbitMQ queue: notification_service_queue');
}

bootstrap();
