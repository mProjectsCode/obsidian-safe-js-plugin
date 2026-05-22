import type { ExecuteWorkerMessage, HostRpcResponseMessage } from '@lemons_dev/obsidian-safe-js-api/internal';
import SafeJsWorker from 'packages/obsidian/src/worker/safe-js-worker.ts?worker&inline';

export type WorkerClientMessage = unknown;
export type HostWorkerMessage = ExecuteWorkerMessage | HostRpcResponseMessage;

export interface WorkerClient {
	postMessage(message: HostWorkerMessage): void;
	terminate(): void;
	onMessage(listener: (message: WorkerClientMessage) => void): () => void;
	onError(listener: (error: Error) => void): () => void;
}

export interface WorkerFactory {
	create(): WorkerClient;
}

export class BrowserWorkerClient implements WorkerClient {
	private readonly worker: Worker;

	constructor(worker: Worker) {
		this.worker = worker;
	}

	postMessage(message: HostWorkerMessage): void {
		this.worker.postMessage(message);
	}

	terminate(): void {
		this.worker.terminate();
	}

	onMessage(listener: (message: WorkerClientMessage) => void): () => void {
		const eventListener = (event: MessageEvent<unknown>): void => {
			listener(event.data);
		};
		this.worker.addEventListener('message', eventListener);
		return () => {
			this.worker.removeEventListener('message', eventListener);
		};
	}

	onError(listener: (error: Error) => void): () => void {
		const eventListener = (event: ErrorEvent): void => {
			listener(event.error instanceof Error ? event.error : new Error(event.message));
		};
		this.worker.addEventListener('error', eventListener);
		return () => {
			this.worker.removeEventListener('error', eventListener);
		};
	}
}

export class BrowserWorkerFactory implements WorkerFactory {
	create(): WorkerClient {
		return new BrowserWorkerClient(new SafeJsWorker());
	}
}
