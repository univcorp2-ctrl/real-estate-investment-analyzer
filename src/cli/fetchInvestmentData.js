#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { buildInvestmentDataSet } = require('../data/pipeline');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const inputPath = path.resolve(args.input);
  const property = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  const result = await buildInvestmentDataSet(property, {
    useExternalApis: !args.offline,
    year: args.year ? Number(args.year) : undefined,
    fromQuarter: args.from,
    toQuarter: args.to,
    tileRadius: args.tileRadius ? Number(args.tileRadius) : 0,
    z: args.z ? Number(args.z) : 14,
    landTypeCode: args.landTypeCode,
    maxComparableDistanceMeters: args.maxComparableDistanceMeters ? Number(args.maxComparableDistanceMeters) : undefined
  });

  const output = JSON.stringify(result, null, 2);
  if (args.out) {
    const outPath = path.resolve(args.out);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, output, 'utf8');
    console.log(`Wrote ${outPath}`);
  } else {
    console.log(output);
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--offline') out.offline = true;
    else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) out[key] = true;
      else {
        out[key] = value;
        i += 1;
      }
    }
  }
  return out;
}

function printHelp() {
  console.log(`Usage:
  MLIT_REINFO_API_KEY=xxxx node src/cli/fetchInvestmentData.js --input data/sample-property.json --out data/output.json

Options:
  --input <path>                      物件JSON
  --out <path>                        出力JSON。省略時は標準出力
  --offline                           外部APIを呼ばず、手入力値だけで計算
  --year <YYYY>                       地価公示・地価調査の対象年
  --from <YYYYQ> --to <YYYYQ>         取引事例の四半期範囲。例: 20241
  --tileRadius <n>                    周辺タイルも取得。0=対象タイルのみ
  --z <zoom>                          XYZタイルのズーム。既定14
  --landTypeCode <codes>              XPT001の種類コード。例: 01,02,07
  --maxComparableDistanceMeters <m>   類似取引に使う最大距離
`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
