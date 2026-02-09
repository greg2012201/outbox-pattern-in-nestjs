import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { EmailServiceModule } from './app.module';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.email' });

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(EmailServiceModule, {
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
      queue: 'email_service_queue',
      queueOptions: {
        durable: true,
      },
    },
  });

  await app.listen();
  console.log('Email service is listening on RabbitMQ queue: email_service_queue');
}

bootstrap();
