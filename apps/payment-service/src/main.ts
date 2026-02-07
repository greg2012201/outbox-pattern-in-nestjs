import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { PaymentServiceModule } from './app.module';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.payment' });

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(PaymentServiceModule, {
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URLS || 'amqp://localhost:5672'],
      queue: 'payment_service_queue',
      queueOptions: {
        durable: true,
      },
    },
  });

  await app.listen();
  console.log('Payment service is listening on RabbitMQ queue: payment_service_queue');
}

bootstrap();
