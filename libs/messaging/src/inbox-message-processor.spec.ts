import { InboxClaimStatus, InboxService } from '@app/messaging';
import { InboxMessageProcessor } from './inbox-message-processor';

describe('InboxMessageProcessor', () => {
  let sut: InboxMessageProcessor;
  let inboxService: {
    claim: jest.Mock;
    runInTransaction: jest.Mock;
  };
  let delivery: {
    ack: jest.Mock;
    nack: jest.Mock;
  };

  const message = { id: 'event-123', orderId: 'order-123' };
  const handler = {
    consumerId: 'notification-service',
    pattern: 'payment.paymentcompleted',
    getMessageId: (value: typeof message) => value.id,
    handle: jest.fn(),
  };

  beforeEach(() => {
    inboxService = {
      claim: jest.fn(),
      runInTransaction: jest.fn(),
    };
    delivery = {
      ack: jest.fn(),
      nack: jest.fn(),
    };
    sut = new InboxMessageProcessor(inboxService as unknown as InboxService);
    jest.clearAllMocks();
  });

  it('dead-letters messages without a valid id', async () => {
    await sut.process({
      message: { ...message, id: ' ' },
      delivery,
      handler,
    });

    expect(inboxService.claim).not.toHaveBeenCalled();
    expect(delivery.nack).toHaveBeenCalledWith(false);
  });

  it.each([InboxClaimStatus.PROCESSED, InboxClaimStatus.IN_FLIGHT])(
    'acknowledges a %s message',
    async (status) => {
      inboxService.claim.mockResolvedValue({ status, claimToken: null });

      await sut.process({ message, delivery, handler });

      expect(delivery.ack).toHaveBeenCalled();
      expect(delivery.nack).not.toHaveBeenCalled();
      expect(handler.handle).not.toHaveBeenCalled();
    }
  );

  it('dead-letters an exhausted message', async () => {
    inboxService.claim.mockResolvedValue({
      status: InboxClaimStatus.EXHAUSTED,
      claimToken: null,
    });

    await sut.process({ message, delivery, handler });

    expect(delivery.nack).toHaveBeenCalledWith(false);
    expect(delivery.ack).not.toHaveBeenCalled();
  });

  it.each([InboxClaimStatus.CLAIMED, InboxClaimStatus.RETRYABLE])(
    'runs transaction work and acknowledges a %s message',
    async (status) => {
      const claim = { status, claimToken: 'claim-token' };
      inboxService.claim.mockResolvedValue(claim);
      inboxService.runInTransaction.mockImplementation(async ({ work }) => work({} as never));

      await sut.process({ message, delivery, handler });

      expect(inboxService.runInTransaction).toHaveBeenCalledWith({
        claim,
        work: expect.any(Function),
      });
      expect(handler.handle).toHaveBeenCalledWith({
        message,
        manager: expect.anything(),
      });
      expect(delivery.ack).toHaveBeenCalled();
      expect(delivery.nack).not.toHaveBeenCalled();
    }
  );

  it('requeues messages when processing fails', async () => {
    inboxService.claim.mockResolvedValue({
      status: InboxClaimStatus.CLAIMED,
      claimToken: 'claim-token',
    });
    inboxService.runInTransaction.mockRejectedValue(new Error('database unavailable'));

    await sut.process({ message, delivery, handler });

    expect(delivery.nack).toHaveBeenCalledWith(true);
    expect(delivery.ack).not.toHaveBeenCalled();
  });
});
