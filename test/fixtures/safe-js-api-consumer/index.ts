import type { App, Plugin } from 'obsidian';
import { SAFE_JS_PLUGIN_ID, getSafeJsApi, getSafeJsPlugin } from '@lemons_dev/obsidian-safe-js-api';
import type {
	PermissionDefinition,
	SafeJsCallerApi,
	SafeJsExecutionResult,
	SafeJsRenderedOutput,
	SandboxFunctionDefinition,
	SandboxGlobalDefinition,
} from '@lemons_dev/obsidian-safe-js-api';
import type { WorkerRpcBinding } from '@lemons_dev/obsidian-safe-js-api/internal';

declare const app: App;
declare const callerPlugin: Plugin;

const plugin = getSafeJsPlugin(app);
const api = getSafeJsApi(app, callerPlugin);

if (plugin !== undefined) {
	const publicApi = plugin.api.forPlugin(callerPlugin);
	publicApi.getValidatorIds();
}

if (api !== undefined) {
	const callerApi: SafeJsCallerApi = api;
	const result: Promise<SafeJsExecutionResult> = callerApi.execute('// @permission ui:notify\nawait api.ui.notify("Hello");');
	void result;
}

const permission: PermissionDefinition = {
	id: 'sample:use',
	name: 'Use sample integration',
	description: 'Allow the sample integration to run.',
	severity: 'low',
	grantGuidance: 'Grant this when testing the Safe JS API types.',
};

const sandboxFunction: SandboxFunctionDefinition<{ message: string }, { ok: true }> = {
	method: 'sample.notify',
	permission: permission.id,
	namespace: 'sample',
	functionName: 'notify',
	description: 'Show a sample notification.',
	usage: 'await api.sample.notify({ message: "Hello" })',
	paramStyle: 'object',
	requestValidator(value) {
		if (typeof value === 'object' && value !== null && typeof (value as { message?: unknown }).message === 'string') {
			return { success: true, data: value as { message: string } };
		}

		return { success: false, message: 'Expected a message string.' };
	},
	responseValidator: 'response:ok',
	handler(params, context) {
		params.message.toUpperCase();
		context.callerPluginId.toUpperCase();
		return { ok: true };
	},
};

const sandboxGlobal: SandboxGlobalDefinition = {
	name: 'sampleConfig',
	description: 'Sample JSON-safe configuration.',
	value: {
		pluginId: SAFE_JS_PLUGIN_ID,
	},
	permission: permission.id,
};

const renderedOutput: SafeJsRenderedOutput = {
	format: 'markdown',
	content: '**Done**',
};

const workerBinding: WorkerRpcBinding = {
	method: sandboxFunction.method,
	namespace: sandboxFunction.namespace,
	functionName: sandboxFunction.functionName,
	permission: sandboxFunction.permission,
	paramStyle: sandboxFunction.paramStyle,
};

void sandboxFunction;
void sandboxGlobal;
void renderedOutput;
void workerBinding;
