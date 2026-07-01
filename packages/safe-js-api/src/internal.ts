import type { JsonValue, PermissionId, SandboxParamStyle } from './index';

export type { JsonValue, PermissionId, SandboxParamStyle };

export interface WorkerSandboxGlobal {
	name: string;
	value: JsonValue;
}

export interface WorkerRpcBinding {
	method: string;
	namespace: string;
	functionName: string;
	permission: PermissionId;
	paramStyle: SandboxParamStyle;
	argNames?: string[];
}

export interface ExecuteWorkerMessage {
	type: 'execute';
	executionId: string;
	code: string;
	mode: 'script' | 'expression';
	inputs: Record<string, JsonValue>;
	rpcBindings: WorkerRpcBinding[];
	sandboxGlobals: WorkerSandboxGlobal[];
}

export interface HostRpcRequestMessage {
	type: 'rpc-request';
	executionId: string;
	rpcRequestId: string;
	method: string;
	params: JsonValue;
}

export interface HostRpcError {
	code: string;
	message: string;
}

export interface HostRpcResponseSuccessMessage {
	type: 'rpc-response';
	executionId: string;
	rpcRequestId: string;
	ok: true;
	result: JsonValue;
}

export interface HostRpcResponseFailureMessage {
	type: 'rpc-response';
	executionId: string;
	rpcRequestId: string;
	ok: false;
	error: HostRpcError;
}

export type HostRpcResponseMessage = HostRpcResponseSuccessMessage | HostRpcResponseFailureMessage;

export interface WorkerExecutionSuccessMessage {
	type: 'execution-result';
	executionId: string;
	ok: true;
	value: JsonValue;
}

export interface WorkerExecutionFailureMessage {
	type: 'execution-result';
	executionId: string;
	ok: false;
	error: {
		name: string;
		message: string;
		stack?: string;
	};
}

export type WorkerExecutionResultMessage = WorkerExecutionSuccessMessage | WorkerExecutionFailureMessage;
export type WorkerToHostMessage = HostRpcRequestMessage | WorkerExecutionResultMessage;
