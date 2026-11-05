export type PushSetupStatus = 'needs-permission' | 'denied' | 'ready';

/** Rotating a VAPID key must never implicitly request notification permission. */
export async function ensurePushSubscription(options: {
  manager: PushManager;
  publicKey: string;
  permission: NotificationPermission;
  isCurrent: () => boolean;
  persist: (subscription: PushSubscription, previousEndpoint?: string) => Promise<void>;
}): Promise<PushSetupStatus> {
  if (options.permission !== 'granted') return options.permission === 'denied' ? 'denied' : 'needs-permission';
  const encoded = options.publicKey.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(encoded + '='.repeat((4 - encoded.length % 4) % 4));
  const key = Uint8Array.from(raw, character => character.charCodeAt(0));
  if (key.length !== 65 || key[0] !== 4) throw new Error('A chave de notificações não está configurada corretamente.');
  const assertCurrent = () => {
    if (!options.isCurrent()) throw new Error('A sessão de notificações mudou.');
  };
  assertCurrent();
  let subscription = await options.manager.getSubscription();
  assertCurrent();
  const previousEndpoint = subscription?.endpoint;
  const previous = subscription?.options.applicationServerKey;
  const matches = previous && previous.byteLength === key.byteLength
    && key.every((value, index) => new Uint8Array(previous)[index] === value);
  if (subscription && !matches) {
    const removed = await subscription.unsubscribe();
    assertCurrent();
    if (!removed && await options.manager.getSubscription()) throw new Error('Não foi possível renovar a inscrição de notificações.');
    subscription = null;
  }
  assertCurrent();
  if (!subscription) subscription = await options.manager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  assertCurrent();
  await options.persist(subscription, previousEndpoint);
  assertCurrent();
  return 'ready';
}
