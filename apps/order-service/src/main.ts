import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { OrderServiceModule } from './app.module';
import { HttpExceptionFilter } from './filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(OrderServiceModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Order Service listening on port ${port}`);
}

bootstrap();
