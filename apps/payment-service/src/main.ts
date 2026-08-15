import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { PaymentServiceModule } from './app.module';
import { getRabbitMQConfig } from '@app/messaging';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.payment' });

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    PaymentServiceModule,
    getRabbitMQConfig({ queue: 'payment_service_queue', noAck: false })
  );

  await app.listen();
  console.log('Payment service is listening on RabbitMQ queue: payment_service_queue');
}

bootstrap();
