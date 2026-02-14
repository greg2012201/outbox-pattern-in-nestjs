import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class DirectPublisher {
  constructor(
    @Inject('DIRECT_CLIENT')
    private readonly client: ClientProxy
  ) {}

  async publish(pattern: string, message: Record<string, any>) {
    await lastValueFrom(this.client.emit(pattern, message), { defaultValue: undefined });
  }
}
