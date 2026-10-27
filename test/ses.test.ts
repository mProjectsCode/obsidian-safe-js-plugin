import path from 'node:path';
import { expect, test } from 'bun:test';

// SES lockdown freezes process-wide intrinsics. Keep these suites out of Bun's
// automatic test discovery and run each in its own process instead.
for (const suite of ['sandboxing', 'worker-utilities']) {
	test(`isolated SES suite: ${suite}`, async () => {
		const child = Bun.spawn([process.execPath, 'test', path.join(import.meta.dir, 'fixtures/ses', `${suite}.suite.ts`)], {
			cwd: path.join(import.meta.dir, '..'),
			stdout: 'inherit',
			stderr: 'inherit',
		});
		expect(await child.exited).toBe(0);
	}, 10000);
}
