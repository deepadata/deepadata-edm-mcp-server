/**
 * Resources module exports
 */

export {
  EdmResourceProvider,
  EdmResourceError,
  EdmResourceErrorCode,
  EDM_URI_PREFIX,
  EDM_MIME_TYPE,
  parseEdmUri,
  buildEdmUri,
  getEdmResourceTemplates,
  type EdmResourceResult,
  type EdmResourceListItem,
} from './edm.js';

export {
  DdnaResourceProvider,
  DdnaResourceError,
  DdnaResourceErrorCode,
  DDNA_URI_PREFIX,
  DDNA_MIME_TYPE,
  parseDdnaUri,
  buildDdnaUri,
  getDdnaResourceTemplates,
  type DdnaResourceResult,
  type DdnaResourceListItem,
  type VerifySignature,
} from './ddna.js';
