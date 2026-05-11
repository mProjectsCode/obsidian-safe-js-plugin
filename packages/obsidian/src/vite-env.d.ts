/* eslint-disable @typescript-eslint/prefer-function-type */

declare module '*?worker&inline' {
	interface InlineWorkerConstructor {
		new (): Worker;
	}

	const workerConstructor: InlineWorkerConstructor;
	export default workerConstructor;
}
