import { expect, it } from 'vitest';
import { eventBridge } from '../src/event-bus';
it('emits and unsubscribes events', () => {
  const values: number[] = [];
  const off = eventBridge.on<number>('demo', (value) => values.push(value));
  eventBridge.emit('demo', 1);
  off();
  eventBridge.emit('demo', 2);
  expect(values).toEqual([1]);
});
