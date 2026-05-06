export type EventHandler<T = unknown> = (payload: T) => void;
export interface EventBridge {
  emit<T = unknown>(event: string, payload?: T): void;
  on<T = unknown>(event: string, handler: EventHandler<T>): () => void;
  off<T = unknown>(event: string, handler: EventHandler<T>): void;
}
class MemoryEventBridge implements EventBridge {
  private readonly listeners = new Map<string, Set<EventHandler>>();
  emit<T = unknown>(event: string, payload?: T) {
    this.listeners.get(event)?.forEach((handler) => handler(payload));
  }
  on<T = unknown>(event: string, handler: EventHandler<T>) {
    const handlers = this.listeners.get(event) ?? new Set<EventHandler>();
    handlers.add(handler as EventHandler);
    this.listeners.set(event, handlers);
    return () => this.off(event, handler);
  }
  off<T = unknown>(event: string, handler: EventHandler<T>) {
    this.listeners.get(event)?.delete(handler as EventHandler);
  }
}
export const eventBridge = new MemoryEventBridge();
export const emit: EventBridge['emit'] = (event, payload) => eventBridge.emit(event, payload);
export const on: EventBridge['on'] = (event, handler) => eventBridge.on(event, handler);
export const CCS_EVENTS = { THEME_CHANGE: 'ccs:theme-change', LANGUAGE_CHANGE: 'ccs:language-change', MODULE_READY: 'ccs:module-ready', NAVIGATE: 'ccs:navigate' } as const;
