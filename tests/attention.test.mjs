import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeAttentionDismissals,
  attentionDismissalExpiry,
  isDismissibleAttentionKind
} from '../.core-dist/core/attention.js';

test('attention snooze clamps duration to a quiet but bounded window',()=>{
  const now=1_000_000;
  assert.equal(attentionDismissalExpiry(now,0),now+24*60*60*1000);
  assert.equal(attentionDismissalExpiry(now,7),now+7*24*60*60*1000);
  assert.equal(attentionDismissalExpiry(now,100),now+30*24*60*60*1000);
});

test('active attention dismissals are user-specific and expire',()=>{
  const now=10_000;
  const result=activeAttentionDismissals([
    {attentionKey:'anomaly:1',userUid:'u1',expiresAtMs:20_000},
    {attentionKey:'ending:2',userUid:'u2',expiresAtMs:20_000},
    {attentionKey:'old:3',userUid:'u1',expiresAtMs:9_000}
  ],'u1',now);
  assert.deepEqual(result,['anomaly:1']);
});

test('overdue and due-today attention cannot be silenced',()=>{
  assert.equal(isDismissibleAttentionKind('overdue'),false);
  assert.equal(isDismissibleAttentionKind('due_today'),false);
  assert.equal(isDismissibleAttentionKind('anomaly'),true);
});
