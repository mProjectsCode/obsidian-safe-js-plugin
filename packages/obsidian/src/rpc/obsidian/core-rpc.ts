import type { App } from 'obsidian';
import { Platform, getLanguage, requireApiVersion } from 'obsidian';
import { emptyParamsSchema } from 'packages/obsidian/src/rpc/rpc-common';
import { booleanResponseSchema, method, stringResponseSchema } from 'packages/obsidian/src/rpc/rpc-method-helpers';
import type { RpcMethodDefinition } from 'packages/obsidian/src/rpc/rpc-registry';
import { z } from 'zod';

export function createCoreMethods(app: App): RpcMethodDefinition[] {
	return [
		method({
			method: 'app:getVaultName',
			permission: 'core:read',
			description: 'Read the current vault name.',
			usage: 'api.app.getVaultName()',
			namespace: 'app',
			functionName: 'getVaultName',
			requestSchema: emptyParamsSchema,
			responseSchema: stringResponseSchema,
			handler: () => ({ value: app.vault.getName() }),
		}),
		method({
			method: 'app:isDarkMode',
			permission: 'core:read',
			description: 'Read whether Obsidian is currently using dark mode.',
			usage: 'api.app.isDarkMode()',
			namespace: 'app',
			functionName: 'isDarkMode',
			requestSchema: emptyParamsSchema,
			responseSchema: booleanResponseSchema,
			handler: () => ({ value: app.isDarkMode() }),
		}),
		method({
			method: 'app:requireApiVersion',
			permission: 'core:read',
			description: 'Check whether this Obsidian version satisfies a required API version.',
			usage: 'api.app.requireApiVersion(version)',
			namespace: 'app',
			functionName: 'requireApiVersion',
			argNames: ['version'],
			requestSchema: z.object({ version: z.string().min(1) }),
			responseSchema: booleanResponseSchema,
			handler: params => ({ value: requireApiVersion(params.version) }),
		}),
		method({
			method: 'app:getLanguage',
			permission: 'core:read',
			description: 'Read the current Obsidian language code.',
			usage: 'api.app.getLanguage()',
			namespace: 'app',
			functionName: 'getLanguage',
			requestSchema: emptyParamsSchema,
			responseSchema: stringResponseSchema,
			handler: () => ({ value: getLanguage() }),
		}),
		method({
			method: 'platform:get',
			permission: 'core:read',
			description: 'Read safe platform flags such as mobile, desktop, operating system, phone, and tablet.',
			usage: 'api.platform.get()',
			namespace: 'platform',
			functionName: 'get',
			requestSchema: emptyParamsSchema,
			responseSchema: z.object({
				isDesktop: z.boolean(),
				isMobile: z.boolean(),
				isDesktopApp: z.boolean(),
				isMobileApp: z.boolean(),
				isIosApp: z.boolean(),
				isAndroidApp: z.boolean(),
				isPhone: z.boolean(),
				isTablet: z.boolean(),
				isMacOS: z.boolean(),
				isWin: z.boolean(),
				isLinux: z.boolean(),
				isSafari: z.boolean(),
			}),
			handler: () => ({
				isDesktop: Platform.isDesktop,
				isMobile: Platform.isMobile,
				isDesktopApp: Platform.isDesktopApp,
				isMobileApp: Platform.isMobileApp,
				isIosApp: Platform.isIosApp,
				isAndroidApp: Platform.isAndroidApp,
				isPhone: Platform.isPhone,
				isTablet: Platform.isTablet,
				isMacOS: Platform.isMacOS,
				isWin: Platform.isWin,
				isLinux: Platform.isLinux,
				isSafari: Platform.isSafari,
			}),
		}),
	];
}
