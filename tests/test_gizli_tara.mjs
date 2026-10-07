// Gizli bilgi tarayıcısı (scripts/gizli-tara.mjs): gerçek sızıntıları yakalar, örnek/sahte değerlere ve açık adreslere tepki vermez.
// Not: deneme dizeleri çalışma anında birleştirilir; bu dosyanın kendisi taramada alarm vermesin.
import assert from 'node:assert/strict';
import { taraMetin, yasakDosyaMi } from '../scripts/gizli-tara.mjs';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const hex = n => 'ab12'.repeat(n / 4);

// 1) Gerçek sızıntı örnekleri yakalanır
{
  assert.equal(taraMetin('GAME_WALLET_PRIVATE_KEY=0x' + hex(64)).length, 1, 'cüzdan anahtarı');
  assert.equal(taraMetin('KASA_MASTER_KEY = "' + hex(64) + '"').length, 1, 'ana anahtar');
  assert.equal(taraMetin('const ADMIN_TOKEN: ' + hex(48)).length, 1, 'yönetici şifresi');
  assert.equal(taraMetin('-----BEGIN ' + 'PRIVATE KEY-----').length, 1, 'özel anahtar bloğu');
  assert.equal(taraMetin('AK' + 'IA' + 'ABCDEFGHIJKLMNOP').length, 1, 'AWS anahtarı');
  assert.equal(taraMetin('SMTP_URL=smtps://kullanici:' + 'GercekParola9' + '@smtp.ornek.com:465').length, 1, 'adreste şifre');
  ok('gerçek sızıntılar yakalanır');
}

// 2) Sahte alarm vermemeli
{
  assert.equal(taraMetin('TOKEN_ADDRESS=0x' + hex(40)).length, 0, 'açık token adresi');
  assert.equal(taraMetin('// SMTP_URL ör. smtps://kullanici:sifre@smtp.saglayici.com:465').length, 0, 'örnek şifre');
  assert.equal(taraMetin('const tx = "0x' + hex(64) + '";').length, 0, 'işlem özeti (tx hash)');
  assert.equal(taraMetin('ADMIN_TOKEN=\n').length, 0, 'boş değer');
  assert.equal(taraMetin('SECRET=' + hex(64) + ' // gizli-tara: izin').length, 0, 'izinli satır');
  ok('örnek değerler, açık adresler, işlem özetleri ve izinli satırlar alarm vermez');
}

// 3) Gizli ayar dosyaları depoya girmemeli (örnek dosyalar hariç)
{
  for (const f of ['.env', 'server/.env', '.env.local', 'server/.env.production']) assert.equal(yasakDosyaMi(f), true, f);
  for (const f of ['server/.env.example', '.env.ornek', 'docs/env.md']) assert.equal(yasakDosyaMi(f), false, f);
  ok('.env dosyaları yasak, .env.example serbest');
}

// 4) Satır numarası ve dosya adı bulguda doğru gelir
{
  const b = taraMetin('a\nb\nGAME_WALLET_PRIVATE_KEY=' + hex(64) + '\nd', 'x.js');
  assert.deepEqual(b.map(x => [x.dosya, x.satir]), [['x.js', 3]]);
  ok('bulgu dosya ve satır numarası taşır');
}

console.log(`\n${passed}/4 gizli-tara testi geçti`);
