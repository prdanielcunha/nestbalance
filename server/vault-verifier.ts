import { createHash } from 'node:crypto';
import { MAX_EVIDENCE_BYTES, signatureMatchesMime } from '../src/core/evidence.js';

export type VaultPreviewExpectation={
  size:number;
  mimeType:string;
  sha256:string;
};

export type VaultPreviewVerification=
  | {ok:true}
  | {ok:false;reason:'invalid_metadata'|'size_mismatch'|'signature_mismatch'|'hash_mismatch'};

export function verifyVaultPreviewBytes(expected:VaultPreviewExpectation,bytes:Buffer):VaultPreviewVerification{
  if(!Number.isSafeInteger(expected.size)||expected.size<=0||expected.size>MAX_EVIDENCE_BYTES||!expected.mimeType||!/^([a-f0-9]{64})$/.test(expected.sha256)){
    return {ok:false,reason:'invalid_metadata'};
  }
  if(bytes.length!==expected.size) return {ok:false,reason:'size_mismatch'};
  if(!signatureMatchesMime(expected.mimeType,new Uint8Array(bytes.subarray(0,4096)))) return {ok:false,reason:'signature_mismatch'};
  const hash=createHash('sha256').update(bytes).digest('hex');
  if(hash!==expected.sha256) return {ok:false,reason:'hash_mismatch'};
  return {ok:true};
}
