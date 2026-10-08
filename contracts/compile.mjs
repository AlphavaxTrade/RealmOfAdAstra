// Sözleşmeleri derler: node contracts/compile.mjs  →  contracts/build/<Ad>.json (abi + bytecode)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

const here = path.dirname(fileURLToPath(import.meta.url));

export function compile(files = ['RealmPayments.sol', 'RealmRates.sol', 'OyunKasasi.sol', 'test/MockToken.sol', 'test/BadTokens.sol']) {
  const sources = Object.fromEntries(files.map(f => [f, { content: fs.readFileSync(path.join(here, f), 'utf8') }]));
  const input = {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',                     // Avalanche C-Chain ile en geniş uyum
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } }
    }
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors || []).filter(e => e.severity === 'error');
  if (errors.length) throw new Error(errors.map(e => e.formattedMessage).join('\n'));
  const result = {};
  for (const [file, contracts] of Object.entries(out.contracts)) {
    for (const [name, c] of Object.entries(contracts)) {
      result[name] = { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object, source: file };
    }
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = compile();
  const dir = path.join(here, 'build');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, c] of Object.entries(res)) {
    fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify({ abi: c.abi, bytecode: c.bytecode }, null, 1));
    console.log(`✅ ${name} derlendi (${(c.bytecode.length - 2) / 2} bayt)`);
  }
}
