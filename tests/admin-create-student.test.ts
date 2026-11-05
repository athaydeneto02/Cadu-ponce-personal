import test from 'node:test';
import assert from 'node:assert/strict';
import { newUserInput } from '../api/admin-create-user';

const base = { email: 'student@example.test', name: 'Aluno de teste', password: 'senha-inicial-longa', trainerPhone: '5543999990000' };
test('account creation stores the student phone separately and ignores unsupported auto-delivery settings', () => {
  const value = newUserInput({ ...base, metadata: { phone: '(43) 99999-1234', birthDate: '2000-02-29', sendAccessInfo: true, blockDefaulters: 'Automático' } });
  assert.equal(value.metadata.phone, '5543999991234');
  assert.equal(value.trainer_phone, base.trainerPhone);
  assert.equal(value.metadata.birthDate, '2000-02-29');
  assert.equal('sendAccessInfo' in value.metadata, false);
  assert.equal('blockDefaulters' in value.metadata, false);
});
test('account creation rejects invalid student phones and impossible birth dates', () => {
  assert.throws(() => newUserInput({ ...base, metadata: { phone: '123' } }), /WhatsApp/);
  assert.throws(() => newUserInput({ ...base, metadata: { birthDate: '2025-02-31' } }), /Data de nascimento/);
  assert.throws(() => newUserInput({ ...base, metadata: { birthDate: '31/12/2000' } }), /Data de nascimento/);
});
