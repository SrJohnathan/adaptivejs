/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

export {
  createApiExternalAdapter,
  createExternalAuthAdapter,
  type ExternalAuthAdapterOptions
} from "./external-adapter.js";

export type {
  ApiExternalAdapter,
  ExternalAuthAdapter,
  ExternalAuthInput,
  ExternalAuthResult
} from "./types.js";
