export const CCS_STORE_REQUEST = 'CCS_STORE_REQUEST';
export const CCS_STORE_RESPONSE = 'CCS_STORE_RESPONSE';
export const CCS_STORE_BROADCAST = 'CCS_STORE_BROADCAST';

export type StoreRequest = {
  type: typeof CCS_STORE_REQUEST;
  reqId: string;
  action: 'get' | 'set';
  key: string;
  value?: any;
};

export type StoreResponse = {
  type: typeof CCS_STORE_RESPONSE;
  reqId: string;
  key: string;
  value: any;
  error?: string;
};

export type StoreBroadcast = {
  type: typeof CCS_STORE_BROADCAST;
  key: string;
  value: any;
};

type Subscriber = (value: any) => void;

class GlobalStore {
  private reqIdCounter = 0;
  private pendingRequests = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private subscribers = new Map<string, Set<Subscriber>>();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.handleMessage.bind(this));
    }
  }

  private handleMessage(event: MessageEvent) {
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === CCS_STORE_RESPONSE) {
      const response = data as StoreResponse;
      const pending = this.pendingRequests.get(response.reqId);
      if (pending) {
        if (response.error) {
          pending.reject(new Error(response.error));
        } else {
          pending.resolve(response.value);
        }
        this.pendingRequests.delete(response.reqId);
      }
    } else if (data.type === CCS_STORE_BROADCAST) {
      const broadcast = data as StoreBroadcast;
      const subs = this.subscribers.get(broadcast.key);
      if (subs) {
        subs.forEach((cb) => cb(broadcast.value));
      }
    }
  }

  private generateReqId() {
    this.reqIdCounter += 1;
    return `req_${Date.now()}_${this.reqIdCounter}`;
  }

  get<T>(key: string): Promise<T> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.top) {
        reject(new Error('globalStore.get: window.top is undefined'));
        return;
      }
      const reqId = this.generateReqId();
      this.pendingRequests.set(reqId, { resolve, reject });

      const req: StoreRequest = {
        type: CCS_STORE_REQUEST,
        reqId,
        action: 'get',
        key
      };
      window.top.postMessage(req, '*');
    });
  }

  set(key: string, value: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.top) {
        reject(new Error('globalStore.set: window.top is undefined'));
        return;
      }
      const reqId = this.generateReqId();
      this.pendingRequests.set(reqId, { resolve, reject });

      const req: StoreRequest = {
        type: CCS_STORE_REQUEST,
        reqId,
        action: 'set',
        key,
        value
      };
      window.top.postMessage(req, '*');
    });
  }

  subscribe(key: string, cb: Subscriber): () => void {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key)!.add(cb);

    return () => {
      const subs = this.subscribers.get(key);
      if (subs) {
        subs.delete(cb);
        if (subs.size === 0) {
          this.subscribers.delete(key);
        }
      }
    };
  }
}

export const globalStore = new GlobalStore();
