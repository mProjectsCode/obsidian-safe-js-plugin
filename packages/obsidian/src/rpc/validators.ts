import { jsonValueSchema } from 'packages/obsidian/src/execution/contracts';
import { validateVaultPath } from 'packages/obsidian/src/rpc/path-validation';
import { emptyParamsSchema, jsonRecordSchema, okResponseSchema, optionalPathParamsSchema, pathParamsSchema } from 'packages/obsidian/src/rpc/schemas';
import { storageKeySchema, storageValueSchema } from 'packages/obsidian/src/storage/storage-validation';
import { z } from 'zod';

export interface SafeJsValidationContext {
	method?: string;
	direction?: 'request' | 'response' | 'manual';
	validatorId?: string;
}

export interface SafeJsValidationSuccess<T = unknown> {
	success: true;
	data: T;
}

export interface SafeJsValidationFailure {
	success: false;
	message: string;
}

export type SafeJsValidationResult<T = unknown> = SafeJsValidationSuccess<T> | SafeJsValidationFailure;

export interface SafeJsValidator<T = unknown> {
	id: string;
	description: string;
	validate(value: unknown, context: SafeJsValidationContext): SafeJsValidationResult<T>;
}

export type SafeJsValidationFunction<T = unknown> = (value: unknown, context: SafeJsValidationContext) => SafeJsValidationResult<T>;

export type SafeJsValidatorReference<T = unknown> = string | SafeJsValidator<T> | SafeJsValidationFunction<T>;

export interface SafeJsRegistration {
	unregister(): void;
}

export class ValidatorRegistry {
	private readonly validators = new Map<string, SafeJsValidator<unknown>>();

	constructor(validators: readonly SafeJsValidator[] = []) {
		for (const validator of validators) {
			this.register(validator);
		}
	}

	register(validator: SafeJsValidator<unknown>): SafeJsRegistration {
		if (this.validators.has(validator.id)) {
			throw new Error(`Duplicate validator '${validator.id}'.`);
		}

		this.validators.set(validator.id, validator);

		return {
			unregister: (): void => {
				this.validators.delete(validator.id);
			},
		};
	}

	has(id: string): boolean {
		return this.validators.has(id);
	}

	get(id: string): SafeJsValidator<unknown> | undefined {
		return this.validators.get(id);
	}

	getIds(): string[] {
		return [...this.validators.keys()].sort((left, right) => left.localeCompare(right));
	}

	validate<T = unknown>(reference: SafeJsValidatorReference<T>, value: unknown, context: SafeJsValidationContext = {}): SafeJsValidationResult<T> {
		const validator = this.resolve(reference);
		if (validator === undefined) {
			return {
				success: false,
				message: `Unknown validator '${typeof reference === 'string' ? reference : 'custom:inline'}'.`,
			};
		}

		let result: SafeJsValidationResult<unknown>;
		try {
			result = validator.validate(value, {
				...context,
				validatorId: validator.id,
			});
		} catch (error) {
			return {
				success: false,
				message: error instanceof Error ? error.message : `Validator '${validator.id}' failed.`,
			};
		}

		return result as SafeJsValidationResult<T>;
	}

	private resolve<T>(reference: SafeJsValidatorReference<T>): SafeJsValidator<T> | undefined {
		if (typeof reference === 'string') {
			return this.validators.get(reference) as SafeJsValidator<T> | undefined;
		}

		if (isValidator(reference)) {
			return reference;
		}

		return {
			id: 'custom:inline',
			description: 'Inline custom validator.',
			validate: reference,
		};
	}
}

export interface BuiltInValidatorOptions {
	getConfigDir: () => string;
}

export function createBuiltInValidators(options: BuiltInValidatorOptions): SafeJsValidator[] {
	return [
		zodValidator('json:value', 'Any JSON-safe value.', jsonValueSchema),
		zodValidator('json:record', 'A JSON-safe object record.', jsonRecordSchema),
		zodValidator('rpc:emptyParams', 'An empty RPC request object.', emptyParamsSchema),
		zodValidator('rpc:pathParams', 'An RPC request object with a path string.', pathParamsSchema),
		zodValidator('rpc:optionalPathParams', 'An RPC request object with an optional path string.', optionalPathParamsSchema),
		zodValidator('response:ok', 'An OK response object.', okResponseSchema),
		zodValidator('storage:key', 'A Safe JS storage key.', storageKeySchema),
		zodValidator('storage:value', 'A Safe JS storage value.', storageValueSchema),
		vaultPathValidator('vault:path', 'A vault-relative path that does not touch the Obsidian configuration folder.', options.getConfigDir, false),
		vaultPathValidator('vault:optionalPath', 'An optional vault-relative path.', options.getConfigDir, true),
	];
}

export function zodValidator<T>(id: string, description: string, schema: z.ZodType<T>): SafeJsValidator<T> {
	return {
		id,
		description,
		validate(value): SafeJsValidationResult<T> {
			const result = schema.safeParse(value);
			if (!result.success) {
				return {
					success: false,
					message: z.prettifyError(result.error),
				};
			}

			return {
				success: true,
				data: result.data,
			};
		},
	};
}

export function validationSuccess<T>(data: T): SafeJsValidationSuccess<T> {
	return {
		success: true,
		data,
	};
}

export function validationFailure(message: string): SafeJsValidationFailure {
	return {
		success: false,
		message,
	};
}

function vaultPathValidator(id: string, description: string, getConfigDir: () => string, optional: boolean): SafeJsValidator<string | undefined> {
	return {
		id,
		description,
		validate(value): SafeJsValidationResult<string | undefined> {
			if (value === undefined && optional) {
				return validationSuccess(undefined);
			}

			if (typeof value !== 'string') {
				return validationFailure('Expected a vault path string.');
			}

			try {
				return validationSuccess(validateVaultPath(value, { allowEmpty: optional, configDir: getConfigDir() }));
			} catch (error) {
				return validationFailure(error instanceof Error ? error.message : 'Invalid vault path.');
			}
		},
	};
}

function isValidator<T>(value: SafeJsValidatorReference<T>): value is SafeJsValidator<T> {
	return typeof value === 'object' && value !== null && 'id' in value && 'validate' in value;
}
