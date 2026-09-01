import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { EmailServiceModule } from './app.module';
import { getRabbitMQConfig } from '@app/messaging';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.email' });

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    EmailServiceModule,
    getRabbitMQConfig({ queue: 'email_service_queue', noAck: false })
  );

  await app.listen();
  console.log('Email service is listening on RabbitMQ queue: email_service_queue');
}

bootstrap();
